import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import IndexerService from '@services/indexer/index'
import { LogDao } from '@services/indexer/logDao'
import { LogDaoRegistry } from '@services/indexer/logDaoRegistry'
import { LogPluginRepoRegistry } from '@services/indexer/logPluginRepoRegistry'
import { LogPluginSetupProcessor } from '@services/indexer/logPluginSetupProcessor'
import { LogProposal } from '@services/indexer/logProposal'
import config from '@config'
import utils from '@helpers/utils'
import { EnumConnection } from '@types'
import logger from '@logger'
import { LogPluginSetting } from '@services/indexer/logPluginSetting'
import { LogMember } from '@services/indexer/logMember'
import { TaskSchedulerState } from '@state/taskSchedulerState'

describe('Indexer: index', () => {
  let sandbox: SinonSandbox
  let schedulerStub: sinon.SinonStubbedInstance<TaskSchedulerState>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    schedulerStub = sandbox.createStubInstance(TaskSchedulerState)
    sandbox.stub(TaskSchedulerState, 'getInstance').returns(schedulerStub)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should start, schedule tasks, and stop', async () => {
    expect(IndexerService.NEED_CONNECTIONS).to.deep.equal([EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN])

    const configBk = config.SERVICES.SYNC_DATA.DAO_INTERVAL
    config.SERVICES.SYNC_DATA.DAO_INTERVAL = 200

    const taskStubs = [
      sandbox.stub(LogDao, 'start').resolves(),
      sandbox.stub(LogDaoRegistry, 'start').resolves(),
      sandbox.stub(LogPluginRepoRegistry, 'start').resolves(),
      sandbox.stub(LogPluginSetupProcessor, 'start').resolves(),
      sandbox.stub(LogProposal, 'start').resolves(),
      sandbox.stub(LogPluginSetting, 'start').resolves(),
      sandbox.stub(LogMember, 'start').resolves(),
    ]

    await IndexerService.start()
    await utils.wait(100)

    expect(schedulerStub.startTask.calledOnce).to.be.true
    const taskOptions = schedulerStub.startTask.firstCall.args[1]

    // Simulate the task execution
    for (const taskGroup of taskOptions.fn()) {
      for (const task of taskGroup) {
        await task()
      }
    }

    expect(taskStubs.every(stub => stub.calledOnce)).to.be.true

    await IndexerService.stop()

    expect(schedulerStub.stopTask.calledOnce).to.be.true

    config.SERVICES.SYNC_DATA.DAO_INTERVAL = configBk
  })

  it('Should handle errors and call onError', async () => {
    const configBk = config.SERVICES.SYNC_DATA.DAO_INTERVAL
    config.SERVICES.SYNC_DATA.DAO_INTERVAL = 100

    const stubLoggerError = sandbox.stub(logger, 'error')
    const stubLoggerInfo = sandbox.stub(logger, 'info')
    const testError = new Error('Test fetchAll error')

    const taskStubs = [
      sandbox.stub(LogDao, 'start').rejects(testError),
      sandbox.stub(LogDaoRegistry, 'start').rejects(testError),
      sandbox.stub(LogPluginRepoRegistry, 'start').rejects(testError),
      sandbox.stub(LogPluginSetupProcessor, 'start').rejects(testError),
      sandbox.stub(LogProposal, 'start').rejects(testError),
      sandbox.stub(LogPluginSetting, 'start').rejects(testError),
      sandbox.stub(LogMember, 'start').rejects(testError),
    ]

    const onErrorSpy = sinon.spy((error: any) => {
      logger.error('IndexerService task error', { error })
    })

    await schedulerStub.startTask('indexer', {
      fn: () => taskStubs.map(stub => [stub]),
      interval: config.SERVICES.SYNC_DATA.DAO_INTERVAL,
      onError: onErrorSpy,
    })

    await IndexerService.start()

    // Simulate the task execution
    const taskOptions = schedulerStub.startTask.firstCall.args[1]
    for (const taskGroup of taskOptions.fn()) {
      for (const task of taskGroup) {
        try {
          await task()
        } catch (e) {
          if (taskOptions.onError) {
            taskOptions.onError(e)
          }
        }
      }
    }

    await utils.wait(200)

    expect(stubLoggerError.callCount).to.eq(7)
    expect(stubLoggerError.alwaysCalledWith('IndexerService task error' as any)).to.be.true
    expect(onErrorSpy.callCount).to.eq(7)
    expect(onErrorSpy.alwaysCalledWith(sinon.match.instanceOf(Error))).to.be.true

    await IndexerService.stop()

    expect(schedulerStub.stopTask.calledOnce).to.be.true

    config.SERVICES.SYNC_DATA.DAO_INTERVAL = configBk
    expect(stubLoggerInfo.calledWith('IndexerService service sync start' as any)).to.be.true
    expect(stubLoggerInfo.calledWith('IndexerService service sync end' as any)).to.be.true
  })
})
