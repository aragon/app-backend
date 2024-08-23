import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import IndexerService from '@services/aragon-indexer/index'
import config from '@config'
import utils from '@helpers/utils'
import { EnumConnection } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import logger from '@logger'
import { AggregatorMembers } from '@services/aragon-indexer/aggregator/member'
import { AggregatorDao } from '@services/aragon-indexer/aggregator/dao'
import { AggregatorProposal } from '@indexer/aggregator/proposal'
import { AggregatorDelegate } from '@indexer/aggregator/delegate'
import { AggregatorVote } from '@indexer/aggregator/vote'

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
      sandbox.stub(AggregatorMembers, 'start').resolves(),
      sandbox.stub(AggregatorProposal, 'start').resolves(),
      sandbox.stub(AggregatorDelegate, 'start').resolves(),
      sandbox.stub(AggregatorDao, 'start').resolves(),
      sandbox.stub(AggregatorVote, 'start').resolves(),
    ]

    await IndexerService.start()
    await utils.wait(100)

    expect(schedulerStub.startTask.calledOnce).to.be.true
    const taskOptions = schedulerStub.startTask.firstCall.args[1]

    // Simulate the task execution
    for (const taskGroup of taskOptions.fn()) {
      for (const task of taskGroup) {
        const taskName = Object.keys(task)[0]
        await task[taskName].start()
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
      options?.onError(new Error('Task error'))
    })

    await IndexerService.start()

    expect(stubLoggerError.calledOnceWith('IndexerService task error' as any)).to.be.true
  })
})
