import logger from '@logger'
import { Models } from '@dbModels'
import { IEnumTaskStatus } from '@types'
import dayjs from '@helpers/dayjs'
import { throwError } from '@errors'
import { type ClientSession } from 'mongoose'

const llo = logger.logMeta.bind(null, { service: 'service:TaskScheduler' })

interface TaskOptions {
  fn: () => Record<string, any>[][]
  runNow: boolean
  stopOnError?: boolean
  interval: number
  checkInterval?: number
  onError?: (error: any) => void
  maxTaskRunsToKeep?: number // Keep only N most recent task runs
  taskRunRetentionDays?: number // Keep task runs for N days
}

interface TaskState {
  running: boolean
  intervalId: NodeJS.Timeout | null
}

class TaskScheduler {
  private tasks: Record<string, TaskState> = {}
  private taskRunners: Record<string, (forceRun?: boolean) => Promise<void>> = {}
  private cleanupIntervalId: NodeJS.Timeout | null = null

  constructor() {
    // Start cleanup process every hour
    this.startCleanupProcess()
  }

  private startCleanupProcess(): void {
    this.cleanupIntervalId = setInterval(
      async () => {
        try {
          await this.cleanupOldTaskRuns()
        } catch (error) {
          logger.error('Error cleaning up old task runs', llo({ error }))
        }
      },
      60 * 60 * 1000, // Every hour
    )
  }

  private async cleanupOldTaskRuns(): Promise<void> {
    const defaultRetentionDays = 7
    const cutoffDate = dayjs().utc().subtract(defaultRetentionDays, 'days').toDate()

    // Delete old task runs in batches to avoid memory issues
    const batchSize = 1000

    while (true) {
      // Find IDs to delete first
      const toDelete = await Models.TaskRun.find({
        createdAt: { $lt: cutoffDate },
      })
        .select('_id')
        .limit(batchSize)
        .lean()

      if (toDelete.length === 0) {
        break
      }

      const ids = toDelete.map(doc => doc._id)
      const result = await Models.TaskRun.deleteMany({
        _id: { $in: ids },
      })

      logger.info('Cleaned up old task runs', llo({ deletedCount: result.deletedCount }))

      if (toDelete.length < batchSize) {
        break
      }

      // Small delay to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  public getTaskStatus(): { key: string; running: boolean }[] {
    return Object.keys(this.tasks).map(key => ({
      key,
      running: this.tasks[key].running,
    }))
  }

  private async acquireLock(serviceName: string, session?: ClientSession): Promise<boolean> {
    try {
      const now = dayjs().utc().toDate()
      const lockExpiresAt = dayjs().utc().add(5, 'minutes').toDate() // Lock expires after 5 minutes

      // Try to acquire lock using findOneAndUpdate with atomic operation
      const result = await Models.TaskService.findOneAndUpdate(
        {
          serviceName,
          $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lt: now } }, { lockedUntil: null }],
        },
        {
          $set: {
            lockedUntil: lockExpiresAt,
            lockedBy: process.pid, // Store process ID for debugging
          },
        },
        {
          new: true,
          session,
        },
      )

      return !!result
    } catch (error) {
      logger.error('Error acquiring lock', llo({ serviceName, error }))
      return false
    }
  }

  private async releaseLock(serviceName: string, session?: ClientSession): Promise<void> {
    try {
      await Models.TaskService.findOneAndUpdate(
        { serviceName },
        {
          $unset: { lockedUntil: 1, lockedBy: 1 },
        },
        { session },
      )
    } catch (error) {
      logger.error('Error releasing lock', llo({ serviceName, error }))
    }
  }

  private async shouldRunTask(serviceName: string): Promise<boolean> {
    const taskService = await Models.TaskService.findOne({ serviceName })
    if (!taskService) {
      return true
    }
    const now = dayjs().utc()
    return now.isAfter(taskService.nextStartAt)
  }

  private async initializeTaskService(serviceName: string, interval: number): Promise<void> {
    const existingService = await Models.TaskService.findOne({ serviceName })
    const now = dayjs().utc()
    const nextStartAt = now.add(interval, 'millisecond').toDate()

    if (existingService) {
      await existingService.update({
        interval,
        // Only update nextStartAt if it doesn't exist or is in the past
        ...((!existingService.nextStartAt || dayjs(existingService.nextStartAt).isBefore(now)) && {
          nextStartAt,
        }),
      })
    } else {
      await Models.TaskService.create({
        serviceName,
        interval,
        nextStartAt,
      })
    }
  }

  private async updateNextStartAt(serviceName: string, interval: number, session?: ClientSession): Promise<void> {
    const now = dayjs().utc()
    const nextStartAt = now.add(interval, 'millisecond').toDate()

    await Models.TaskService.findOneAndUpdate(
      { serviceName },
      {
        $set: {
          nextStartAt,
          lastStartAt: now.toDate(),
        },
      },
      {
        new: true,
        upsert: true,
        session,
      },
    )
  }

  public async startTask(key: string, options: TaskOptions): Promise<void> {
    const {
      fn,
      interval,
      onError,
      runNow = false,
      stopOnError,
      checkInterval = 15 * 60 * 1000,
      maxTaskRunsToKeep = 100,
      taskRunRetentionDays = 7,
    } = options

    if (this.tasks[key]) {
      logger.warn('Task is already scheduled', llo({ key }))
      return
    }

    await this.initializeTaskService(key, interval)

    this.tasks[key] = {
      running: false,
      intervalId: null,
    }

    const taskRunner = async (forceRun: boolean = false) => {
      // Check if should run BEFORE acquiring lock
      if (!forceRun) {
        const shouldRun = await this.shouldRunTask(key)
        if (!shouldRun) {
          return
        }
      }

      // Try to acquire distributed lock
      const lockAcquired = await this.acquireLock(key)
      if (!lockAcquired) {
        logger.debug('Could not acquire lock, task already running', llo({ key }))
        return
      }

      const session = await Models.TaskService.startSession()

      try {
        await session.withTransaction(async () => {
          const runStartTime = dayjs().utc()
          let taskRun: any

          try {
            await this.updateNextStartAt(key, interval, session)

            taskRun = await Models.TaskRun.create(
              [
                {
                  serviceName: key,
                  startAt: runStartTime.toDate(),
                  tasks: fn()
                    .flat()
                    .map(
                      (task, index) =>
                        ({
                          taskName: Object.keys(task)[0],
                          params: task.params,
                          status: IEnumTaskStatus.PENDING,
                          position: index,
                          batchSize: task[Object.keys(task)[0]].batchSize,
                          concurrency: task[Object.keys(task)[0]].concurrency,
                        }) as any,
                    ),
                },
              ],
              { session },
            )

            taskRun = taskRun[0]

            const taskGroups = fn()
            for (const group of taskGroups) {
              await Promise.all(
                group.map(async task => {
                  const taskName = Object.keys(task)[0]
                  const serviceInstance = task[taskName]
                  const taskStartTime = dayjs().utc()

                  await Models.TaskRun.updateOne(
                    { _id: taskRun._id, 'tasks.taskName': taskName },
                    {
                      $set: {
                        'tasks.$.status': IEnumTaskStatus.RUNNING,
                        'tasks.$.startAt': taskStartTime.toDate(),
                      },
                    },
                    { session },
                  )

                  try {
                    if (typeof serviceInstance?.start === 'function') {
                      await serviceInstance.start(task?.params)
                    } else if (typeof serviceInstance === 'function') {
                      await serviceInstance(task?.params)
                    } else {
                      throwError('Invalid task instance', { taskName, serviceInstance })
                    }

                    const taskEndTime = dayjs().utc()
                    await Models.TaskRun.updateOne(
                      { _id: taskRun._id, 'tasks.taskName': taskName },
                      {
                        $set: {
                          'tasks.$.status': IEnumTaskStatus.DONE,
                          'tasks.$.endAt': taskEndTime.toDate(),
                        },
                      },
                      { session },
                    )
                  } catch (error: any) {
                    const taskEndTime = dayjs().utc()
                    await Models.TaskRun.updateOne(
                      { _id: taskRun._id, 'tasks.taskName': taskName },
                      {
                        $set: {
                          'tasks.$.status': IEnumTaskStatus.ERROR,
                          'tasks.$.endAt': taskEndTime.toDate(),
                          'tasks.$.error': error?.message || String(error),
                        },
                      },
                      { session },
                    )

                    logger.error(
                      'Task execution error',
                      llo({
                        key,
                        taskName,
                        error: error?.message || error,
                      }),
                    )

                    if (stopOnError) {
                      throw error
                    }
                  }
                }),
              )
            }

            if (taskRun?._id) {
              const runEndTime = dayjs().utc()
              await Models.TaskRun.updateOne(
                { _id: taskRun._id },
                { $set: { endAt: runEndTime.toDate() } },
                { session },
              )
            }
          } catch (error: any) {
            logger.error('Task unexpected error', llo({ key, error }))

            // Mark task run as failed if it exists
            if (taskRun?._id) {
              await Models.TaskRun.updateOne(
                { _id: taskRun._id },
                {
                  $set: {
                    endAt: dayjs().utc().toDate(),
                    error: error?.message || String(error),
                  },
                },
                { session },
              )
            }

            if (onError) {
              onError(error)
            }
            throw error // Re-throw to abort transaction
          }
        })
      } catch (error) {
        // Transaction failed
        logger.error('Transaction failed', llo({ key, error }))
      } finally {
        await session.endSession()
        await this.releaseLock(key)

        // Clean up AFTER transaction completes
        try {
          await this.cleanupServiceTaskRuns(key, maxTaskRunsToKeep, taskRunRetentionDays)
        } catch (cleanupError) {
          logger.error('Error cleaning up task runs', llo({ key, error: cleanupError }))
        }
      }
    }

    this.taskRunners[key] = taskRunner

    // Set task as running before initial execution
    this.tasks[key].running = true

    if (runNow) {
      await taskRunner(true) // Pass true to force run
    }

    this.tasks[key].intervalId = setInterval(async () => {
      await this.checkAndRunTasks(key)
    }, checkInterval)
  }

  private async cleanupServiceTaskRuns(serviceName: string, maxToKeep: number, retentionDays: number): Promise<void> {
    // Delete by date first
    const cutoffDate = dayjs().utc().subtract(retentionDays, 'days').toDate()
    await Models.TaskRun.deleteMany({
      serviceName,
      createdAt: { $lt: cutoffDate },
    })

    // Then keep only the most recent N runs
    const recentRuns = await Models.TaskRun.find({ serviceName })
      .sort({ createdAt: -1 })
      .skip(maxToKeep)
      .limit(1)
      .select('_id createdAt')

    if (recentRuns.length > 0) {
      await Models.TaskRun.deleteMany({
        serviceName,
        createdAt: { $lt: recentRuns[0].createdAt },
      })
    }
  }

  public async runTaskNow(key: string): Promise<void> {
    const taskRunner = this.taskRunners[key]
    if (taskRunner) {
      await taskRunner(true) // Force run
    }
  }

  public async checkAndRunTasks(key: string) {
    const taskRunner = this.taskRunners[key]
    if (taskRunner) {
      await taskRunner(false) // Normal run (will check schedule)
    }
  }

  public stopTask(key: string): void {
    if (this.tasks[key]) {
      this.tasks[key].running = false
      if (this.tasks[key].intervalId !== null) {
        clearInterval(this.tasks[key].intervalId)
        this.tasks[key].intervalId = null
      }
      delete this.taskRunners[key]
      logger.info(`${key} task stopped`, llo({}))
    } else {
      logger.info(`${key} task is not running`, llo({}))
    }
  }

  public stopAllTasks(): void {
    for (const key of Object.keys(this.tasks)) {
      this.stopTask(key)
    }

    // Stop cleanup process
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId)
      this.cleanupIntervalId = null
    }
  }

  public destroy(): void {
    this.stopAllTasks()
  }
}

export default TaskScheduler
