import { Models } from '@dbModels'
import dayjs from '@helpers/dayjs'
import Utils from '@helpers/utils'
import logger from '@logger'
import TaskScheduler from '@modules/taskScheduler'
import { IEnumTaskStatus } from '@types'
import { expect } from 'chai'
import * as os from 'os'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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

    await Utils.wait(100) // Reduced from 820ms - just enough for 2 intervals
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
      interval: 100,
      checkInterval: 30,
      runNow: false,
      stopOnError: false,
      onError: (error: any) => {
        console.log('error', error)
      },
    }

    const scheduler = new TaskScheduler()
    await scheduler.startTask(serviceName, taskOptions)

    await Utils.wait(350) // Wait long enough for at least 3 intervals
    expect(fakeService.start.callCount).to.be.at.least(2) // Should run at least twice
    expect(failingService.start.callCount).to.be.at.least(2)

    scheduler.stopTask(serviceName)

    await Utils.wait(50) // Reduced from 800ms - just enough to verify stop

    const status = scheduler.getTaskStatus()
    const task = status.find(task => task.key === serviceName)
    expect(task?.running).to.be.false

    const serviceDb = await Models.TaskService.find({ serviceName })
    const tasksDb = await Models.TaskRun.find({ serviceName })
    expect(serviceDb.length).to.eq(1)
    expect(serviceDb[0].serviceName).to.eq(serviceName)
    expect(serviceDb[0].interval).to.eq(100)
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

  it('should handle error in acquireLock', async () => {
    const errorStub = sandbox.stub(logger, 'error')
    sandbox.stub(Models.TaskService, 'findOneAndUpdate').rejects(new Error('Database error'))

    const result = await (scheduler as any).acquireLock('test-service')

    expect(result).to.be.false
    expect(errorStub.calledOnce).to.be.true
    expect(errorStub.calledWith('Error acquiring lock' as any)).to.be.true
  })

  it('should handle error in releaseLock', async () => {
    const errorStub = sandbox.stub(logger, 'error')
    sandbox.stub(Models.TaskService, 'findOneAndUpdate').rejects(new Error('Database error'))

    await (scheduler as any).releaseLock('test-service')

    expect(errorStub.calledOnce).to.be.true
    expect(errorStub.calledWith('Error releasing lock' as any)).to.be.true
  })

  it('should return early when shouldRunTask returns false', async () => {
    const serviceName = getUniqueServiceName('shouldNotRun')
    const taskFn = sandbox.stub().returns([[{ testTask: { start: sandbox.stub() } }]])

    // Stub shouldRunTask to return false
    sandbox.stub(scheduler as any, 'shouldRunTask').resolves(false)
    const acquireLockStub = sandbox.stub(scheduler as any, 'acquireLock')

    await scheduler.startTask(serviceName, {
      fn: taskFn,
      interval: 1000,
      runNow: false,
    })

    // Manually trigger the task runner
    const taskRunner = (scheduler as any).taskRunners[serviceName]
    if (taskRunner) {
      await taskRunner()
    }

    // Verify lock was never acquired since task shouldn't run
    expect(acquireLockStub.called).to.be.false
  })

  it('should handle callable function as service instance', async () => {
    const callableFunction = sandbox.stub().resolves('function result')
    const taskFn = () => [[{ callableTask: callableFunction }]]
    const serviceName = getUniqueServiceName('callableTest')

    await scheduler.startTask(serviceName, {
      fn: taskFn,
      interval: 50,
      runNow: true,
    })

    await Utils.wait(100)

    expect(callableFunction.calledOnce).to.be.true

    // Note: Successful tasks are deleted immediately, so we can't check the DB
    // The fact that callableFunction was called successfully is sufficient
  })

  it('should throw error for invalid task instance', async () => {
    const invalidInstance = 'not a function or object with start'
    const taskFn = () => [[{ invalidTask: invalidInstance }]]
    const serviceName = getUniqueServiceName('invalidTest')
    const errorStub = sandbox.stub(logger, 'error')

    await scheduler.startTask(serviceName, {
      fn: taskFn,
      interval: 50,
      runNow: true,
      stopOnError: false,
    })

    await Utils.wait(100)

    // Check that error was logged
    expect(errorStub.called).to.be.true

    // Check task failed
    const tasksDb = await Models.TaskRun.find({ serviceName })
    expect(tasksDb[0].tasks[0].status).to.eq(IEnumTaskStatus.ERROR)
    expect(tasksDb[0].tasks[0].error).to.include('Invalid task instance')
  })

  it('should log message when trying to stop a task that is not running', () => {
    const infoStub = sandbox.stub(logger, 'info')

    scheduler.stopTask('non-existent-task')

    expect(infoStub.calledWith('non-existent-task task is not running' as any)).to.be.true
  })

  it('should properly destroy scheduler', () => {
    const serviceName1 = getUniqueServiceName('destroy1')
    const serviceName2 = getUniqueServiceName('destroy2')

    // Start multiple tasks
    scheduler.startTask(serviceName1, {
      fn: () => [[{ task1: { start: sandbox.stub() } }]],
      interval: 1000,
      runNow: false,
    })

    scheduler.startTask(serviceName2, {
      fn: () => [[{ task2: { start: sandbox.stub() } }]],
      interval: 1000,
      runNow: false,
    })

    const stopAllTasksSpy = sandbox.spy(scheduler, 'stopAllTasks')

    scheduler.destroy()

    expect(stopAllTasksSpy.calledOnce).to.be.true
    expect(Object.keys((scheduler as any).tasks)).to.have.length(0)
  })

  it('should handle task with params correctly', async () => {
    const taskWithParams = {
      start: sandbox.stub().resolves(),
    }
    const params = { testParam: 'value' }
    // Include params in the task definition
    const taskFn = () => [[{ taskWithParams, params }]]
    const serviceName = getUniqueServiceName('paramsTest')

    const taskOptions = {
      fn: taskFn,
      interval: 50,
      runNow: true,
    }

    await scheduler.startTask(serviceName, taskOptions)

    await Utils.wait(100)

    expect(taskWithParams.start.calledWith(params)).to.be.true
  })

  describe('Lock Management', () => {
    it('should acquire and release lock correctly', async () => {
      const serviceName = getUniqueServiceName('lockLifecycle')

      let taskStarted = false
      let taskCompleted = false

      const task1 = {
        start: sandbox.stub().callsFake(async () => {
          taskStarted = true

          // Check lock while task is running
          const taskServiceDuring = await Models.TaskService.findOne({ serviceName })
          expect(taskServiceDuring).to.exist
          expect(taskServiceDuring.lockedBy).to.eq(process.pid)
          expect(taskServiceDuring.lockedUntil).to.exist
          expect(taskServiceDuring.lockedAt).to.exist
          expect(taskServiceDuring.hostname).to.eq(os.hostname())
          expect(taskServiceDuring.instanceId).to.eq(`${os.hostname()}-${process.pid}`)

          // Check that lock expiration is in the future
          const now = dayjs.utc()
          const lockExpiry = dayjs(taskServiceDuring.lockedUntil)
          expect(lockExpiry.isAfter(now)).to.be.true

          // Simulate some work
          await Utils.wait(100)

          taskCompleted = true
          return 'done'
        }),
      }
      const taskFn = () => [[{ task1 }]]

      await scheduler.startTask(serviceName, {
        fn: taskFn,
        interval: 5000,
        runNow: true,
      })

      // Wait for task to complete and lock to be released
      await Utils.wait(200)

      // Check that task was executed
      expect(taskStarted).to.be.true
      expect(taskCompleted).to.be.true
      expect(task1.start.called).to.be.true

      // Check that lock was released after task completion
      const taskServiceAfter = await Models.TaskService.findOne({ serviceName })
      expect(taskServiceAfter).to.exist
      expect(taskServiceAfter.lockedBy).to.be.undefined
      expect(taskServiceAfter.lockedUntil).to.be.undefined
      expect(taskServiceAfter.lockedAt).to.be.undefined
      expect(taskServiceAfter.hostname).to.be.undefined
      expect(taskServiceAfter.instanceId).to.be.undefined

      scheduler.stopTask(serviceName)
    })

    it('should clear stale lock from dead process', async () => {
      const serviceName = getUniqueServiceName('staleLock')
      const deadPid = 999999 // Non-existent process

      // Create a task with a stale lock from a dead process
      await Models.TaskService.create({
        serviceName,
        interval: 5000,
        nextStartAt: dayjs.utc().subtract(1, 'minute').toDate(),
        lockedUntil: dayjs.utc().add(5, 'minutes').toDate(),
        lockedBy: deadPid,
        lockedAt: dayjs.utc().subtract(1, 'minute').toDate(),
        hostname: 'dead-host',
        instanceId: `dead-host-${deadPid}`,
      })

      // Stub logger to check if warning is logged
      const loggerWarnStub = sandbox.stub(logger, 'warn')
      const loggerDebugStub = sandbox.stub(logger, 'debug')

      let taskExecuted = false
      const task1 = {
        start: sandbox.stub().callsFake(async () => {
          taskExecuted = true

          // Verify lock is now held by current process
          const taskService = await Models.TaskService.findOne({ serviceName })
          expect(taskService.lockedBy).to.eq(process.pid)
          expect(taskService.hostname).to.eq(os.hostname())

          return 'done'
        }),
      }
      const taskFn = () => [[{ task1 }]]

      await scheduler.startTask(serviceName, {
        fn: taskFn,
        interval: 5000,
        runNow: true,
      })

      await Utils.wait(100)

      // Check that stale lock warning was logged
      const warnCalls = loggerWarnStub.getCalls()
      const foundStaleLockWarning = warnCalls.some(call => {
        const firstArg = call.args[0] as unknown as string
        return firstArg && typeof firstArg === 'string' && firstArg.includes('Clearing stale lock from dead process')
      })
      expect(foundStaleLockWarning).to.be.true

      // Check that new lock was acquired
      const debugCalls = loggerDebugStub.getCalls()
      const foundLockAcquired = debugCalls.some(call => {
        const firstArg = call.args[0] as unknown as string
        return firstArg && typeof firstArg === 'string' && firstArg.includes('Lock acquired successfully')
      })
      expect(foundLockAcquired).to.be.true

      // Check that task was executed
      expect(taskExecuted).to.be.true

      scheduler.stopTask(serviceName)
    })

    it('should not acquire lock if another process holds it', async () => {
      const serviceName = getUniqueServiceName('activeLock')
      const otherPid = 1 // PID 1 always exists (init process)

      // Create a task with an active lock from another process
      await Models.TaskService.create({
        serviceName,
        interval: 5000,
        nextStartAt: dayjs.utc().subtract(1, 'minute').toDate(),
        lockedUntil: dayjs.utc().add(5, 'minutes').toDate(),
        lockedBy: otherPid,
        hostname: 'other-host',
        instanceId: `other-host-${otherPid}`,
      })

      const loggerDebugStub = sandbox.stub(logger, 'debug')

      const task1 = { start: sandbox.stub().resolves('done') }
      const taskFn = () => [[{ task1 }]]

      await scheduler.startTask(serviceName, {
        fn: taskFn,
        interval: 5000,
        runNow: true,
      })

      await Utils.wait(100)

      // Check that lock held message was logged
      const debugCalls = loggerDebugStub.getCalls()
      const foundLockHeld = debugCalls.some(call => {
        const firstArg = call.args[0] as unknown as string
        return (
          firstArg &&
          firstArg.includes &&
          (firstArg.includes('Lock held by active process') || firstArg.includes('Could not acquire lock'))
        )
      })
      expect(foundLockHeld).to.be.true

      // Task should not have been executed
      expect(task1.start.called).to.be.false

      // Verify lock is still held by other process
      const taskService = await Models.TaskService.findOne({ serviceName })
      expect(taskService.lockedBy).to.eq(otherPid)

      scheduler.stopTask(serviceName)
    })

    it('should release lock after task completes', async () => {
      const serviceName = getUniqueServiceName('releaseLock')

      let lockCheckResolve: any
      const lockCheckPromise = new Promise(resolve => {
        lockCheckResolve = resolve
      })

      const task1 = {
        start: sandbox.stub().callsFake(async () => {
          // Verify lock is acquired while task is running
          const taskService = await Models.TaskService.findOne({ serviceName })
          expect(taskService.lockedBy).to.eq(process.pid)
          lockCheckResolve()
          return 'done'
        }),
      }
      const taskFn = () => [[{ task1 }]]

      await scheduler.startTask(serviceName, {
        fn: taskFn,
        interval: 5000,
        runNow: true,
      })

      await lockCheckPromise
      await Utils.wait(50) // Wait for lock to be released

      // Verify lock is released after task execution completes
      const taskServiceAfter = await Models.TaskService.findOne({ serviceName })
      expect(taskServiceAfter).to.exist
      expect(taskServiceAfter.lockedBy).to.be.undefined
      expect(taskServiceAfter.lockedUntil).to.be.undefined

      scheduler.stopTask(serviceName)
    })

    it('should handle expired locks correctly', async () => {
      const serviceName = getUniqueServiceName('expiredLock')

      // Create a task with an expired lock
      await Models.TaskService.create({
        serviceName,
        interval: 5000,
        nextStartAt: dayjs.utc().subtract(1, 'minute').toDate(),
        lockedUntil: dayjs.utc().subtract(10, 'minutes').toDate(), // Expired
        lockedBy: 88888,
        lockedAt: dayjs.utc().subtract(15, 'minutes').toDate(),
        hostname: 'expired-host',
        instanceId: 'expired-host-88888',
      })

      let taskExecuted = false
      const task1 = {
        start: sandbox.stub().callsFake(async () => {
          taskExecuted = true

          // Verify new lock was acquired
          const taskService = await Models.TaskService.findOne({ serviceName })
          expect(taskService.lockedBy).to.eq(process.pid)
          expect(taskService.hostname).to.eq(os.hostname())

          // New lock should be in the future
          const now = dayjs.utc()
          const lockExpiry = dayjs(taskService.lockedUntil)
          expect(lockExpiry.isAfter(now)).to.be.true

          return 'done'
        }),
      }
      const taskFn = () => [[{ task1 }]]

      await scheduler.startTask(serviceName, {
        fn: taskFn,
        interval: 5000,
        runNow: true,
      })

      await Utils.wait(100)

      // Task should have been executed
      expect(taskExecuted).to.be.true

      scheduler.stopTask(serviceName)
    })

    it('should include lock information in TaskService document', async () => {
      const serviceName = getUniqueServiceName('lockInfo')

      const task1 = {
        start: sandbox.stub().callsFake(async () => {
          // Check that all lock information fields are present
          const taskService = await Models.TaskService.findOne({ serviceName })
          expect(taskService.lockedBy).to.eq(process.pid)
          expect(taskService.lockedAt).to.exist
          expect(taskService.lockedUntil).to.exist
          expect(taskService.hostname).to.eq(os.hostname())
          expect(taskService.instanceId).to.eq(`${os.hostname()}-${process.pid}`)

          // Verify lockedAt is recent
          const lockedAt = dayjs(taskService.lockedAt)
          const now = dayjs.utc()
          const diffSeconds = now.diff(lockedAt, 'seconds')
          expect(diffSeconds).to.be.lessThan(5)

          return 'done'
        }),
      }
      const taskFn = () => [[{ task1 }]]

      await scheduler.startTask(serviceName, {
        fn: taskFn,
        interval: 5000,
        runNow: true,
      })

      await Utils.wait(100)

      scheduler.stopTask(serviceName)
    })

    it('should handle concurrent lock attempts correctly', async () => {
      const serviceName = getUniqueServiceName('concurrent')

      let task1Executed = false
      let task2Executed = false

      // First task that holds lock for a while
      const task1 = {
        start: sandbox.stub().callsFake(async () => {
          task1Executed = true

          // Verify lock is held by scheduler1
          const taskService = await Models.TaskService.findOne({ serviceName })
          expect(taskService.lockedBy).to.eq(process.pid)

          // Hold the lock for a bit
          await Utils.wait(200)
          return 'done'
        }),
      }
      const taskFn1 = () => [[{ task1 }]]

      // Second task that should not execute
      const task2 = {
        start: sandbox.stub().callsFake(async () => {
          task2Executed = true
          return 'done'
        }),
      }
      const taskFn2 = () => [[{ task2 }]]

      // First scheduler acquires lock
      const scheduler1 = new TaskScheduler()
      const task1Promise = scheduler1.startTask(serviceName, {
        fn: taskFn1,
        interval: 5000,
        runNow: true,
      })

      await Utils.wait(50) // Let first scheduler acquire lock

      // Second scheduler tries to acquire lock while first is running
      const loggerDebugStub = sandbox.stub(logger, 'debug')
      const scheduler2 = new TaskScheduler()

      await scheduler2.startTask(serviceName, {
        fn: taskFn2,
        interval: 5000,
        runNow: true,
      })

      await Utils.wait(50)

      // Second scheduler should not acquire lock
      const debugCalls = loggerDebugStub.getCalls()
      const foundNoLockLog = debugCalls.some(call => {
        const firstArg = call.args[0] as unknown as string
        return firstArg && typeof firstArg === 'string' && firstArg.includes('Could not acquire lock')
      })
      expect(foundNoLockLog).to.be.true

      // Wait for first task to complete
      await task1Promise

      // First task should have been executed
      expect(task1Executed).to.be.true

      // Second task should not have been executed
      expect(task2Executed).to.be.false
      expect(task2.start.called).to.be.false

      scheduler1.stopTask(serviceName)
      scheduler2.stopTask(serviceName)
    })

    it('should register shutdown handlers on first task start', async () => {
      const processOnStub = sandbox.stub(process, 'on')
      const task1 = { start: sandbox.stub().resolves('done') }
      const taskFn = () => [[{ task1 }]]
      const serviceName = getUniqueServiceName('shutdownHandlers')

      // Create a new scheduler to test handler registration
      const newScheduler = new TaskScheduler()

      await newScheduler.startTask(serviceName, {
        fn: taskFn,
        interval: 5000,
        runNow: true,
      })

      await Utils.wait(50)

      // Check that shutdown handlers were registered
      const sigTermCalls = processOnStub.getCalls().filter(call => call.args[0] === 'SIGTERM')
      const sigIntCalls = processOnStub.getCalls().filter(call => call.args[0] === 'SIGINT')
      const beforeExitCalls = processOnStub.getCalls().filter(call => call.args[0] === 'beforeExit')
      const uncaughtCalls = processOnStub.getCalls().filter(call => call.args[0] === 'uncaughtException')
      const unhandledCalls = processOnStub.getCalls().filter(call => call.args[0] === 'unhandledRejection')

      expect(sigTermCalls.length).to.be.at.least(1)
      expect(sigIntCalls.length).to.be.at.least(1)
      expect(beforeExitCalls.length).to.be.at.least(1)
      expect(uncaughtCalls.length).to.be.at.least(1)
      expect(unhandledCalls.length).to.be.at.least(1)

      newScheduler.stopTask(serviceName)
    })

    it('should log debug message when shutdown handlers are registered', async () => {
      const loggerDebugStub = sandbox.stub(logger, 'debug')
      const task1 = { start: sandbox.stub().resolves('done') }
      const taskFn = () => [[{ task1 }]]
      const serviceName = getUniqueServiceName('shutdownLog')

      // Create a new scheduler to test handler registration
      const newScheduler = new TaskScheduler()

      await newScheduler.startTask(serviceName, {
        fn: taskFn,
        interval: 5000,
        runNow: true,
      })

      await Utils.wait(50)

      // Check that debug log was called for handler registration
      const debugCalls = loggerDebugStub.getCalls()
      const foundHandlerLog = debugCalls.some(call => {
        const firstArg = call.args[0] as unknown as string
        return firstArg && firstArg.includes && firstArg.includes('Shutdown handlers registered')
      })
      expect(foundHandlerLog).to.be.true

      newScheduler.stopTask(serviceName)
    })
  })
})
