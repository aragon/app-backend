import { Models } from '@dbModels'
import GaugeHelper from '@helpers/gauge'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import GaugeRewardDistribution from '@modules/gaugeRewardDistribution'
import GovernanceRewards from '@modules/governanceRewards'
import { ProxyToken } from '@modules/proxyToken'
import VeRewardDistribution from '@modules/veRewardDistribution'
import ActionDecoder from '@services/aragon-gateway/actionDecoder'
import { CapitalDistributorGateway } from '@services/aragon-gateway/capitalDistributor'
import { ContractInfo } from '@services/aragon-gateway/contractInfo'
import { CrossChainGasGateway } from '@services/aragon-gateway/crossChainGas'
import { GaugeInfo } from '@services/aragon-gateway/gauge'
import AragonGatewayService from '@services/aragon-gateway/index'
import { MemberInfo } from '@services/aragon-gateway/memberInfo'
import { MetadataRefetchProcessor } from '@services/aragon-gateway/metadataRefetch'
import Plugin from '@services/aragon-gateway/plugin'
import { EnumQueueName, MetadataEntityType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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

      expect(processStub.callCount).to.equal(16)
      expect(processStub.calledWith(EnumQueueName.crossChainGasLimit)).to.be.true
      expect(processStub.calledWith(EnumQueueName.contractInfo)).to.be.true
      expect(processStub.calledWith(EnumQueueName.memberBalance)).to.be.true
      expect(processStub.calledWith(EnumQueueName.contractDecoder)).to.be.true
      expect(processStub.calledWith(EnumQueueName.contractDecoderLight)).to.be.true
      expect(processStub.calledWith(EnumQueueName.canCreateProposal)).to.be.true
      expect(processStub.calledWith(EnumQueueName.pluginInstallationData)).to.be.true
      expect(processStub.calledWith(EnumQueueName.syncMerkleProofs)).to.be.true
      expect(processStub.calledWith(EnumQueueName.gaugeEpochId)).to.be.true
      expect(processStub.calledWith(EnumQueueName.gaugeInfo)).to.be.true
      expect(processStub.calledWith(EnumQueueName.gaugeRewardDistribution)).to.be.true
      expect(processStub.calledWith(EnumQueueName.gaugeRewardDistributionByGauge)).to.be.true
      expect(processStub.calledWith(EnumQueueName.governanceRewardDistribution)).to.be.true
      expect(processStub.calledWith(EnumQueueName.tokenInfo)).to.be.true
      expect(processStub.calledWith(EnumQueueName.metadataRefetch)).to.be.true
      expect(processStub.calledWith(EnumQueueName.tokenTotalSupply)).to.be.true

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

    it('should handle contractDecoderLight queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const decodeLightStub = sandbox.stub(ActionDecoder, 'decodeLight').resolves([])

      await AragonGatewayService.start()

      const handler = processStub.getCall(3).args[1]
      const queueName = processStub.getCall(3).args[0]
      await handler({
        params: {
          from: '0xDAO',
          actions: [{ to: '0xRecipient', data: '0x', value: '1000' }],
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.contractDecoderLight)
      expect(decodeLightStub.calledOnce).to.be.true
      expect(decodeLightStub.args[0][0]).to.deep.equal({
        from: '0xDAO',
        actions: [{ to: '0xRecipient', data: '0x', value: '1000' }],
        network: NetworksEnum.ethereumMainnet,
      })
    })

    it('should handle canCreateProposal queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const memberInfoStub = sandbox.stub(MemberInfo, 'canCreateProposal').resolves()

      await AragonGatewayService.start()

      const handler = processStub.getCall(4).args[1]
      const queueName = processStub.getCall(4).args[0]

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

      const handler = processStub.getCall(5).args[1]
      const queueName = processStub.getCall(5).args[0]

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

      const handler = processStub.getCall(6).args[1]
      const queueName = processStub.getCall(6).args[0]

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

      const handler = processStub.getCall(7).args[1]
      const queueName = processStub.getCall(7).args[0]

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

      const handler = processStub.getCall(8).args[1]
      const queueName = processStub.getCall(8).args[0]

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

    it('should handle gaugeRewardDistribution queue - returns serialized result', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')

      const mockResult = {
        epoch: 5,
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
        contractTotal: 150000000000000000000n,
        ownerRewards: [
          {
            owner: '0xAlice',
            votingPower: 100000000000000000000n,
            rewardAmount: 666600000000000000n,
            tokenIds: ['1', '2'],
          },
          {
            owner: '0xBob',
            votingPower: 50000000000000000000n,
            rewardAmount: 333300000000000000n,
            tokenIds: ['3'],
          },
        ],
        invariants: [{ name: '1a', pass: true, detail: 'ok' }],
      }

      sandbox.stub(VeRewardDistribution.prototype, 'compute').resolves(mockResult as any)

      await AragonGatewayService.start()

      const handler = processStub.getCall(9).args[1]
      const queueName = processStub.getCall(9).args[0]

      const result = await handler({
        params: {
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
          epochId: 5,
          rewardTotalAmount: '1000000000000000000',
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.gaugeRewardDistribution)
      expect(result.totalVotingPower).to.equal('150000000000000000000')
      expect(result.owners).to.have.lengthOf(2)
      expect(result.owners[0].votingPower).to.equal('100000000000000000000')
      expect(result.owners[0].rewardAmount).to.equal('666600000000000000')
      expect(result.owners[0].tokenIds).to.deep.equal(['1', '2'])
      expect(result.epoch).to.equal(5)
      expect(result.invariants).to.deep.equal([{ name: '1a', pass: true, detail: 'ok' }])
    })

    it('should handle gaugeRewardDistribution queue - returns null when compute returns null', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')

      sandbox.stub(VeRewardDistribution.prototype, 'compute').resolves(null)

      await AragonGatewayService.start()

      const handler = processStub.getCall(9).args[1]

      const result = await handler({
        params: {
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
          epochId: 5,
          rewardTotalAmount: '1000000000000000000',
        },
      } as any)

      expect(result).to.be.null
    })

    it('should handle gaugeRewardDistribution queue - returns error when compute returns { error }', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')

      sandbox
        .stub(VeRewardDistribution.prototype, 'compute')
        .resolves({ error: 'Epoch 5 voting window has not closed' })

      await AragonGatewayService.start()

      const handler = processStub.getCall(9).args[1]

      const result = await handler({
        params: {
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
          epochId: 5,
          rewardTotalAmount: '1000000000000000000',
        },
      } as any)

      expect(result).to.deep.equal({ error: 'Epoch 5 voting window has not closed' })
    })

    it('should handle gaugeRewardDistributionByGauge queue - returns serialized result', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')

      const mockResult = {
        epoch: 5,
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
        totalVotingPower: 1000n,
        rewardTotalAmount: 10000n,
        gaugeRewards: [
          { gauge: '0xGaugeA', votingPower: 600n, rewardAmount: 6000n },
          { gauge: '0xGaugeB', votingPower: 400n, rewardAmount: 4000n },
        ],
      }

      sandbox.stub(GaugeRewardDistribution.prototype, 'compute').resolves(mockResult as any)

      await AragonGatewayService.start()

      const handler = processStub.getCall(10).args[1]
      const queueName = processStub.getCall(10).args[0]

      const result = await handler({
        params: {
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
          epochId: 5,
          rewardTotalAmount: '10000',
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.gaugeRewardDistributionByGauge)
      expect(result.totalVotingPower).to.equal('1000')
      expect(result.rewardTotalAmount).to.equal('10000')
      expect(result.gaugeRewards).to.have.lengthOf(2)
      expect(result.gaugeRewards[0].gauge).to.equal('0xGaugeA')
      expect(result.gaugeRewards[0].votingPower).to.equal('600')
      expect(result.gaugeRewards[0].rewardAmount).to.equal('6000')
      expect(result.epoch).to.equal(5)
    })

    it('should handle gaugeRewardDistributionByGauge queue - returns null when compute returns null', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')

      sandbox.stub(GaugeRewardDistribution.prototype, 'compute').resolves(null)

      await AragonGatewayService.start()

      const handler = processStub.getCall(10).args[1]

      const result = await handler({
        params: {
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
          epochId: 5,
          rewardTotalAmount: '10000',
        },
      } as any)

      expect(result).to.be.null
    })

    it('should handle gaugeRewardDistributionByGauge queue - returns error when compute returns { error }', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')

      sandbox
        .stub(GaugeRewardDistribution.prototype, 'compute')
        .resolves({ errorKey: 'epochVotingNotClosed', error: 'Epoch 5 voting window has not closed' })

      await AragonGatewayService.start()

      const handler = processStub.getCall(10).args[1]

      const result = await handler({
        params: {
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
          epochId: 5,
          rewardTotalAmount: '10000',
        },
      } as any)

      expect(result).to.deep.equal({
        error: 'Epoch 5 voting window has not closed',
        errorKey: 'epochVotingNotClosed',
      })
    })

    it('should handle governanceRewardDistribution queue - returns serialized result', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')

      const mockResult = [
        { address: '0xAlice', amount: 600000000000000000000n },
        { address: '0xBob', amount: 400000000000000000000n },
      ]

      sandbox.stub(GovernanceRewards.prototype, 'compute').resolves(mockResult)

      await AragonGatewayService.start()

      const handler = processStub.getCall(11).args[1]
      const queueName = processStub.getCall(11).args[0]

      const result = await handler({
        params: {
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
          lookbackDate: '2025-09-14T00:00:00.000Z',
          rewardTotalAmount: '1000000000000000000000',
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.governanceRewardDistribution)
      expect(result).to.have.lengthOf(2)
      expect(result[0].address).to.equal('0xAlice')
      expect(result[0].amount).to.equal('600000000000000000000')
      expect(result[1].address).to.equal('0xBob')
      expect(result[1].amount).to.equal('400000000000000000000')
    })

    it('should handle governanceRewardDistribution queue - returns error', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')

      sandbox.stub(GovernanceRewards.prototype, 'compute').resolves({ error: 'Failed to resolve escrow address' })

      await AragonGatewayService.start()

      const handler = processStub.getCall(11).args[1]

      const result = await handler({
        params: {
          pluginAddress: '0xPluginAddress',
          network: NetworksEnum.ethereumMainnet,
          lookbackDate: '2025-09-14T00:00:00.000Z',
          rewardTotalAmount: '1000000000000000000000',
        },
      } as any)

      expect(result).to.deep.equal({ error: 'Failed to resolve escrow address' })
    })

    it('should handle tokenInfo queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()

      await AragonGatewayService.start()

      const handler = processStub.getCall(12).args[1]
      const queueName = processStub.getCall(12).args[0]

      const result = await handler({
        params: {
          address: '0xTokenAddress',
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.tokenInfo)
      expect(proxyTokenStub.calledOnceWith('0xTokenAddress', NetworksEnum.ethereumMainnet, undefined)).to.be.true
      expect(result).to.be.true
    })

    it('should handle tokenInfo queue with forceUpdate=true', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()

      await AragonGatewayService.start()

      const handler = processStub.getCall(12).args[1]

      const result = await handler({
        params: {
          address: '0xTokenAddress',
          network: NetworksEnum.ethereumMainnet,
          forceUpdate: true,
        },
      } as any)

      expect(proxyTokenStub.calledOnceWith('0xTokenAddress', NetworksEnum.ethereumMainnet, true)).to.be.true
      expect(result).to.be.true
    })

    it('should handle metadataRefetch queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const processRefetchStub = sandbox.stub(MetadataRefetchProcessor, 'processRefetch').resolves(true)

      await AragonGatewayService.start()

      const handler = processStub.getCall(13).args[1]
      const queueName = processStub.getCall(13).args[0]

      const result = await handler({
        params: {
          id: 'test-id',
          metadataUri: 'ipfs://QmTest123',
          entityType: MetadataEntityType.Dao,
          entityId: '0x1111111111111111111111111111111111111111',
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.metadataRefetch)
      expect(
        processRefetchStub.calledOnceWith({
          id: 'test-id',
          metadataUri: 'ipfs://QmTest123',
          entityType: MetadataEntityType.Dao,
          entityId: '0x1111111111111111111111111111111111111111',
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.true
      expect(result).to.be.true
    })

    it('should handle tokenTotalSupply queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const web3Stub = sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(BigInt('1000000000000000000'))
      const updateOneStub = sandbox.stub(Models.Token, 'updateOne').resolves()

      await AragonGatewayService.start()

      const handler = processStub.getCall(14).args[1]
      const queueName = processStub.getCall(14).args[0]

      const result = await handler({
        params: {
          address: '0xTokenAddress',
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(queueName).to.eq(EnumQueueName.tokenTotalSupply)
      expect(web3Stub.calledOnceWith('0xTokenAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(updateOneStub.calledOnce).to.be.true
      expect(result.totalSupply).to.equal('1000000000000000000')
      expect(result.totalSupplyUpdatedAt).to.be.an.instanceOf(Date)
    })

    it('should handle crossChainGasLimit queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const estimate = { status: 'success', requiredGas: '228100', runAt: 1 }
      const gatewayStub = sandbox.stub(CrossChainGasGateway, 'estimateGasLimit').resolves(estimate as any)

      await AragonGatewayService.start()

      const handler = processStub.getCall(15).args[1]
      const queueName = processStub.getCall(15).args[0]

      const params = {
        network: NetworksEnum.ethereumMainnet,
        controllerAddress: '0x1111111111111111111111111111111111111111',
        destinationChainId: 8453,
        actions: [{ to: '0x2222222222222222222222222222222222222222', value: '0', data: '0x' }],
      }
      const result = await handler({ params } as any)

      expect(queueName).to.eq(EnumQueueName.crossChainGasLimit)
      expect(gatewayStub.calledOnceWith(params as any)).to.be.true
      expect(result).to.deep.equal(estimate)
    })

    it('should handle tokenTotalSupply queue - RPC returns 0n still updates DB', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(0n)
      const updateOneStub = sandbox.stub(Models.Token, 'updateOne').resolves()

      await AragonGatewayService.start()

      const handler = processStub.getCall(14).args[1]

      const result = await handler({
        params: {
          address: '0xTokenAddress',
          network: NetworksEnum.ethereumMainnet,
        },
      } as any)

      expect(updateOneStub.calledOnce).to.be.true
      expect(result.totalSupply).to.equal('0')
      expect(result.totalSupplyUpdatedAt).to.be.an.instanceOf(Date)
    })
  })
})
