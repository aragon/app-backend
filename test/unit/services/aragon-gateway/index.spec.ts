import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import AragonGatewayService from '@services/aragon-gateway/index'
import logger from '@logger'
import { EnumQueueName, NetworksEnum } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { ContractInfo } from '@services/aragon-gateway/contractInfo'
import { MemberInfo } from '@services/aragon-gateway/memberInfo'
import ActionDecoder from '@services/aragon-gateway/actionDecoder'
import Plugin from '@services/aragon-gateway/plugin'
import { CapitalDistributorGateway } from '@services/aragon-gateway/capitalDistributor'
import GaugeHelper from '@helpers/gauge'
import { GaugeInfo } from '@services/aragon-gateway/gauge'
import Web3Helper from '@helpers/web3'
import CoinGeckoHelper from '@helpers/coinGecko'

describe('AragonGateway: index', () => {
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

      await AragonGatewayService.start()

      expect(processStub.callCount).to.equal(8)
      expect(processStub.calledWith(EnumQueueName.contractInfo)).to.be.true
      expect(processStub.calledWith(EnumQueueName.memberBalance)).to.be.true
      expect(processStub.calledWith(EnumQueueName.contractDecoder)).to.be.true
      expect(processStub.calledWith(EnumQueueName.canCreateProposal)).to.be.true
      expect(processStub.calledWith(EnumQueueName.pluginInstallationData)).to.be.true
      expect(processStub.calledWith(EnumQueueName.syncMerkleProofs)).to.be.true
      expect(processStub.calledWith(EnumQueueName.gaugeEpochId)).to.be.true
      expect(processStub.calledWith(EnumQueueName.gaugeInfo)).to.be.true

      expect(loggerStub.calledOnceWith('AragonGatewayService service started' as any)).to.be.true
    })
  })

  describe('stop', () => {
    it('should log that the service stopped', async () => {
      const loggerStub = sandbox.stub(logger, 'info')

      await AragonGatewayService.stop()

      expect(loggerStub.calledOnceWith('AragonGatewayService service stopped' as any)).to.be.true
    })
  })

  describe('RabbitMQ queue handlers', () => {
    it('should handle contractInfo queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const contractStub = sandbox.stub(ContractInfo, 'getContractInfo').resolves()

      await AragonGatewayService.start()

      const handler = processStub.getCall(0).args[1]
      const queueName = processStub.getCall(0).args[0]
      await handler({ params: { address: '0x0', network: NetworksEnum.ethereumMainnet } } as any)

      expect(queueName).to.eq(EnumQueueName.contractInfo)
      expect(contractStub.args[0][0]).to.equal(NetworksEnum.ethereumMainnet)
      expect(contractStub.args[0][1]).to.equal('0x0')
      expect(contractStub.calledOnce).to.be.true
    })

    it('should handle memberBalance queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const memberInfoStub = sandbox.stub(MemberInfo, 'getByTokenAddress').resolves()

      await AragonGatewayService.start()

      const handler = processStub.getCall(1).args[1]
      const queueName = processStub.getCall(1).args[0]
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

      await AragonGatewayService.start()

      const handler = processStub.getCall(2).args[1]
      const queueName = processStub.getCall(2).args[0]
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

    it('should handle canCreateProposal queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const memberInfoStub = sandbox.stub(MemberInfo, 'canCreateProposal').resolves()

      await AragonGatewayService.start()

      const handler = processStub.getCall(3).args[1]
      const queueName = processStub.getCall(3).args[0]

      await handler({
        params: {
          pluginAddress: '0xPluginAddress',
          memberAddress: '0xUserAddress',
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.canCreateProposal)
      expect(memberInfoStub.calledOnceWith('0xPluginAddress', '0xUserAddress', NetworksEnum.ethereumMainnet)).to.be.true
    })

    it('should handle pluginInstallationData queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const pluginInstallationStub = sandbox.stub(Plugin, 'getInstallationData').resolves('{"installationData":"test"}')

      await AragonGatewayService.start()

      const handler = processStub.getCall(4).args[1]
      const queueName = processStub.getCall(4).args[0]

      const result = await handler({
        params: {
          address: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.pluginInstallationData)
      expect(pluginInstallationStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(result).to.equal('{"installationData":"test"}')
    })

    it('should handle syncMerkleProofs queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const syncMerkleProofsStub = sandbox.stub(CapitalDistributorGateway, 'generateMerkleData').resolves()

      await AragonGatewayService.start()

      const handler = processStub.getCall(5).args[1]
      const queueName = processStub.getCall(5).args[0]

      await handler({
        params: {
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
          campaignId: 'campaign-001',
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.syncMerkleProofs)
      expect(
        syncMerkleProofsStub.calledOnceWith({
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
          campaignId: 'campaign-001',
        } as any),
      ).to.be.true
    })

    it('should handle gaugeEpochId queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const gaugeEpochIdStub = sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves('5')

      await AragonGatewayService.start()

      const handler = processStub.getCall(6).args[1]
      const queueName = processStub.getCall(6).args[0]

      const result = await handler({
        params: {
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.gaugeEpochId)
      expect(gaugeEpochIdStub.calledOnceWith('0xPluginAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(result).to.equal('5')
    })

    it('should handle gaugeInfo queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const mockGaugeInfo = {
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
        epochId: '5',
        totalVotingPower: '1000000',
      }
      const gaugeInfoStub = sandbox.stub(GaugeInfo, 'getGaugeInfo').resolves(mockGaugeInfo as any)

      await AragonGatewayService.start()

      const handler = processStub.getCall(7).args[1]
      const queueName = processStub.getCall(7).args[0]

      const result = await handler({
        params: {
          pluginAddress: '0xPluginAddress',
          memberAddress: '0xMemberAddress',
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.gaugeInfo)
      expect(
        gaugeInfoStub.calledOnceWith({
          pluginAddress: '0xPluginAddress',
          memberAddress: '0xMemberAddress',
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.true
      expect(result).to.deep.equal(mockGaugeInfo)
    })
  })
})
