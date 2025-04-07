import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import AragonDaoService from '@services/aragon-dao/index'
import logger from '@logger'
import { EnumQueueName, NetworksEnum } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import { ContractInfo } from '@services/aragon-dao/contractInfo'
import { MemberInfo } from '@services/aragon-dao/memberInfo'
import { VoteInfo } from '@services/aragon-dao/voteInfo'
import ActionDecoder from '@services/aragon-dao/actionDecoder'
import { AllMetrics } from '@services/aragon-dao/allMetrics'

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

      expect(processStub.callCount).to.equal(10) // Total queues in the service
      expect(processStub.calledWith(EnumQueueName.allMetrics)).to.be.true
      expect(processStub.calledWith(EnumQueueName.daoTransactions)).to.be.true
      expect(processStub.calledWith(EnumQueueName.daoAssets)).to.be.true
      expect(processStub.calledWith(EnumQueueName.daoMetrics)).to.be.true
      expect(processStub.calledWith(EnumQueueName.proposalMultisigMetrics)).to.be.true
      expect(processStub.calledWith(EnumQueueName.proposalTokenVotingMetrics)).to.be.true
      expect(processStub.calledWith(EnumQueueName.contractInfo)).to.be.true
      expect(processStub.calledWith(EnumQueueName.voteInfo)).to.be.true
      expect(processStub.calledWith(EnumQueueName.memberBalance)).to.be.true
      expect(processStub.calledWith(EnumQueueName.contractDecoder)).to.be.true

      expect(loggerStub.calledOnceWith('AragonDaoService service started' as any)).to.be.true
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
      await handler({ params: { address: '0xDaoAddress', network: NetworksEnum.ethereumMainnet } } as any)

      expect(queueName).to.eq(EnumQueueName.daoTransactions)
      expect(
        daoTransactionsStub.calledOnceWith({
          daoAddress: '0xDaoAddress',
          network: NetworksEnum.ethereumMainnet,
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

    it('should handle contractInfo queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const contractStub = sandbox.stub(ContractInfo, 'getContractInfo').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(6).args[1]
      const queueName = processStub.getCall(6).args[0]
      await handler({ params: { address: '0x0', network: NetworksEnum.ethereumMainnet } } as any)

      expect(queueName).to.eq(EnumQueueName.contractInfo)
      expect(contractStub.args[0][0]).to.equal(NetworksEnum.ethereumMainnet)
      expect(contractStub.args[0][1]).to.equal('0x0')
      expect(contractStub.calledOnce).to.be.true
    })

    it('should handle voteInfo queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const contractStub = sandbox.stub(VoteInfo, 'getVoteInfo').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(7).args[1]
      const queueName = processStub.getCall(7).args[0]
      await handler({ params: { proposalId: '1', userAddress: '0x' } } as any)

      expect(queueName).to.eq(EnumQueueName.voteInfo)
      expect(contractStub.args[0][0].proposalId).to.eq('1')
      expect(contractStub.args[0][0].userAddress).to.eq('0x')
      expect(contractStub.calledOnce).to.be.true
    })

    it('should handle memberBalance queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const memberInfoStub = sandbox.stub(MemberInfo, 'getByTokenAddress').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(8).args[1]
      const queueName = processStub.getCall(8).args[0]
      await handler({
        params: {
          userAddress: 'userAddress',
          tokenAddress: 'tokenAddress',
          network: NetworksEnum.ethereumMainnet,
          pluginAddress: 'pluginAddress',
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.memberBalance)
      expect(
        memberInfoStub.calledOnceWith('userAddress', 'pluginAddress', 'tokenAddress', NetworksEnum.ethereumMainnet),
      ).to.be.true
    })

    it('should handle contractDecoder queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const decodeStub = sandbox.stub(ActionDecoder, 'decode').resolves()

      await AragonDaoService.start()

      const handler = processStub.getCall(9).args[1]
      const queueName = processStub.getCall(9).args[0]
      await handler({
        params: {
          from: 'userAddress1',
          to: 'userAddress2',
          data: '0x0',
          value: 1,
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.contractDecoder)
      expect(decodeStub.args[0][0]).to.deep.equal({
        from: 'userAddress1',
        to: 'userAddress2',
        data: '0x0',
        value: 1,
        network: NetworksEnum.ethereumMainnet,
      })
    })
  })
})
