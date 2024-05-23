import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'service:TaskScheduler' })

export interface TaskOptions {
  fn: () => (() => Promise<any>)[][] // Each element in the array is a function that returns a promise
  interval: number
  onError?: (error: any) => void
}

interface TaskState {
  intervalId: NodeJS.Timeout | null
  running: boolean
  lock: boolean
}

class TaskScheduler {
  private tasks: Record<string, TaskState> = {}
  private taskRunners: Record<string, () => Promise<void>> = {}

  public getTaskStatus(): { key: string; running: boolean }[] {
    return Object.keys(this.tasks).map(key => ({
      key,
      running: this.tasks[key].running && !this.tasks[key].lock,
    }))
  }

  public async startTask(key: string, options: TaskOptions): Promise<void> {
    const { fn, interval, onError } = options

    if (this.tasks[key]?.intervalId) {
      // Prevent task duplication
      return
    }

    this.tasks[key] = {
      intervalId: null,
      running: false,
      lock: false,
    }

    const taskRunner = async () => {
      if (this.tasks[key].lock) {
        return
      }

      this.tasks[key].lock = true

      try {
        const taskGroups = fn() // Call fn to get the array of task groups
        for (const group of taskGroups) {
          await Promise.all(group.map(async task => task())).catch(error => {
            logger.error(`${key} group error`, llo({ error }))
            if (onError) {
              onError(error)
            }
          })
        }
      } catch (error) {
        logger.error(`${key} unexpected error`, llo({ error }))
        if (onError) {
          onError(error)
        }
      } finally {
        this.tasks[key].lock = false
      }
    }

    this.taskRunners[key] = taskRunner
    this.tasks[key].intervalId = setInterval(taskRunner, interval)
    await taskRunner() // Wait for the initial run to complete

    // Ensure the task is marked as running after initial run
    this.tasks[key].running = true
  }

  public async runTaskNow(key: string): Promise<void> {
    const taskRunner = this.taskRunners[key]
    if (taskRunner && !this.tasks[key].lock) {
      this.tasks[key].running = true
      await taskRunner()
      this.tasks[key].running = false
    }
  }

  public stopTask(key: string): void {
    if (this.tasks[key]?.intervalId) {
      clearInterval(this.tasks[key].intervalId!)
      this.tasks[key].intervalId = null // Mark the task as not running
      this.tasks[key].running = false
      logger.info(`${key} task stopped`, llo({}))
    }
  }

  public stopAllTasks(): void {
    Object.keys(this.tasks).forEach(key => {
      this.stopTask(key)
    })
  }
}

export default TaskScheduler
