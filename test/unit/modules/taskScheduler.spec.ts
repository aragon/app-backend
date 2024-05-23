import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import TaskScheduler from '@modules/taskScheduler'
import Utils from '@helpers/utils'

describe('Modules: TaskScheduler', () => {
  let sandbox: SinonSandbox
  let scheduler: TaskScheduler

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    scheduler = new TaskScheduler()
  })

  afterEach(() => {
    sandbox?.restore()
    scheduler.stopAllTasks()
  })

  it('should schedule and execute a task immediately and then at regular intervals', async () => {
    const taskFn = sandbox.fake(() => [[() => Promise.resolve('done')]])
    const errorFunction = sandbox.stub()

    await scheduler.startTask('testImmediate', {
      fn: taskFn,
      interval: 1000,
      onError: errorFunction,
    })
    expect(taskFn.calledOnce).to.be.true

    await Utils.wait(1010)

    expect(taskFn.calledTwice).to.be.true
  })

  it('should allow manual execution of a task via runTaskNow', async () => {
    const taskFn = sandbox.fake(() => [[() => Promise.resolve('done')]])
    const errorFunction = sandbox.stub()

    await scheduler.startTask('manualRun', {
      fn: taskFn,
      interval: 5000,
      onError: errorFunction,
    })

    await Utils.wait(10)
    expect(taskFn.calledOnce).to.be.true

    await scheduler.runTaskNow('manualRun')
    expect(taskFn.calledTwice).to.be.true
  })

  it('should handle errors correctly and call onError', async () => {
    const failingTask = () => Promise.reject(new Error('Task failure'))
    const taskFn = () => [[failingTask]]
    const errorFunction = sandbox.stub()

    await scheduler.startTask('errorTask', {
      fn: taskFn,
      interval: 1000,
      onError: errorFunction,
    })

    await Utils.wait(10)

    expect(errorFunction.calledOnce).to.be.true
    expect(errorFunction.calledWith(sandbox.match.instanceOf(Error))).to.be.true
    expect(errorFunction.firstCall.args[0].message).to.equal('Task failure')
  })

  it('should return the correct status of scheduled tasks', async () => {
    const taskFn = sandbox.fake(() => [[() => Promise.resolve('done')]])

    await scheduler.startTask('statusTest', {
      fn: taskFn,
      interval: 1000,
    })

    await Utils.wait(10)

    const status = scheduler.getTaskStatus()
    expect(status).to.deep.include({ key: 'statusTest', running: true })

    scheduler.stopTask('statusTest')

    await Utils.wait(10)

    const statusAfterStop = scheduler.getTaskStatus()
    expect(statusAfterStop).to.deep.include({ key: 'statusTest', running: false })
  })
})
