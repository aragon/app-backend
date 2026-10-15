import { DaoExecutionHandler } from '@handlers/daoExecutionHandler'
import EventReplayHelper from '@helpers/eventReplay'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import SafeServiceModule from '@modules/safe/safeService'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import { AllMetrics } from '@services/aragon-dao/allMetrics'
import { CrossChainGasDao } from '@services/aragon-dao/crossChainGas'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import AragonDaoService from '@services/aragon-dao/index'
import { IndexerBlockGapDao } from '@services/aragon-dao/indexerBlockGap'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import { SppRuleConditionDao } from '@services/aragon-dao/sppRuleCondition'
import ActionDecoder from '@services/aragon-gateway/actionDecoder'
import { EnumQueueName, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonDao: index', () => {
  let sandbox: SinonSandbox
  let loggerInfoStub: sinon.SinonStub

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    loggerInfoStub = sandbox.stub(logger, 'info')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should initialize RabbitMQ processing for all queues', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')

      await AragonDaoService.start()

      expect(processStub.callCount).to.equal(14)
      expect(processStub.calledWith(EnumQueueName.safeTransactionActions)).to.be.true
      expect(processStub.calledWith(EnumQueueName.safeRefresh)).to.be.true
      expect(processStub.calledWith(EnumQueueName.crossChainGasLimit)).to.be.true
      expect(processStub.calledWith(EnumQueueName.sppRuleCondition)).to.be.true
      expect(processStub.calledWith(EnumQueueName.indexerBlockGap)).to.be.true
      expect(processStub.calledWith(EnumQueueName.allMetrics)).to.be.true
      expect(processStub.calledWith(EnumQueueName.daoTransactions)).to.be.true
      expect(processStub.calledWith(EnumQueueName.daoAssets)).to.be.true
      expect(processStub.calledWith(EnumQueueName.daoMetrics)).to.be.true
      expect(processStub.calledWith(EnumQueueName.proposalMultisigMetrics)).to.be.true
      expect(processStub.calledWith(EnumQueueName.proposalTokenVotingMetrics)).to.be.true
      expect(processStub.calledWith(EnumQueueName.proposalActions)).to.be.true
      expect(processStub.calledWith(EnumQueueName.executionActions)).to.be.true
      expect(processStub.calledWith(EnumQueueName.eventReplay)).to.be.true

      expect(loggerInfoStub.calledWith('AragonDaoService service started' as any)).to.be.true
    })

    it('should route executionActions jobs to the execution decode worker', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const decodeStub = sandbox.stub(DaoExecutionHandler, 'decodeExecutionTransaction').resolves()

      await AragonDaoService.start()

      const consumer = processStub.getCalls().find(call => call.args[0] === EnumQueueName.executionActions)
      expect(consumer).to.exist
      await consumer!.args[1]({ id: 'exec-1', params: { id: 'exec-1' } })

      expect(decodeStub.calledOnceWith('exec-1')).to.be.true
    })

    it('registers the safe actions consumer with the bounded retry and no dead letter', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')

      await AragonDaoService.start()

      const consumer = processStub.getCalls().find(call => call.args[0] === EnumQueueName.safeTransactionActions)
      expect(consumer?.args[2]).to.deep.equal({
        retry: {
          maxAttempts: 6,
          baseDelayMs: 2000,
          maxDelayMs: 60000,
        },
      })
    })

    it('registers the safe refresh consumer with the bounded retry and no dead letter', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')

      await AragonDaoService.start()

      const consumer = processStub.getCalls().find(call => call.args[0] === EnumQueueName.safeRefresh)
      expect(consumer?.args[2]).to.deep.equal({
        retry: {
          maxAttempts: 6,
          baseDelayMs: 2000,
          maxDelayMs: 60000,
        },
      })
    })

    it('routes safe actions jobs to the safe transactions decoder', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const decodeStub = sandbox.stub(SafeTransactionsModule, 'decode').resolves()

      await AragonDaoService.start()

      const consumer = processStub.getCalls().find(call => call.args[0] === EnumQueueName.safeTransactionActions)
      await consumer!.args[1]({ params: { id: 'safe-tx-1' } } as any)

      expect(decodeStub.calledOnceWith('safe-tx-1')).to.be.true
    })

    it('routes safe refresh jobs to the safe store sync', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const syncStub = sandbox.stub(SafeServiceModule, 'syncStore').resolves()

      await AragonDaoService.start()

      const consumer = processStub.getCalls().find(call => call.args[0] === EnumQueueName.safeRefresh)
      await consumer!.args[1]({
        params: { network: NetworksEnum.ethereumMainnet, address: '0xSafe', historyPages: 3 },
      } as any)

      expect(syncStub.calledOnceWith(NetworksEnum.ethereumMainnet, '0xSafe', 3)).to.be.true
    })

    it('routes crossChainGasLimit jobs to the gas estimator', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const estimateStub = sandbox.stub(CrossChainGasDao, 'estimateGasLimit').resolves('21000' as any)

      await AragonDaoService.start()

      const consumer = processStub.getCalls().find(call => call.args[0] === EnumQueueName.crossChainGasLimit)
      const params = { network: NetworksEnum.ethereumMainnet } as any
      await consumer!.args[1]({ params } as any)

      expect(estimateStub.calledOnceWith(params)).to.be.true
    })

    it('routes sppRuleCondition jobs to the rule resolver', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const resolveStub = sandbox.stub(SppRuleConditionDao, 'resolve').resolves({} as any)

      await AragonDaoService.start()

      const consumer = processStub.getCalls().find(call => call.args[0] === EnumQueueName.sppRuleCondition)
      const params = { network: NetworksEnum.ethereumMainnet } as any
      await consumer!.args[1]({ params } as any)

      expect(resolveStub.calledOnceWith(params)).to.be.true
    })

    it('routes indexerBlockGap jobs to the block gap reader', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const readStub = sandbox.stub(IndexerBlockGapDao, 'read').resolves({} as any)

      await AragonDaoService.start()

      const consumer = processStub.getCalls().find(call => call.args[0] === EnumQueueName.indexerBlockGap)
      const params = { network: NetworksEnum.ethereumMainnet } as any
      await consumer!.args[1]({ params } as any)

      expect(readStub.calledOnceWith(params)).to.be.true
    })

    it('routes a native daoAssets job to the native sync', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const syncNativeStub = sandbox.stub(DaoAssets, 'syncNative').resolves()

      await AragonDaoService.start()

      const consumer = processStub.getCalls().find(call => call.args[0] === EnumQueueName.daoAssets)
      await consumer!.args[1]({
        params: { address: '0xDao', network: NetworksEnum.ethereumMainnet, native: true },
      } as any)

      expect(syncNativeStub.calledOnceWith({ daoAddress: '0xDao', network: NetworksEnum.ethereumMainnet })).to.be.true
    })

    it('routes a single token daoAssets job to the token sync', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const syncTokenStub = sandbox.stub(DaoAssets, 'syncToken').resolves()

      await AragonDaoService.start()

      const consumer = processStub.getCalls().find(call => call.args[0] === EnumQueueName.daoAssets)
      await consumer!.args[1]({
        params: { address: '0xDao', network: NetworksEnum.ethereumMainnet, tokenAddress: '0xToken' },
      } as any)

      expect(
        syncTokenStub.calledOnceWith({
          daoAddress: '0xDao',
          tokenAddress: '0xToken',
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.true
    })

    it('should route eventReplay jobs to the event replay helper', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const replayStub = sandbox.stub(EventReplayHelper, 'handleEventsFromTxHash').resolves({} as any)

      await AragonDaoService.start()

      const consumer = processStub.getCalls().find(call => call.args[0] === EnumQueueName.eventReplay)
      expect(consumer).to.exist
      await consumer!.args[1]({
        id: 'replay-1',
        params: { txHash: '0xhash', network: NetworksEnum.ethereumMainnet },
      })

      expect(replayStub.calledOnceWith('0xhash', NetworksEnum.ethereumMainnet)).to.be.true
    })
  })

  describe('stop', () => {
    it('should log that the service stopped', async () => {
      await AragonDaoService.stop()

      expect(loggerInfoStub.calledOnceWith('AragonDaoService service stopped' as any)).to.be.true
    })
  })

  describe('RabbitMQ queue handlers', () => {
    it('should handle allMetrics queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const allMetricsStub = sandbox.stub(AllMetrics, 'start').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(0).args[1]
      const queueName = processStub.getCall(0).args[0]
      await handler({ params: { network: NetworksEnum.ethereumMainnet } } as any)

      expect(queueName).to.eq(EnumQueueName.allMetrics)
      expect(
        allMetricsStub.calledOnceWith({
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.true
    })

    it('should handle daoTransactions queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const daoTransactionsStub = sandbox.stub(DaoTransactions, 'start').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(1).args[1]
      const queueName = processStub.getCall(1).args[0]
      await handler({ params: { daoAddress: '0xDaoAddress', network: NetworksEnum.ethereumMainnet } } as any)

      expect(queueName).to.eq(EnumQueueName.daoTransactions)
      expect(
        daoTransactionsStub.calledOnceWith({
          daoAddress: '0xDaoAddress',
          network: NetworksEnum.ethereumMainnet,
          reset: undefined,
          resetExecutions: undefined,
        }),
      ).to.be.true
    })

    it('should handle daoTransactions queue with reset', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const daoTransactionsStub = sandbox.stub(DaoTransactions, 'start').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(1).args[1]
      const queueName = processStub.getCall(1).args[0]
      await handler({
        params: { daoAddress: '0xDaoAddress', network: NetworksEnum.ethereumMainnet, reset: true },
      } as any)

      expect(queueName).to.eq(EnumQueueName.daoTransactions)
      expect(
        daoTransactionsStub.calledOnceWith({
          daoAddress: '0xDaoAddress',
          network: NetworksEnum.ethereumMainnet,
          reset: true,
          resetExecutions: undefined,
        }),
      ).to.be.true
    })

    it('should handle daoTransactions queue with resetExecutions', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const daoTransactionsStub = sandbox.stub(DaoTransactions, 'start').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(1).args[1]
      const queueName = processStub.getCall(1).args[0]
      await handler({
        params: { daoAddress: '0xDaoAddress', network: NetworksEnum.ethereumMainnet, resetExecutions: true },
      } as any)

      expect(queueName).to.eq(EnumQueueName.daoTransactions)
      expect(
        daoTransactionsStub.calledOnceWith({
          daoAddress: '0xDaoAddress',
          network: NetworksEnum.ethereumMainnet,
          reset: undefined,
          resetExecutions: true,
        }),
      ).to.be.true
    })

    it('should handle daoAssets queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const daoAssetsStub = sandbox.stub(DaoAssets, 'start').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(2).args[1]
      const queueName = processStub.getCall(2).args[0]
      await handler({ params: { address: '0xDaoAddress', network: NetworksEnum.ethereumMainnet } } as any)

      expect(queueName).to.eq(EnumQueueName.daoAssets)
      expect(
        daoAssetsStub.calledOnceWith({
          daoAddress: '0xDaoAddress',
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.true
    })

    it('should handle daoMetrics queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const daoMetricsStub = sandbox.stub(DaoMetrics, 'start').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(3).args[1]
      const queueName = processStub.getCall(3).args[0]
      await handler({ params: { address: '0xDaoAddress', network: NetworksEnum.ethereumMainnet } } as any)

      expect(queueName).to.eq(EnumQueueName.daoMetrics)
      expect(
        daoMetricsStub.calledOnceWith({
          daoAddress: '0xDaoAddress',
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.true
    })

    it('should handle proposalMultisigMetrics queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const proposalMetricsStub = sandbox.stub(ProposalMetrics, 'proposalMultisigMetrics').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(4).args[1]
      const queueName = processStub.getCall(4).args[0]
      await handler({
        params: {
          proposalIndex: '1',
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.proposalMultisigMetrics)
      expect(
        proposalMetricsStub.calledOnceWith({
          proposalIndex: '1',
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
        } as any),
      ).to.be.true
    })

    it('should handle proposalTokenVotingMetrics queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const proposalMetricsStub = sandbox.stub(ProposalMetrics, 'proposalTokenVotingMetrics').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(5).args[1]
      const queueName = processStub.getCall(5).args[0]
      await handler({
        params: {
          proposalIndex: '1',
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.proposalTokenVotingMetrics)
      expect(
        proposalMetricsStub.calledOnceWith({
          proposalIndex: '1',
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
        } as any),
      ).to.be.true
    })

    it('should handle proposalActions queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const proposalActionDecoderStub = sandbox.stub(ActionDecoder, 'proposalActionDecoder')

      await AragonDaoService.start()

      const handler = processStub.getCall(6).args[1]
      const queueName = processStub.getCall(6).args[0]

      await handler({
        params: {
          id: 'proposalId',
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.proposalActions)
      expect(proposalActionDecoderStub.calledOnceWith('proposalId')).to.be.true
    })
  })
})
