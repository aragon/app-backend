import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import IndexerService from '@services/aragon-indexer/index'
import { LogDao } from '@services/aragon-indexer/logDao'
import { LogDaoRegistry } from '@services/aragon-indexer/logDaoRegistry'
import { LogPluginRepoRegistry } from '@services/aragon-indexer/logPluginRepoRegistry'
import { LogPluginSetupProcessor } from '@services/aragon-indexer/logPluginSetupProcessor'
import { LogProposal } from '@services/aragon-indexer/logProposal'
import config from '@config'
import utils from '@helpers/utils'
import { EnumConnection } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import logger from '@logger'
import { LogPluginSetting } from '@services/aragon-indexer/logPluginSetting'
import { LogMember } from '@services/aragon-indexer/logMember'
import { AggregatorMembers } from '@services/aragon-indexer/aggregator/member'
import { AggregatorPlugin } from '@services/aragon-indexer/aggregator/plugin'
import { AggregatorSetting } from '@services/aragon-indexer/aggregator/setting'
import { AggregatorAssets } from '@services/aragon-indexer/aggregator/asset'
import { AggregatorTransactions } from '@services/aragon-indexer/aggregator/transaction'

describe('Indexer: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should start, schedule tasks, and stop', async () => {
    let schedulerStub = sandbox.createStubInstance(TaskSchedulerState)
    sandbox.stub(TaskSchedulerState, 'getInstance').returns(schedulerStub)

    expect(IndexerService.NEED_CONNECTIONS).to.deep.equal([EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN])

    const configBk = config.SERVICES.ARAGON_INDEXER.DAO_INTERVAL
    config.SERVICES.ARAGON_INDEXER.DAO_INTERVAL = 200

    const taskStubs = [
      sandbox.stub(LogDao, 'start').resolves(),
      sandbox.stub(LogDaoRegistry, 'start').resolves(),
      sandbox.stub(LogPluginRepoRegistry, 'start').resolves(),
      sandbox.stub(LogPluginSetupProcessor, 'start').resolves(),
      sandbox.stub(LogProposal, 'start').resolves(),
      sandbox.stub(LogPluginSetting, 'start').resolves(),
      sandbox.stub(LogMember, 'start').resolves(),
      sandbox.stub(AggregatorMembers, 'start').resolves(),
      sandbox.stub(AggregatorPlugin, 'start').resolves(),
      sandbox.stub(AggregatorSetting, 'start').resolves(),
      sandbox.stub(AggregatorAssets, 'start').resolves(),
      sandbox.stub(AggregatorTransactions, 'start').resolves(),
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

    config.SERVICES.ARAGON_INDEXER.DAO_INTERVAL = configBk
  })

  it('Should handle errors and call onError', async () => {
    const stubLoggerError = sandbox.stub(logger, 'error')

    sandbox.stub(TaskSchedulerState.prototype, 'startTask').callsFake((_: string, options: any): any => {
      options?.onError(true)
    })

    await IndexerService.start()

    expect(stubLoggerError.calledOnce).to.be.true
  })
})
