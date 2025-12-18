import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { AllMetrics } from '@services/aragon-dao/allMetrics'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import AragonDaoService from '@services/aragon-dao/index'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import ActionDecoder from '@services/aragon-gateway/actionDecoder'
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

      expect(processStub.callCount).to.equal(7)
      expect(processStub.calledWith(EnumQueueName.allMetrics)).to.be.true
      expect(processStub.calledWith(EnumQueueName.daoTransactions)).to.be.true
      expect(processStub.calledWith(EnumQueueName.daoAssets)).to.be.true
      expect(processStub.calledWith(EnumQueueName.daoMetrics)).to.be.true
      expect(processStub.calledWith(EnumQueueName.proposalMultisigMetrics)).to.be.true
      expect(processStub.calledWith(EnumQueueName.proposalTokenVotingMetrics)).to.be.true
      expect(processStub.calledWith(EnumQueueName.proposalActions)).to.be.true

      expect(loggerStub.calledWith('AragonDaoService service started' as any)).to.be.true
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
