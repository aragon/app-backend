import { Models } from '@dbModels'
import * as errors from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { CapitalDistributorAdminController } from '@services/aragon-admin-api/controllers/capitalDistributor'
import { MemberGovernanceFactory } from '@src/governance'
import { EnumQueueName, ErrorKeyEnum, HexAddress, IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

describe('Controller: CapitalDistributorAdmin', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  const mockParams = {
    campaignId: 'campaign1',
    pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
    network: NetworksEnum.ethereumMainnet,
    rewards: [
      { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as HexAddress, amount: '1000' },
      { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as HexAddress, amount: '2000' },
    ],
  }

  describe('uploadMembersList', () => {
    it('should upload members list successfully when no existing campaign', async () => {
      await Models.Plugin.create({
        id: `${mockParams.network}-0xabc123-${mockParams.pluginAddress}`,
        address: mockParams.pluginAddress,
        network: mockParams.network,
        transactionHash: '0xabc123' as HexAddress,
        blockNumber: 12345,
        status: 'installed',
        interfaceType: IPluginInterfaceType.capitalDistributor,
        daoAddress: '0xdao123' as HexAddress,
      })

      const result = await CapitalDistributorAdminController.uploadMembersList(mockParams)

      expect(result.success).to.be.true
      expect(result.message).to.eq('Members list replaced successfully')
      expect(result.totalProcessed).to.eq(2)
      expect(result.campaignId).to.eq('campaign1')

      const savedRewards = await Models.CampaignReward.find({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        campaignId: mockParams.campaignId,
      })

      expect(savedRewards).to.have.length(2)
      expect(savedRewards.find(r => r.userAddress === mockParams.rewards[0].address)).to.exist
      expect(savedRewards.find(r => r.userAddress === mockParams.rewards[1].address)).to.exist
    })

    it('should throw error when plugin is not found', async () => {
      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.notFound))

      await expect(CapitalDistributorAdminController.uploadMembersList(mockParams)).to.be.rejectedWith(
        Error,
        ErrorKeyEnum.notFound,
      )

      expect(assertStub.calledWith(null as any, ErrorKeyEnum.notFound)).to.be.true

      const rewards = await Models.CampaignReward.find({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        campaignId: mockParams.campaignId,
      })
      expect(rewards).to.have.length(0)
    })

    it('should throw error when campaign already exists', async () => {
      await Models.Plugin.create({
        id: `${mockParams.network}-0xabc123-${mockParams.pluginAddress}`,
        address: mockParams.pluginAddress,
        network: mockParams.network,
        transactionHash: '0xabc123' as HexAddress,
        blockNumber: 12345,
        status: 'installed',
        interfaceType: IPluginInterfaceType.capitalDistributor,
        daoAddress: '0xdao123' as HexAddress,
      })

      await Models.Campaign.create({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        transactionHash: '0xabc123' as HexAddress,
        blockNumber: 12345,
        blockTimestamp: 1640995200,
        campaignId: mockParams.campaignId,
        metadataURI: 'https://ipfs.io/ipfs/test',
        allocationStrategy: '0x123' as HexAddress,
        token: '0xtoken' as HexAddress,
        payoutEncoder: '0xencoder' as HexAddress,
        startTime: 1640995200,
        endTime: 1672531200,
        active: true,
        ended: false,
      })

      await expect(CapitalDistributorAdminController.uploadMembersList(mockParams)).to.be.rejectedWith(
        Error,
        ErrorKeyEnum.campaignInvalid,
      )
    })

    it('should handle existing rewards and replace them', async () => {
      await Models.Plugin.create({
        id: `${mockParams.network}-0xabc123-${mockParams.pluginAddress}`,
        address: mockParams.pluginAddress,
        network: mockParams.network,
        transactionHash: '0xabc123' as HexAddress,
        blockNumber: 12345,
        status: 'installed',
        interfaceType: IPluginInterfaceType.capitalDistributor,
        daoAddress: '0xdao123' as HexAddress,
      })

      await Models.CampaignReward.create({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        campaignId: mockParams.campaignId,
        userAddress: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' as HexAddress,
        amount: '500',
        claims: [],
      })
      await Models.CampaignReward.create({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        campaignId: mockParams.campaignId,
        userAddress: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' as HexAddress,
        amount: '750',
        claims: [],
      })

      const result = await CapitalDistributorAdminController.uploadMembersList(mockParams)

      expect(result.success).to.be.true
      expect(result.totalProcessed).to.eq(2)

      // Verify old rewards were deleted and new ones created
      const allRewards = await Models.CampaignReward.find({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        campaignId: mockParams.campaignId,
      })

      expect(allRewards).to.have.length(2)
      expect(allRewards.find(r => r.userAddress === mockParams.rewards[0].address)).to.exist
      expect(allRewards.find(r => r.userAddress === mockParams.rewards[1].address)).to.exist
      expect(allRewards.find(r => r.userAddress === '0x90F79bf6EB2c4f870365E785982E1f101E93b906')).to.be.undefined
      expect(allRewards.find(r => r.userAddress === '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65')).to.be.undefined
    })

    it('should delegate to governance uploadMembersList method', async () => {
      const mockPlugin = {
        id: 'test-plugin',
        address: mockParams.pluginAddress,
        network: mockParams.network,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      }

      const mockGovernance = {
        uploadMembersList: sandbox.stub().resolves({
          success: true,
          message: 'Members list processed successfully',
          totalProcessed: 2,
          campaignId: mockParams.campaignId,
        }),
      }

      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin)
      const factoryStub = sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(mockGovernance as any)

      const result = await CapitalDistributorAdminController.uploadMembersList(mockParams)

      expect(pluginStub.calledWith(mockParams.pluginAddress, mockParams.network)).to.be.true
      expect(factoryStub.calledWith(mockPlugin)).to.be.true
      expect(mockGovernance.uploadMembersList.calledWith(mockParams)).to.be.true
      expect(result.success).to.be.true
    })
  })

  describe('generateMerkleData', () => {
    it('should send message to RabbitMQ queue successfully', async () => {
      await Models.Plugin.create({
        id: `${mockParams.network}-0xabc123-${mockParams.pluginAddress}`,
        address: mockParams.pluginAddress,
        network: mockParams.network,
        transactionHash: '0xabc123' as HexAddress,
        blockNumber: 12345,
        status: 'installed',
        interfaceType: IPluginInterfaceType.capitalDistributor,
        daoAddress: '0xdao123' as HexAddress,
      })

      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await CapitalDistributorAdminController.generateMerkleData({
        campaignId: mockParams.campaignId,
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
      })

      expect(
        rabbitMQStub.calledWith(EnumQueueName.syncMerkleProofs, {
          id: `${mockParams.pluginAddress}-${mockParams.network}-${mockParams.campaignId}`,
          params: {
            campaignId: mockParams.campaignId,
            pluginAddress: mockParams.pluginAddress,
            network: mockParams.network,
          },
        }),
      ).to.be.true
    })

    it('should throw error when plugin is not found', async () => {
      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.notFound))
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage')

      await expect(
        CapitalDistributorAdminController.generateMerkleData({
          campaignId: mockParams.campaignId,
          pluginAddress: mockParams.pluginAddress,
          network: mockParams.network,
        }),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)

      expect(assertStub.calledWith(null as any, ErrorKeyEnum.notFound)).to.be.true
      expect(rabbitMQStub.called).to.be.false
    })

    it('should throw error when plugin has wrong interface type', async () => {
      await Models.Plugin.create({
        id: `${mockParams.network}-0xabc123-${mockParams.pluginAddress}`,
        address: mockParams.pluginAddress,
        network: mockParams.network,
        transactionHash: '0xabc123' as HexAddress,
        blockNumber: 12345,
        status: 'installed',
        interfaceType: IPluginInterfaceType.tokenVoting,
        daoAddress: '0xdao123' as HexAddress,
      })

      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.notFound))
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage')

      await expect(
        CapitalDistributorAdminController.generateMerkleData({
          campaignId: mockParams.campaignId,
          pluginAddress: mockParams.pluginAddress,
          network: mockParams.network,
        }),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)

      expect(assertStub.called).to.be.true
      expect(rabbitMQStub.called).to.be.false
    })
  })

  describe('getMerkleGenerationStatus', () => {
    it('should get merkle generation status successfully', async () => {
      const mockPlugin = {
        id: 'test-plugin',
        address: mockParams.pluginAddress,
        network: mockParams.network,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      }

      const mockGovernance = {
        getMerkleGenerationStatus: sandbox.stub().resolves({
          status: 'completed',
          progress: 100,
          merkleRoot: '0xabcdef123',
        }),
      }

      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin)
      const factoryStub = sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(mockGovernance as any)

      await CapitalDistributorAdminController.getMerkleGenerationStatus({
        campaignId: mockParams.campaignId,
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
      })

      expect(pluginStub.calledWith(mockParams.pluginAddress, mockParams.network)).to.be.true
      expect(factoryStub.calledWith(mockPlugin)).to.be.true
      expect(
        mockGovernance.getMerkleGenerationStatus.calledWith({
          campaignId: mockParams.campaignId,
          pluginAddress: mockParams.pluginAddress,
          network: mockParams.network,
        }),
      ).to.be.true
    })

    it('should throw error when plugin is not found', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.notFound))

      await expect(
        CapitalDistributorAdminController.getMerkleGenerationStatus({
          campaignId: mockParams.campaignId,
          pluginAddress: mockParams.pluginAddress,
          network: mockParams.network,
        }),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)

      expect(assertStub.calledWith(null as any, ErrorKeyEnum.notFound)).to.be.true
    })

    it('should throw error when plugin has wrong interface type', async () => {
      const mockPlugin = {
        id: 'test-plugin',
        address: mockParams.pluginAddress,
        network: mockParams.network,
        interfaceType: IPluginInterfaceType.multisig,
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin)
      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.notFound))

      await expect(
        CapitalDistributorAdminController.getMerkleGenerationStatus({
          campaignId: mockParams.campaignId,
          pluginAddress: mockParams.pluginAddress,
          network: mockParams.network,
        }),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)

      expect(assertStub.called).to.be.true
    })
  })

  describe('getCampaignDetails', () => {
    it('should retrieve campaign details with member count', async () => {
      // Create plugin first
      await Models.Plugin.create({
        id: `${mockParams.network}-0xabc123-${mockParams.pluginAddress}`,
        address: mockParams.pluginAddress,
        network: mockParams.network,
        transactionHash: '0xabc123' as HexAddress,
        blockNumber: 12345,
        status: 'installed',
        interfaceType: IPluginInterfaceType.capitalDistributor,
        daoAddress: '0xdao123' as HexAddress,
      })

      // Create campaign in database
      await Models.Campaign.create({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        transactionHash: '0xabc123' as HexAddress,
        blockNumber: 12345,
        blockTimestamp: 1640995200,
        campaignId: mockParams.campaignId,
        metadataURI: 'https://ipfs.io/ipfs/test',
        allocationStrategy: '0x123' as HexAddress,
        token: '0xtoken' as HexAddress,
        payoutEncoder: '0xencoder' as HexAddress,
        startTime: 1640995200,
        endTime: 1672531200,
        active: true,
        merkleRoot: '0xmerkleroot123', // Change from merkleRoot to root
      })

      // Create some campaign rewards
      await Models.CampaignReward.create({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        campaignId: mockParams.campaignId,
        userAddress: mockParams.rewards[0].address,
        amount: '1000',
        claims: [],
      })
      await Models.CampaignReward.create({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        campaignId: mockParams.campaignId,
        userAddress: mockParams.rewards[1].address,
        amount: '2000',
        claims: [],
      })

      const result = await CapitalDistributorAdminController.getCampaignDetails({
        campaignId: mockParams.campaignId,
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
      })

      expect(result).to.have.property('membersCount', 2)
      expect(result).to.have.property('campaignId', mockParams.campaignId)
      expect(result).to.have.property('merkleRoot', '0xmerkleroot123') // Change from merkleRoot to root
    })

    it('should throw error when campaign is not found', async () => {
      sandbox.stub(Models.Campaign, 'findCampaignById').resolves(null)
      const assertStub = sandbox.stub(errors, 'assertExposable').throws(new Error(ErrorKeyEnum.notFound))

      await expect(
        CapitalDistributorAdminController.getCampaignDetails({
          campaignId: 'campaign1',
          pluginAddress: '0x123',
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)

      expect(assertStub.calledWith(null as any, ErrorKeyEnum.notFound)).to.be.true
    })
  })
})
