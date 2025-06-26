import logger from '@logger'
import { Models } from '@dbModels'
import { IEnumTaskStatus } from '@types'
import dayjs from '@helpers/dayjs'
import { throwError } from '@errors'

const llo = logger.logMeta.bind(null, { service: 'service:TaskScheduler' })

interface TaskOptions {
  fn: () => Record<string, any>[][]
  runNow: boolean
  stopOnError?: boolean
  interval: number
  checkInterval?: number
  onError?: (error: any) => void
}

interface TaskState {
  running: boolean
  intervalId: NodeJS.Timeout | null
}

class TaskScheduler {
  private tasks: Record<string, TaskState> = {}
  private taskRunners: Record<string, () => Promise<void>> = {}

  public getTaskStatus(): { key: string; running: boolean }[] {
    return Object.keys(this.tasks).map(key => ({
      key,
      running: this.tasks[key].running,
    }))
  }

  private async acquireLock(serviceName: string): Promise<boolean> {
    try {
      const now = dayjs().utc().toDate()
      const lockExpiresAt = dayjs().utc().add(5, 'minutes').toDate()

      const result = await Models.TaskService.findOneAndUpdate(
        {
          serviceName,
          $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lt: now } }, { lockedUntil: null }],
        },
        {
          $set: {
            lockedUntil: lockExpiresAt,
            lockedBy: process.pid,
          },
        },
        {
          new: true,
        },
      )

      return !!result
    } catch (error) {
      logger.error('Error acquiring lock', llo({ serviceName, error }))
      return false
    }
  }

  private async releaseLock(serviceName: string): Promise<void> {
    try {
      await Models.TaskService.findOneAndUpdate(
        { serviceName },
        {
          $unset: { lockedUntil: 1, lockedBy: 1 },
        },
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
      existingService.nextStartAt = nextStartAt
      await existingService.update({
        nextStartAt,
        interval,
      })
    } else {
      await Models.TaskService.create({
        serviceName,
        interval,
        nextStartAt,
      })
    }
  }

  private async updateNextStartAt(serviceName: string, interval: number): Promise<void> {
    const now = dayjs().utc()
    const nextStartAt = now.add(interval, 'millisecond').toDate()
    await Models.TaskService.findOneAndUpdate(
      { serviceName },
      { $set: { nextStartAt, lastStartAt: now.toDate() } },
      { upsert: true, new: true },
    )
  }

  public async startTask(key: string, options: TaskOptions): Promise<void> {
    const { fn, interval, onError, runNow = false, stopOnError, checkInterval = 15 * 60 * 1000 } = options

    if (this.tasks[key]) {
      logger.warn('Task is already scheduled', llo({ key }))
      return
    }

    await this.initializeTaskService(key, interval)

    this.tasks[key] = {
      running: false,
      intervalId: null,
    }

    const taskRunner = async () => {
      // Check if should run first
      const shouldRun = runNow || (await this.shouldRunTask(key))
      if (!shouldRun) {
        return
      }

      // Try to acquire distributed lock
      const lockAcquired = await this.acquireLock(key)
      if (!lockAcquired) {
        logger.debug('Could not acquire lock, task already running', llo({ key }))
        return
      }

      const runStartTime = dayjs().utc()
      let taskRun: any
      let hasErrors = false

      try {
        await this.updateNextStartAt(key, interval)

        // IMPORTANT: Use the same create syntax as the old version
        taskRun = await Models.TaskRun.create({
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
        })

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
                )
              } catch (error: any) {
                hasErrors = true
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
          await Models.TaskRun.updateOne({ _id: taskRun._id }, { $set: { endAt: runEndTime.toDate() } })
        }

        // Delete successful runs immediately
        if (taskRun?._id && !hasErrors) {
          await Models.TaskRun.deleteOne({ _id: taskRun._id })
          logger.debug('Deleted successful task run', llo({ key, taskRunId: taskRun._id }))
        } else if (hasErrors) {
          logger.info('Keeping task run due to errors', llo({ key, taskRunId: taskRun._id }))
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
          )
        }

        if (onError) {
          onError(error)
        }
      } finally {
        // Always release lock
        await this.releaseLock(key)
      }
    }

    this.taskRunners[key] = taskRunner

    if (runNow) {
      await taskRunner()
    }

    this.tasks[key].running = true

    this.tasks[key].intervalId = setInterval(async () => {
      await this.checkAndRunTasks(key)
    }, checkInterval)
  }

  public async runTaskNow(key: string): Promise<void> {
    const taskRunner = this.taskRunners[key]
    if (taskRunner) {
      await taskRunner()
    }
  }

  public async checkAndRunTasks(key: string) {
    const shouldRun = await this.shouldRunTask(key)
    if (shouldRun) {
      await this.runTaskNow(key)
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
  }

  public destroy(): void {
    this.stopAllTasks()
  }
}

export default TaskScheduler
