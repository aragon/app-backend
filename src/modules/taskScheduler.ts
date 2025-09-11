import logger from '@logger'
import { Models } from '@dbModels'
import { IEnumTaskStatus } from '@types'
import dayjs from '@helpers/dayjs'
import { throwError } from '@errors'
import MongoRetryHelper from '@helpers/mongoRetry'
import * as os from 'os'

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
  private readonly hostname: string = os.hostname()
  private readonly instanceId: string = `${os.hostname()}-${process.pid}`
  private shutdownHandlersRegistered: boolean = false

  public getTaskStatus(): { key: string; running: boolean }[] {
    return Object.keys(this.tasks).map(key => ({
      key,
      running: this.tasks[key].running,
    }))
  }

  private async acquireLock(serviceName: string): Promise<boolean> {
    const now = dayjs().utc().toDate()
    const lockExpiresAt = dayjs().utc().add(5, 'minutes').toDate()

    try {
      // First, check if there's an existing lock held by a potentially dead process
      const existingLock = await Models.TaskService.findOne({ serviceName })

      if (existingLock?.lockedBy && existingLock.lockedUntil && dayjs(existingLock.lockedUntil).isAfter(now)) {
        // Check if the process holding the lock is still alive
        const isProcessAlive = this.isProcessAlive(existingLock.lockedBy)

        if (!isProcessAlive) {
          // Process doesn't exist, clear the stale lock
          logger.warn(
            'Clearing stale lock from dead process',
            llo({
              serviceName,
              deadPid: existingLock.lockedBy,
              currentPid: process.pid,
              instanceId: this.instanceId,
            }),
          )

          await Models.TaskService.findOneAndUpdate(
            { serviceName },
            { $unset: { lockedUntil: 1, lockedBy: 1, lockedAt: 1, hostname: 1, instanceId: 1 } },
          )
        } else {
          // Process exists, lock is valid
          logger.debug(
            'Lock held by active process',
            llo({
              serviceName,
              pid: existingLock.lockedBy,
              expiresAt: existingLock.lockedUntil,
            }),
          )
          return false
        }
      }

      // Now try to acquire the lock
      const result = await MongoRetryHelper.retryOperation(
        () =>
          Models.TaskService.findOneAndUpdate(
            {
              serviceName,
              $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lt: now } }, { lockedUntil: null }],
            },
            {
              $set: {
                lockedUntil: lockExpiresAt,
                lockedBy: process.pid,
                lockedAt: now,
                hostname: this.hostname,
                instanceId: this.instanceId,
              },
            },
            {
              new: true,
            },
          ),
        {
          maxRetries: 2,
          retryDelay: 500,
        },
      )

      if (result) {
        logger.debug(
          'Lock acquired successfully',
          llo({
            serviceName,
            pid: process.pid,
            instanceId: this.instanceId,
            expiresAt: lockExpiresAt,
          }),
        )
      }

      return !!result
    } catch (error) {
      logger.error('Error acquiring lock', llo({ serviceName, error }))
      return false
    }
  }

  private async releaseLock(serviceName: string): Promise<void> {
    await MongoRetryHelper.retryOperation(
      () =>
        Models.TaskService.findOneAndUpdate(
          { serviceName },
          {
            $unset: { lockedUntil: 1, lockedBy: 1, lockedAt: 1, hostname: 1, instanceId: 1 },
          },
        ),
      {
        maxRetries: 3,
        retryDelay: 1000,
        onRetry: (error, attempt) => {
          logger.warn(
            'MongoDB connection lost, retrying lock release',
            llo({
              serviceName,
              attempt,
              error: error?.message,
            }),
          )
        },
      },
    ).catch(error => {
      logger.error('Error releasing lock', llo({ serviceName, error }))
    })
  }

  private async shouldRunTask(serviceName: string): Promise<boolean> {
    try {
      const taskService = await MongoRetryHelper.retryOperation(() => Models.TaskService.findOne({ serviceName }), {
        maxRetries: 2,
        retryDelay: 500,
      })
      if (!taskService) {
        return true
      }
      const now = dayjs().utc()
      return now.isAfter((taskService as any).nextStartAt)
    } catch (error) {
      logger.warn('Error checking if task should run, defaulting to true', llo({ serviceName, error }))
      return true
    }
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

    await MongoRetryHelper.safeUpdate(
      () =>
        Models.TaskService.findOneAndUpdate(
          { serviceName },
          { $set: { nextStartAt, lastStartAt: now.toDate() } },
          { upsert: true, new: true },
        ),
      { serviceName },
    )
  }

  private isProcessAlive(pid: number): boolean {
    try {
      // Send signal 0 to check if process exists (doesn't actually send a signal)
      process.kill(pid, 0)
      return true
    } catch (err: any) {
      // ESRCH means process doesn't exist, EPERM means it exists but we don't have permission
      return err.code === 'EPERM'
    }
  }

  private async releaseAllLocks(): Promise<void> {
    const taskNames = Object.keys(this.tasks)
    if (taskNames.length === 0) return

    logger.info(
      'Releasing all locks on shutdown',
      llo({
        tasks: taskNames,
        pid: process.pid,
        instanceId: this.instanceId,
      }),
    )

    await Promise.all(
      taskNames.map(taskName =>
        Models.TaskService.findOneAndUpdate(
          { serviceName: taskName, lockedBy: process.pid },
          { $unset: { lockedUntil: 1, lockedBy: 1, lockedAt: 1, hostname: 1, instanceId: 1 } },
        ).catch(err => logger.error('Error releasing lock on shutdown', llo({ taskName, error: err }))),
      ),
    )
  }

  private registerShutdownHandlers(): void {
    if (this.shutdownHandlersRegistered) return

    const gracefulShutdown = async (signal: string) => {
      logger.info('Received shutdown signal, cleaning up...', llo({ signal, pid: process.pid }))

      // Stop all tasks
      this.stopAllTasks()

      // Release all locks
      await this.releaseAllLocks()

      logger.info('Shutdown cleanup complete', llo({ signal }))
      process.exit(0)
    }

    // Register handlers for different shutdown signals
    process.on('SIGTERM', async () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', async () => gracefulShutdown('SIGINT'))
    process.on('beforeExit', async () => gracefulShutdown('beforeExit'))

    // Handle unexpected exits
    process.on('uncaughtException', async error => {
      logger.error('Uncaught exception, releasing locks', llo({ error }))
      await this.releaseAllLocks()
    })

    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('Unhandled rejection, releasing locks', llo({ reason, promise }))
      await this.releaseAllLocks()
    })

    this.shutdownHandlersRegistered = true
    logger.debug('Shutdown handlers registered', llo({ pid: process.pid }))
  }

  public async startTask(key: string, options: TaskOptions): Promise<void> {
    // Register shutdown handlers on first task start
    this.registerShutdownHandlers()
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
      // Track if lock was acquired
      let lockAcquired = false

      // Check if should run first
      const shouldRun = runNow || (await this.shouldRunTask(key))
      if (!shouldRun) {
        return
      }

      // Try to acquire distributed lock
      lockAcquired = await this.acquireLock(key)
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
        taskRun = await MongoRetryHelper.retryOperation(
          () =>
            Models.TaskRun.create({
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
            }),
          {
            maxRetries: 2,
            retryDelay: 500,
          },
        )

        const taskGroups = fn()
        for (const group of taskGroups) {
          await Promise.all(
            group.map(async task => {
              const taskName = Object.keys(task)[0]
              const serviceInstance = task[taskName]
              const taskStartTime = dayjs().utc()

              await MongoRetryHelper.safeUpdate(
                () =>
                  Models.TaskRun.updateOne(
                    { _id: taskRun._id, 'tasks.taskName': taskName },
                    {
                      $set: {
                        'tasks.$.status': IEnumTaskStatus.RUNNING,
                        'tasks.$.startAt': taskStartTime.toDate(),
                      },
                    },
                  ),
                { taskName, taskRunId: taskRun._id },
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
                await MongoRetryHelper.safeUpdate(
                  () =>
                    Models.TaskRun.updateOne(
                      { _id: taskRun._id, 'tasks.taskName': taskName },
                      {
                        $set: {
                          'tasks.$.status': IEnumTaskStatus.DONE,
                          'tasks.$.endAt': taskEndTime.toDate(),
                        },
                      },
                    ),
                  { taskName, taskRunId: taskRun._id },
                )
              } catch (error: any) {
                hasErrors = true
                const taskEndTime = dayjs().utc()
                await MongoRetryHelper.safeUpdate(
                  () =>
                    Models.TaskRun.updateOne(
                      { _id: taskRun._id, 'tasks.taskName': taskName },
                      {
                        $set: {
                          'tasks.$.status': IEnumTaskStatus.ERROR,
                          'tasks.$.endAt': taskEndTime.toDate(),
                          'tasks.$.error': error?.message || String(error),
                        },
                      },
                    ),
                  { taskName, taskRunId: taskRun._id },
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
          await MongoRetryHelper.safeUpdate(
            () => Models.TaskRun.updateOne({ _id: taskRun._id }, { $set: { endAt: runEndTime.toDate() } }),
            { serviceName: key, taskRunId: taskRun._id },
          )
        }

        // Delete successful runs immediately
        if (taskRun?._id && !hasErrors) {
          const deleted = await MongoRetryHelper.safeUpdate(() => Models.TaskRun.deleteOne({ _id: taskRun._id }), {
            serviceName: key,
            taskRunId: taskRun._id,
          })
          if (deleted) {
            logger.debug('Deleted successful task run', llo({ key, taskRunId: taskRun._id }))
          } else {
            logger.warn('Failed to delete successful task run', llo({ key, taskRunId: taskRun._id }))
          }
        } else if (hasErrors) {
          logger.info('Keeping task run due to errors', llo({ key, taskRunId: taskRun._id }))
        }
      } catch (error: any) {
        logger.error('Task unexpected error', llo({ key, error }))

        // Mark task run as failed if it exists
        if (taskRun?._id) {
          await MongoRetryHelper.safeUpdate(
            () =>
              Models.TaskRun.updateOne(
                { _id: taskRun._id },
                {
                  $set: {
                    endAt: dayjs().utc().toDate(),
                    error: error?.message || String(error),
                  },
                },
              ),
            { serviceName: key, taskRunId: taskRun._id },
          )
        }

        if (onError) {
          onError(error)
        }
      } finally {
        // Release lock only if it was acquired
        if (lockAcquired) {
          await this.releaseLock(key)
        }
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
