import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import TaskScheduler from '@modules/taskScheduler'
import Utils from '@helpers/utils'
import { Models } from '@dbModels'
import { IEnumTaskStatus } from '@types'
import logger from '@logger'

describe('Modules: TaskScheduler', () => {
  let sandbox: SinonSandbox
  let scheduler: TaskScheduler
  let testCounter = 0

  const getUniqueServiceName = (baseName: string) => {
    return `${baseName}-${Date.now()}-${++testCounter}`
  }

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    scheduler = new TaskScheduler()
  })

  afterEach(() => {
    sandbox?.restore()
    scheduler.stopAllTasks()
  })

  it('should run task immediately and at the next interval', async () => {
    const fakeService = {
      start: sandbox.stub().resolves(),
    }

    const failingService = {
      start: sandbox.stub().rejects(new Error('Service failed')),
    }

    const logFastTasks = [
      [{ logPluginRepoRegistry: failingService }, { logDaoRegistry: fakeService }],
      [{ logPluginSetupProcessor: fakeService }, { logDao: fakeService }],
      [{ logProposal: fakeService }, { logPluginSetting: fakeService }],
      [{ logMember: fakeService }],
    ]

    const serviceName = getUniqueServiceName('indexer')
    const taskOptions = {
      fn: () => [...logFastTasks],
      interval: 50,
      checkInterval: 20,
      runNow: true,
      stopOnError: false,
      onError: (error: any) => {
        console.log('error', error)
      },
    }

    const scheduler = new TaskScheduler()
    await scheduler.startTask(serviceName, taskOptions)

    await Utils.wait(10)
    expect(fakeService.start.callCount).to.be.at.least(6)
    expect(failingService.start.callCount).to.be.at.least(1)

    await Utils.wait(820)
    expect(fakeService.start.callCount).to.be.at.least(12)
    expect(failingService.start.callCount).to.be.at.least(2)

    scheduler.stopTask(serviceName)

    const status = scheduler.getTaskStatus()
    const task = status.find(task => task.key === serviceName)
    expect(task?.running).to.be.false

    // Wait a bit for any pending database operations to complete
    await Utils.wait(50)

    const serviceDb = await Models.TaskService.find({ serviceName })
    const tasksDb = await Models.TaskRun.find({ serviceName }).sort({ createdAt: -1 })
    expect(serviceDb.length).to.eq(1)
    expect(serviceDb[0].serviceName).to.eq(serviceName)
    expect(serviceDb[0].interval).to.eq(50)
    expect(serviceDb[0].nextStartAt).to.exist
    expect(serviceDb[0].lastStartAt).to.exist

    // Only error runs should remain (successful runs are deleted)
    expect(tasksDb.length).to.be.at.least(1)

    // Find a completed task run (one with endAt set)
    const completedRuns = tasksDb.filter(run => run.endAt)
    expect(completedRuns.length).to.be.at.least(1)

    const completedRun = completedRuns[0]
    expect(completedRun.serviceName).to.eq(serviceName)
    expect(completedRun.tasks.length).to.eq(7)

    // Find the error task
    const errorTask = completedRun.tasks.find(t => t.taskName === 'logPluginRepoRegistry')
    expect(errorTask).to.exist
    expect(errorTask.status).to.eq(IEnumTaskStatus.ERROR)
    expect(errorTask.position).to.eq(0)
    expect(errorTask.startAt).to.exist
    expect(errorTask.endAt).to.exist
  })

  it('should run task at least twice at the specified interval when runNow is false', async () => {
    const fakeService = {
      start: sandbox.stub().resolves(),
    }

    const failingService = {
      start: sandbox.stub().rejects(new Error('Service failed')),
    }

    const logFastTasks = [
      [{ logPluginRepoRegistry: failingService }, { logDaoRegistry: fakeService }],
      [{ logMember: fakeService }],
    ]

    const serviceName = getUniqueServiceName('indexer2')
    const taskOptions = {
      fn: () => [...logFastTasks],
      interval: 50,
      checkInterval: 20,
      runNow: false,
      stopOnError: false,
      onError: (error: any) => {
        console.log('error', error)
      },
    }

    const scheduler = new TaskScheduler()
    await scheduler.startTask(serviceName, taskOptions)

    await Utils.wait(800)
    expect(fakeService.start.callCount).to.be.at.least(4)
    expect(failingService.start.callCount).to.be.at.least(2)

    scheduler.stopTask(serviceName)

    const status = scheduler.getTaskStatus()
    const task = status.find(task => task.key === serviceName)
    expect(task?.running).to.be.false

    const serviceDb = await Models.TaskService.find({ serviceName })
    const tasksDb = await Models.TaskRun.find({ serviceName })
    expect(serviceDb.length).to.eq(1)
    expect(serviceDb[0].serviceName).to.eq(serviceName)
    expect(serviceDb[0].interval).to.eq(50)
    expect(serviceDb[0].nextStartAt).to.exist
    expect(serviceDb[0].lastStartAt).to.exist

    // Only error runs should remain
    expect(tasksDb.length).to.be.at.least(1)
    expect(tasksDb[0].serviceName).to.eq(serviceName)
    expect(tasksDb[0].tasks.length).to.eq(3)

    const task0 = tasksDb[0].tasks[0]
    expect(task0.taskName).to.eq('logPluginRepoRegistry')
    expect(task0.status).to.eq(IEnumTaskStatus.ERROR)
    expect(task0.position).to.eq(0)
    expect(task0.startAt).to.exist
    expect(task0.endAt).to.exist
  })

  it('should allow manual execution of a task via runTaskNow', async () => {
    const task1 = { start: sandbox.stub().resolves('done') }
    const taskFn = [[{ task1 }]]
    const errorFunction = sandbox.stub()
    const serviceName = getUniqueServiceName('manualRun')

    await scheduler.startTask(serviceName, {
      fn: () => [...taskFn],
      interval: 5000,
      runNow: true,
      onError: errorFunction,
    })

    await Utils.wait(10)
    expect(task1.start.calledOnce).to.be.true

    await scheduler.runTaskNow(serviceName)
    expect(task1.start.calledTwice).to.be.true
  })

  it('should handle errors correctly and call onError', async () => {
    const failingTask = { start: sandbox.stub().rejects(new Error('Task failure')) }
    const taskFn = () => [[{ failingTask }]]
    const errorFunction = sandbox.stub()
    const loggerErrorStub = sandbox.stub(logger, 'error')
    const serviceName = getUniqueServiceName('errorTask')

    await scheduler.startTask(serviceName, {
      fn: taskFn,
      interval: 50,
      runNow: true,
      stopOnError: true,
      onError: errorFunction,
    })

    await Utils.wait(100)

    expect(loggerErrorStub.called).to.be.true
    expect(errorFunction.called).to.be.true

    // Check if error function was called with an Error instance
    const errorCalls = errorFunction.getCalls()
    let foundTaskFailureError = false

    for (const call of errorCalls) {
      if (call.args[0] instanceof Error && call.args[0].message === 'Task failure') {
        foundTaskFailureError = true
        break
      }
    }

    expect(foundTaskFailureError).to.be.true
  })

  it('should return the correct status of scheduled tasks', async () => {
    const task1 = { start: sandbox.stub().resolves('done') }
    const taskFn = () => [[{ task1 }]]
    const serviceName = getUniqueServiceName('statusTest')

    await scheduler.startTask(serviceName, {
      fn: taskFn,
      interval: 50,
      runNow: true,
    })

    await Utils.wait(10)

    let status = scheduler.getTaskStatus()
    expect(status[0]).to.deep.include({ key: serviceName, running: true })

    scheduler.stopTask(serviceName)

    await Utils.wait(10)

    status = scheduler.getTaskStatus()
    expect(status).to.deep.include({ key: serviceName, running: false })
  })

  it('should prevent task duplication', async () => {
    const task1 = { start: sandbox.stub().resolves('done') }
    const taskFn = () => [[{ task1 }]]
    const errorFunction = sandbox.stub()
    const stubWarn = sandbox.stub(logger, 'warn')
    const serviceName = getUniqueServiceName('duplicateTest')

    await scheduler.startTask(serviceName, {
      fn: taskFn,
      interval: 50,
      runNow: true,
      onError: errorFunction,
    })

    await scheduler.startTask(serviceName, {
      fn: taskFn,
      interval: 50,
      runNow: true,
      onError: errorFunction,
    })

    expect(task1.start.calledOnce).to.be.true
    expect(stubWarn.calledOnce).to.be.true
  })

  it('should not run task if it is already running (locked in database)', async () => {
    const task1 = { start: sandbox.stub().resolves('done') }
    const taskFn = () => [[{ task1 }]]
    const errorFunction = sandbox.stub()
    const serviceName = getUniqueServiceName('lockTest')

    await scheduler.startTask(serviceName, {
      fn: taskFn,
      interval: 50,
      runNow: true,
      onError: errorFunction,
    })

    // Mock the lock to be already acquired
    sandbox.stub(scheduler as any, 'acquireLock').resolves(false)

    await scheduler.runTaskNow(serviceName)

    // Should still be called once from the initial runNow
    expect(task1.start.calledOnce).to.be.true
  })

  it('should return true if no task service exists for shouldRunTask', async () => {
    sandbox.stub(Models.TaskService, 'findOne').resolves(null)

    const result = await scheduler['shouldRunTask']('testService')
    expect(result).to.be.true
  })

  it('should update existing task service in initializeTaskService', async () => {
    const existingService = {
      nextStartAt: new Date(),
      update: sandbox.stub().resolves(),
    }
    sandbox.stub(Models.TaskService, 'findOne').resolves(existingService)

    await scheduler['initializeTaskService']('testService', 500)
    expect(existingService.update.calledOnce).to.be.true
    expect(existingService.update.firstCall.args[0].interval).to.eq(500)
  })

  it('should not run task if shouldRunTask returns false', async () => {
    const task1 = { start: sandbox.stub().resolves('done') }
    const taskFn = [[{ task1 }]]
    const serviceName = getUniqueServiceName('shouldRunTest')
    sandbox.stub(scheduler as any, 'shouldRunTask').resolves(false)

    await scheduler.startTask(serviceName, {
      fn: () => taskFn,
      interval: 5000,
      runNow: false,
      onError: sandbox.stub(),
    })

    await Utils.wait(10)

    expect(task1.start.called).to.be.false
  })

  it('should handle successful tasks by deleting them from database', async () => {
    const successfulTask = { start: sandbox.stub().resolves('done') }
    const taskFn = () => [[{ successfulTask }]]
    const serviceName = getUniqueServiceName('successTest')

    await scheduler.startTask(serviceName, {
      fn: taskFn,
      interval: 50,
      runNow: true,
      onError: sandbox.stub(),
    })

    await Utils.wait(100)

    // Check that successful runs are deleted
    const tasksDb = await Models.TaskRun.find({ serviceName })
    expect(tasksDb.length).to.eq(0) // All successful runs should be deleted
  })

  it('should keep error tasks in database', async () => {
    const failingTask = { start: sandbox.stub().rejects(new Error('Task failed')) }
    const taskFn = () => [[{ failingTask }]]
    const serviceName = getUniqueServiceName('errorKeepTest')

    await scheduler.startTask(serviceName, {
      fn: taskFn,
      interval: 50,
      runNow: true,
      stopOnError: false,
      onError: sandbox.stub(),
    })

    await Utils.wait(100)

    // Check that error runs are kept
    const tasksDb = await Models.TaskRun.find({ serviceName })
    expect(tasksDb.length).to.be.at.least(1)
    expect(tasksDb[0].tasks[0].status).to.eq(IEnumTaskStatus.ERROR)
    expect(tasksDb[0].tasks[0].error).to.include('Task failed')
  })

  it('should handle mixed success and error tasks correctly', async () => {
    const successTask = { start: sandbox.stub().resolves('done') }
    const failTask = { start: sandbox.stub().rejects(new Error('Failed')) }
    const taskFn = () => [[{ successTask }, { failTask }]]
    const serviceName = getUniqueServiceName('mixedTest')

    await scheduler.startTask(serviceName, {
      fn: taskFn,
      interval: 50,
      runNow: true,
      stopOnError: false,
      onError: sandbox.stub(),
    })

    await Utils.wait(100)

    // Should keep the run because it has errors
    const tasksDb = await Models.TaskRun.find({ serviceName })
    expect(tasksDb.length).to.be.at.least(1)

    const tasks = tasksDb[0].tasks
    const successTaskResult = tasks.find(t => t.taskName === 'successTask')
    const failTaskResult = tasks.find(t => t.taskName === 'failTask')

    expect(successTaskResult.status).to.eq(IEnumTaskStatus.DONE)
    expect(failTaskResult.status).to.eq(IEnumTaskStatus.ERROR)
  })
})
