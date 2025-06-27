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
    await scheduler.startTask('indexer', taskOptions)

    await Utils.wait(10)
    expect(fakeService.start.callCount).to.be.at.least(6)
    expect(failingService.start.callCount).to.be.at.least(1)

    await Utils.wait(820)
    expect(fakeService.start.callCount).to.be.at.least(12)
    expect(failingService.start.callCount).to.be.at.least(2)

    scheduler.stopTask('indexer')

    const status = scheduler.getTaskStatus()
    const task = status.find(task => task.key === 'indexer')
    expect(task?.running).to.be.false

    const serviceDb = await Models.TaskService.find({ serviceName: 'indexer' })
    const tasksDb = await Models.TaskRun.find({ serviceName: 'indexer' })
    expect(serviceDb.length).to.eq(1)
    expect(serviceDb[0].serviceName).to.eq('indexer')
    expect(serviceDb[0].interval).to.eq(50)
    expect(serviceDb[0].nextStartAt).to.exist
    expect(serviceDb[0].lastStartAt).to.exist

    expect(tasksDb.length).to.be.at.least(10)
    expect(tasksDb[0].serviceName).to.eq('indexer')
    expect(tasksDb[0].tasks.length).to.eq(7)

    const task0 = tasksDb[0].tasks[0]
    expect(task0.taskName).to.eq('logPluginRepoRegistry')
    expect(task0.status).to.eq(IEnumTaskStatus.ERROR)
    expect(task0.position).to.eq(0)
    expect(task0.startAt).to.exist
    expect(task0.endAt).to.exist
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
    await scheduler.startTask('indexer2', taskOptions)

    await Utils.wait(800)
    expect(fakeService.start.callCount).to.be.at.least(4)
    expect(failingService.start.callCount).to.be.at.least(2)

    scheduler.stopTask('indexer2')

    await Utils.wait(800)

    const status = scheduler.getTaskStatus()
    const task = status.find(task => task.key === 'indexer2')
    expect(task?.running).to.be.false

    const serviceDb = await Models.TaskService.find({ serviceName: 'indexer2' })
    const tasksDb = await Models.TaskRun.find({ serviceName: 'indexer2' })
    expect(serviceDb.length).to.eq(1)
    expect(serviceDb[0].serviceName).to.eq('indexer2')
    expect(serviceDb[0].interval).to.eq(50)
    expect(serviceDb[0].nextStartAt).to.exist
    expect(serviceDb[0].lastStartAt).to.exist

    expect(tasksDb.length).to.be.at.least(2)
    expect(tasksDb[0].serviceName).to.eq('indexer2')
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

    await scheduler.startTask('manualRun', {
      fn: () => [...taskFn],
      interval: 5000,
      runNow: true,
      onError: errorFunction,
    })

    await Utils.wait(10)
    expect(task1.start.calledOnce).to.be.true

    await scheduler.runTaskNow('manualRun')
    expect(task1.start.calledTwice).to.be.true
  })

  it('should handle errors correctly and call onError', async () => {
    const failingTask = { start: sandbox.stub().rejects(new Error('Task failure')) }
    const taskFn = () => [[{ failingTask }]]
    const errorFunction = sandbox.stub()
    const loggerErrorStub = sandbox.stub(logger, 'error')

    await scheduler.startTask('errorTask', {
      fn: taskFn,
      interval: 50,
      runNow: true,
      stopOnError: true,
      onError: errorFunction,
    })

    await Utils.wait(10)

    expect(loggerErrorStub.calledOnce).to.be.true
    expect(errorFunction.calledOnce).to.be.true
    expect(errorFunction.calledWith(sandbox.match.instanceOf(Error))).to.be.true
    expect(errorFunction.firstCall.args[0].message).to.equal('Task failure')
  })

  it('should return the correct status of scheduled tasks', async () => {
    const task1 = { start: sandbox.stub().resolves('done') }
    const taskFn = () => [[{ task1 }]]

    await scheduler.startTask('statusTest', {
      fn: taskFn,
      interval: 50,
      runNow: true,
    })

    await Utils.wait(10)

    let status = scheduler.getTaskStatus()
    expect(status[0]).to.deep.include({ key: 'statusTest', running: true })

    scheduler.stopTask('statusTest')

    await Utils.wait(10)

    status = scheduler.getTaskStatus()
    expect(status).to.deep.include({ key: 'statusTest', running: false })
  })

  it('should prevent task duplication', async () => {
    const task1 = { start: sandbox.stub().resolves('done') }
    const taskFn = () => [[{ task1 }]]
    const errorFunction = sandbox.stub()
    const stubWarn = sandbox.stub(logger, 'warn')

    await scheduler.startTask('duplicateTest', {
      fn: taskFn,
      interval: 50,
      runNow: true,
      onError: errorFunction,
    })

    await scheduler.startTask('duplicateTest', {
      fn: taskFn,
      interval: 50,
      runNow: true,
      onError: errorFunction,
    })

    expect(task1.start.calledOnce).to.be.true
    expect(stubWarn.calledOnce).to.be.true
  })

  it('should not run task if it is locked', async () => {
    const task1 = { start: sandbox.stub().resolves('done') }
    const taskFn = () => [[{ task1 }]]
    const errorFunction = sandbox.stub()

    await scheduler.startTask('lockTest', {
      fn: taskFn,
      interval: 50,
      runNow: true,
      onError: errorFunction,
    })

    scheduler['tasks']['lockTest'].lock = true

    await scheduler.runTaskNow('lockTest')

    expect(task1.start.calledOnce).to.be.true

    scheduler['tasks']['lockTest'].lock = false
  })

  it('should not execute task when it is locked', async () => {
    const task1 = { start: sandbox.stub().resolves('Task completed') }
    const taskFn = () => [[{ task1 }]]
    const errorFunction = sandbox.stub()

    await scheduler.startTask('lockedTask', {
      fn: taskFn,
      interval: 50,
      runNow: true,
      onError: errorFunction,
    })

    await Utils.wait(10)

    scheduler['tasks']['lockedTask'].lock = true

    await scheduler.runTaskNow('lockedTask')

    expect(task1.start.calledOnce).to.be.true

    scheduler['tasks']['lockedTask'].lock = false
    await scheduler.runTaskNow('lockedTask')
    expect(task1.start.calledTwice).to.be.true
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

    const result = await scheduler['initializeTaskService']('testService', 500)
    expect(result).to.eq(existingService)
    expect(existingService.update.calledOnce).to.be.true
    expect(existingService.update.firstCall.args[0].nextStartAt).to.exist
    expect(existingService.update.firstCall.args[0].interval).to.eq(500)
  })

  it('should not run task if it is locked in taskRunner', async () => {
    const task1 = { start: sandbox.stub().resolves('done') }
    const taskFn = [[{ task1 }]]

    await scheduler.startTask('lockedTest', {
      fn: () => taskFn,
      interval: 5000,
      runNow: true,
      onError: sandbox.stub(),
    })

    scheduler['tasks']['lockedTest'].lock = true
    const taskRunner = scheduler['taskRunners']['lockedTest']
    await taskRunner()

    expect(task1.start.calledOnce).to.be.true
  })

  it('should not run task if shouldRunTask returns false', async () => {
    const task1 = { start: sandbox.stub().resolves('done') }
    const taskFn = [[{ task1 }]]
    sandbox.stub(scheduler as any, 'shouldRunTask').resolves(false)

    await scheduler.startTask('shouldRunTest', {
      fn: () => taskFn,
      interval: 5000,
      runNow: false,
      onError: sandbox.stub(),
    })

    const taskRunner = scheduler['taskRunners']['shouldRunTest']
    await taskRunner()

    expect(task1.start.called).to.be.false
  })
})
