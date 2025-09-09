import * as sinon from 'sinon'
import { expect } from 'chai'
import { CapitalDistributorAdminController } from '@services/aragon-admin-api/controllers/capitalDistributor'
import { Models } from '@dbModels'
import { ErrorKeyEnum, NetworksEnum, HexAddress, IPluginInterfaceType } from '@types'
import * as errors from '@errors'
import logger from '@logger'
import Utils from '@helpers/utils'
import MerkleTreeHelper from '@helpers/merkleTree'

describe('Controller: CapitalDistributorAdmin', () => {
  let sandbox: sinon.SinonSandbox
  let loggerInfoStub: sinon.SinonStub
  let loggerWarnStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerInfoStub = sandbox.stub(logger, 'info')
    loggerWarnStub = sandbox.stub(logger, 'warn')
    loggerErrorStub = sandbox.stub(logger, 'error')
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
      expect(result.message).to.eq('Members list processed successfully')
      expect(result.totalProcessed).to.eq(2)
      expect(result.campaignId).to.eq('campaign1')

      const savedRewards = await Models.CampaignReward.find({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        campaignId: mockParams.campaignId,
      })

      expect(savedRewards).to.have.length(2)

      const firstReward = savedRewards.find(r => r.userAddress === mockParams.rewards[0].address)
      const secondReward = savedRewards.find(r => r.userAddress === mockParams.rewards[1].address)

      expect(firstReward).to.exist
      expect(firstReward?.amount).to.eq('1000')
      expect(secondReward).to.exist
      expect(secondReward?.amount).to.eq('2000')
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
        multipleClaimsAllowed: true,
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
      expect(loggerInfoStub.calledWith('Members list processed successfully with upserts')).to.be.true

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

    it('should handle error in Utils.processParallel onError callback during member upload', async () => {
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

      const processParallelStub = sandbox.stub(Utils, 'processParallel')
      const mockError = new Error('Database insertion failed')
      const mockChunk = [{ id: 'test', userAddress: '0x123', amount: '1000' }]
      const mockIndex = 0

      processParallelStub.callsFake(async (_chunks: any, _processor: any, options: any) => {
        if (options.onError) {
          options.onError(mockError, mockChunk, mockIndex)
        }
        return [2]
      })

      await CapitalDistributorAdminController.uploadMembersList(mockParams)

      expect(loggerErrorStub.calledWith('Error processing upsert chunk')).to.be.true
      const logCall = loggerErrorStub.getCall(0)
      expect(logCall.args[1]).to.deep.include({
        error: mockError,
        chunkIndex: mockIndex,
        chunkSize: mockChunk.length,
        campaignId: mockParams.campaignId,
      })
    })
  })

  describe('generateMerkleData', () => {
    it('should generate merkle data successfully', async () => {
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

      // Create campaign rewards in database
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

      const result = await CapitalDistributorAdminController.generateMerkleData({
        campaignId: mockParams.campaignId,
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
      })

      expect(result).to.have.property('success', true)
      expect(result).to.have.property('totalMembers', 2)
      expect(result).to.have.property('merkleRoot')
      expect(result).to.have.property('updatedMembers', 2)

      // Verify that proof and leaf were added to database records
      const updatedRewards = await Models.CampaignReward.find({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        campaignId: mockParams.campaignId,
      })

      expect(updatedRewards).to.have.length(2)
      expect(updatedRewards[0].proof).to.exist
      expect(updatedRewards[0].leaf).to.exist
      expect(updatedRewards[1].proof).to.exist
      expect(updatedRewards[1].leaf).to.exist
    })

    it('should throw error if no members found', async () => {
      // Create plugin first
      await Models.Plugin.create({
        id: `${NetworksEnum.ethereumMainnet}-0xabc123-0x123`,
        address: '0x123' as HexAddress,
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xabc123' as HexAddress,
        blockNumber: 12345,
        status: 'installed',
        interfaceType: IPluginInterfaceType.capitalDistributor,
        daoAddress: '0xdao123' as HexAddress,
      })

      sandbox.stub(Models.Campaign, 'findExisting').resolves(null)
      sandbox.stub(Models.CampaignReward, 'find').returns({ lean: () => Promise.resolve([]) })

      await expect(
        CapitalDistributorAdminController.generateMerkleData({
          campaignId: 'campaign1',
          pluginAddress: '0x123',
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.badParams)
    })

    it('should throw error if campaign already exists', async () => {
      // Create plugin first
      await Models.Plugin.create({
        id: `${NetworksEnum.ethereumMainnet}-0xabc123-0x123`,
        address: '0x123' as HexAddress,
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xabc123' as HexAddress,
        blockNumber: 12345,
        status: 'installed',
        interfaceType: IPluginInterfaceType.capitalDistributor,
        daoAddress: '0xdao123' as HexAddress,
      })

      const existingCampaign = { id: 'campaign1', active: true }
      sandbox.stub(Models.Campaign, 'findExisting').resolves(existingCampaign)

      await expect(
        CapitalDistributorAdminController.generateMerkleData({
          campaignId: 'campaign1',
          pluginAddress: '0x123',
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.campaignInvalid)
    })

    it('should handle error in Utils.processParallel onError callback during merkle data generation', async () => {
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

      await Models.CampaignReward.create({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        campaignId: mockParams.campaignId,
        userAddress: mockParams.rewards[0].address,
        amount: '1000',
        claims: [],
      })

      const processParallelStub = sandbox.stub(Utils, 'processParallel')
      const mockError = new Error('Database update failed')
      const mockChunk = [{ address: '0x123', proof: ['0xproof'], leaf: '0xleaf' }]
      const mockIndex = 1

      processParallelStub.callsFake(async (_chunks: any, _processor: any, options: any) => {
        if (options.onError) {
          options.onError(mockError, mockChunk, mockIndex)
        }
        return [1]
      })

      const result = await CapitalDistributorAdminController.generateMerkleData({
        campaignId: mockParams.campaignId,
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
      })

      expect(loggerErrorStub.calledWith('Error processing merkle proof update chunk')).to.be.true
      const logCall = loggerErrorStub.getCall(0)
      expect(logCall.args[1]).to.deep.include({
        error: mockError,
        chunkIndex: mockIndex,
        chunkSize: mockChunk.length,
        campaignId: mockParams.campaignId,
      })
      expect(result.success).to.be.true
    })

    it('should handle catch block error and return success false', async () => {
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

      await Models.CampaignReward.create({
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
        campaignId: mockParams.campaignId,
        userAddress: mockParams.rewards[0].address,
        amount: '1000',
        claims: [],
      })

      const mockError = new Error('MerkleTree generation failed')
      sandbox.stub(MerkleTreeHelper, 'generateTreeWithProofs').throws(mockError)

      const result = await CapitalDistributorAdminController.generateMerkleData({
        campaignId: mockParams.campaignId,
        pluginAddress: mockParams.pluginAddress,
        network: mockParams.network,
      })

      expect(loggerWarnStub.calledWith('Error generating merkle data')).to.be.true
      const logCall = loggerWarnStub.getCall(0)
      expect(logCall.args[1]).to.deep.include({
        error: mockError,
        campaignId: mockParams.campaignId,
      })
      expect(result).to.deep.equal({ success: false })
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
        multipleClaimsAllowed: true,
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
