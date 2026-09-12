import config from '@config'
import { DaoExecutionHandler } from '@handlers/daoExecutionHandler'
import EventReplayHelper from '@helpers/eventReplay'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { AllMetrics } from '@services/aragon-dao/allMetrics'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import AragonDaoService from '@services/aragon-dao/index'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import ActionDecoder from '@services/aragon-gateway/actionDecoder'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { EnumQueueName, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonDao: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should initialize RabbitMQ processing for all queues', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const loggerStub = sandbox.stub(logger, 'info')

      await AragonDaoService.start()

      expect(processStub.callCount).to.equal(12)
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

      expect(loggerStub.calledWith('AragonDaoService service started' as any)).to.be.true
    })

    it('does not schedule the proposal check publisher while checks are switched off', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      sandbox.stub(logger, 'info')
      const startTask = sandbox.stub()
      sandbox.stub(TaskSchedulerState, 'getInstance').returns({ startTask } as any)
      const enabled = config.PROPOSAL_CHECKS.ENABLED
      config.PROPOSAL_CHECKS.ENABLED = false

      try {
        await AragonDaoService.start()
      } finally {
        config.PROPOSAL_CHECKS.ENABLED = enabled
      }

      expect(startTask.called).to.be.false
      expect(processStub.calledWith(EnumQueueName.proposalChecks)).to.be.false
    })

    it('schedules the proposal check publisher and trigger router and consumes the queue when checks are switched on', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      sandbox.stub(logger, 'info')
      const startTask = sandbox.stub().resolves()
      sandbox.stub(TaskSchedulerState, 'getInstance').returns({ startTask } as any)
      const enabled = config.PROPOSAL_CHECKS.ENABLED
      config.PROPOSAL_CHECKS.ENABLED = true

      try {
        await AragonDaoService.start()
      } finally {
        config.PROPOSAL_CHECKS.ENABLED = enabled
      }

      expect(processStub.callCount).to.equal(13)
      expect(processStub.calledWith(EnumQueueName.proposalChecks)).to.be.true
      expect(startTask.calledThrice).to.be.true
      expect(startTask.args.map(a => a[0])).to.deep.eq([
        'proposalCheckRequests',
        'proposalCheckTriggers',
        'proposalCheckDeadlines',
      ])
      expect(startTask.args[0][1].interval).to.eq(config.PROPOSAL_CHECKS.PUBLISH_INTERVAL)
      expect(startTask.args[0][1].runNow).to.be.true
      expect(startTask.args[1][1].runNow).to.be.true
    })

    it('stops the proposal check publisher and trigger router with the service when checks are switched on', async () => {
      sandbox.stub(logger, 'info')
      const stopTask = sandbox.stub()
      sandbox.stub(TaskSchedulerState, 'getInstance').returns({ stopTask } as any)
      const enabled = config.PROPOSAL_CHECKS.ENABLED
      config.PROPOSAL_CHECKS.ENABLED = true

      try {
        await AragonDaoService.stop()
      } finally {
        config.PROPOSAL_CHECKS.ENABLED = enabled
      }

      expect(stopTask.args.map(a => a[0])).to.deep.eq([
        'proposalCheckRequests',
        'proposalCheckTriggers',
        'proposalCheckDeadlines',
      ])
    })

    it('should route executionActions jobs to the execution decode worker', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      sandbox.stub(logger, 'info')
      const decodeStub = sandbox.stub(DaoExecutionHandler, 'decodeExecutionTransaction').resolves()

      await AragonDaoService.start()

      const consumer = processStub.getCalls().find(call => call.args[0] === EnumQueueName.executionActions)
      expect(consumer).to.exist
      await consumer!.args[1]({ id: 'exec-1', params: { id: 'exec-1' } })

      expect(decodeStub.calledOnceWith('exec-1')).to.be.true
    })

    it('should route eventReplay jobs to the event replay helper', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      sandbox.stub(logger, 'info')
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
      const loggerStub = sandbox.stub(logger, 'info')

      await AragonDaoService.stop()

      expect(loggerStub.calledOnceWith('AragonDaoService service stopped' as any)).to.be.true
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
