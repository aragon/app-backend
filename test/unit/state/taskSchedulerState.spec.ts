import TaskScheduler from '@modules/taskScheduler'
import { TaskSchedulerState } from '@state//taskSchedulerState'
import { expect } from 'chai'

describe('Modules: TaskSchedulerState', () => {
  it('should enforce a singleton pattern', () => {
    const firstInstance = TaskSchedulerState.getInstance()
    const secondInstance = TaskSchedulerState.getInstance()
    expect(firstInstance).to.equal(secondInstance)
  })

  it('should extend TaskScheduler', () => {
    const schedulerState = TaskSchedulerState.getInstance()
    expect(schedulerState).to.be.instanceOf(TaskScheduler)
  })

  it('should inherit methods from TaskScheduler', () => {
    const schedulerState = TaskSchedulerState.getInstance()
    expect(schedulerState.startTask).to.be.a('function')
    expect(schedulerState.stopTask).to.be.a('function')
    expect(schedulerState.getTaskStatus).to.be.a('function')
  })
})
