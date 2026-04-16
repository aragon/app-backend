import TaskScheduler from '@modules/taskScheduler'

export class TaskSchedulerState extends TaskScheduler {
  private static instance: TaskSchedulerState

  private constructor() {
    super()
  }

  public static getInstance(): TaskSchedulerState {
    if (!TaskSchedulerState.instance) {
      TaskSchedulerState.instance = new TaskSchedulerState()
    }
    return TaskSchedulerState.instance
  }

  public reset(): void {
    this.stopAllTasks()
    this.tasks = {}
    this.taskRunners = {}
  }
}
