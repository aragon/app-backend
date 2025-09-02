import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { CapitalDistributorGovernance } from '@src/governance'
import { NetworksEnum, type HexAddress } from '@types'
import MerkleTreeHelper from '@helpers/merkleTree'

describe('Governance:CapitalDistributorGovernance', () => {
  let sandbox: SinonSandbox
  let capitalDistributorGovernance: CapitalDistributorGovernance
  let loggerInfoStub: sinon.SinonStub
  let loggerWarnStub: sinon.SinonStub

  const testPluginAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet
  const testCampaignId = 'test-campaign-123'

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    capitalDistributorGovernance = new CapitalDistributorGovernance(testPluginAddress, testNetwork)

    loggerInfoStub = sandbox.stub(Logger, 'info')
    loggerWarnStub = sandbox.stub(Logger, 'warn')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('constructor', () => {
    it('should initialize with plugin address and network', () => {
      expect(capitalDistributorGovernance['address']).to.equal(testPluginAddress)
      expect(capitalDistributorGovernance['network']).to.equal(testNetwork)
    })
  })

  describe('uploadMembersList', () => {
    beforeEach(async () => {
      await Models.Plugin.create({
        id: `${testNetwork}-${testPluginAddress.toLowerCase()}-0`,
        transactionHash: '0x123',
        blockNumber: 100,
        network: testNetwork,
        address: testPluginAddress,
        interfaceType: 'capitalDistributor',
        status: 'installed',
        daoAddress: '0xdao1dao1dao1dao1dao1dao1dao1dao1dao1dao1',
        isSupported: true,
      })
    })

    it('should successfully upload members list for new campaign', async () => {
      const rewards = [
        { address: '0x1111111111111111111111111111111111111111', amount: '100' },
        { address: '0x2222222222222222222222222222222222222222', amount: '200' },
      ]

      const result = await capitalDistributorGovernance.uploadMembersList({
        campaignId: testCampaignId,
        pluginAddress: testPluginAddress,
        network: testNetwork,
        rewards,
      })

      expect(result.success).to.be.true
      expect(result.totalInserted).to.equal(2)
      expect(result.totalUpdated).to.equal(0)
      expect(result.totalDeleted).to.equal(0)
      expect(result.totalProcessed).to.equal(2)

      const savedRewards = await Models.CampaignReward.find({
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
      })

      expect(savedRewards).to.have.lengthOf(2)
      expect(savedRewards[0].amount).to.equal('100')
      expect(savedRewards[1].amount).to.equal('200')
      expect(savedRewards[0].totalClaimed).to.equal('0')
      expect(savedRewards[0].claims).to.deep.equal([])
    })

    it('should update existing rewards and delete removed users', async () => {
      await Models.CampaignReward.create({
        id: 'test-reward-1',
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
        userAddress: '0x1111111111111111111111111111111111111111',
        amount: '50',
        totalClaimed: '25',
        claims: [
          {
            claimedAmount: '25',
            transactionHash: '0xabc',
            blockNumber: 123,
            blockTimestamp: 1640995200,
          },
        ],
      })

      await Models.CampaignReward.create({
        id: 'test-reward-2',
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
        userAddress: '0x3333333333333333333333333333333333333333',
        amount: '75',
        totalClaimed: '0',
        claims: [],
      })

      const newRewards = [
        { address: '0x1111111111111111111111111111111111111111', amount: '150' },
        { address: '0x2222222222222222222222222222222222222222', amount: '200' },
      ]

      const result = await capitalDistributorGovernance.uploadMembersList({
        campaignId: testCampaignId,
        pluginAddress: testPluginAddress,
        network: testNetwork,
        rewards: newRewards,
      })

      expect(result.success).to.be.true
      expect(result.totalInserted).to.equal(1)
      expect(result.totalUpdated).to.equal(1)
      expect(result.totalDeleted).to.equal(1)

      const savedRewards = await Models.CampaignReward.find({
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
      })

      expect(savedRewards).to.have.lengthOf(2)

      const updatedReward = savedRewards.find(r => r.userAddress === '0x1111111111111111111111111111111111111111')
      expect(updatedReward.amount).to.equal('150')
      expect(updatedReward.totalClaimed).to.equal('25')
      expect(updatedReward.claims).to.have.lengthOf(1)

      const newReward = savedRewards.find(r => r.userAddress === '0x2222222222222222222222222222222222222222')
      expect(newReward.amount).to.equal('200')
      expect(newReward.totalClaimed).to.equal('0')

      const deletedReward = savedRewards.find(r => r.userAddress === '0x3333333333333333333333333333333333333333')
      expect(deletedReward).to.be.undefined
    })

    it('should reject upload for active campaign', async () => {
      await Models.Campaign.create({
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
        transactionHash: '0x123',
        blockNumber: 100,
        blockTimestamp: 1640995200,
        metadataURI: 'https://ipfs.io/ipfs/test',
        allocationStrategy: testPluginAddress,
        token: '0xtoken123',
        payoutEncoder: '0xencoder123',
        multipleClaimsAllowed: true,
        startTime: 1640995200,
        endTime: 1672531200,
        active: true,
        merkleRoot: '0x123',
      })

      const rewards = [{ address: '0x1111111111111111111111111111111111111111', amount: '100' }]

      await expect(
        capitalDistributorGovernance.uploadMembersList({
          campaignId: testCampaignId,
          pluginAddress: testPluginAddress,
          network: testNetwork,
          rewards,
        }),
      ).to.be.rejected
    })

    it('should reject upload for ended campaign', async () => {
      await Models.Campaign.create({
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
        transactionHash: '0x123',
        blockNumber: 100,
        blockTimestamp: 1640995200,
        metadataURI: 'https://ipfs.io/ipfs/test',
        allocationStrategy: testPluginAddress,
        token: '0xtoken123',
        payoutEncoder: '0xencoder123',
        multipleClaimsAllowed: true,
        startTime: 1640995200,
        endTime: 1672531200,
        active: false,
        ended: true,
        merkleRoot: '0x123',
      })

      const rewards = [{ address: '0x1111111111111111111111111111111111111111', amount: '100' }]

      await expect(
        capitalDistributorGovernance.uploadMembersList({
          campaignId: testCampaignId,
          pluginAddress: testPluginAddress,
          network: testNetwork,
          rewards,
        }),
      ).to.be.rejected
    })

    it('should handle empty rewards list', async () => {
      const result = await capitalDistributorGovernance.uploadMembersList({
        campaignId: testCampaignId,
        pluginAddress: testPluginAddress,
        network: testNetwork,
        rewards: [],
      })

      expect(result.success).to.be.true
      expect(result.totalInserted).to.equal(0)
      expect(result.totalUpdated).to.equal(0)
      expect(result.totalDeleted).to.equal(0)
    })
  })

  describe('generateMerkleData', () => {
    beforeEach(async () => {
      await Models.Plugin.create({
        id: `${testNetwork}-${testPluginAddress.toLowerCase()}-0`,
        transactionHash: '0x123',
        blockNumber: 100,
        network: testNetwork,
        address: testPluginAddress,
        interfaceType: 'capitalDistributor',
        status: 'installed',
        daoAddress: '0xdao1dao1dao1dao1dao1dao1dao1dao1dao1dao1',
        isSupported: true,
      })

      await Models.CampaignReward.create({
        id: 'reward-1',
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
        userAddress: '0x1111111111111111111111111111111111111111',
        amount: '100',
        totalClaimed: '0',
        claims: [],
      })

      await Models.CampaignReward.create({
        id: 'reward-2',
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
        userAddress: '0x2222222222222222222222222222222222222222',
        amount: '200',
        totalClaimed: '0',
        claims: [],
      })
    })

    it('should generate merkle data and update campaign rewards with proofs', async () => {
      const mockMerkleResult = {
        merkleRoot: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        members: [
          {
            address: '0x1111111111111111111111111111111111111111',
            amount: '100',
            proof: ['0xproof1', '0xproof2'],
            leaf: '0xleaf1',
          },
          {
            address: '0x2222222222222222222222222222222222222222',
            amount: '200',
            proof: ['0xproof3', '0xproof4'],
            leaf: '0xleaf2',
          },
        ],
      }

      sandbox.stub(MerkleTreeHelper, 'generateTreeWithProofs').returns(mockMerkleResult)

      const result = await capitalDistributorGovernance.generateMerkleData({
        campaignId: testCampaignId,
      })

      expect(result.success).to.be.true
      expect(result.merkleRoot).to.equal(mockMerkleResult.merkleRoot)
      expect(result.totalMembers).to.equal(2)
      expect(result.updatedMembers).to.equal(2)

      const updatedRewards = await Models.CampaignReward.find({
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
      }).sort({ userAddress: 1 })

      expect(updatedRewards).to.have.lengthOf(2)
      expect(updatedRewards[0].proof).to.deep.equal(['0xproof1', '0xproof2'])
      expect(updatedRewards[0].leaf).to.equal('0xleaf1')
      expect(updatedRewards[1].proof).to.deep.equal(['0xproof3', '0xproof4'])
      expect(updatedRewards[1].leaf).to.equal('0xleaf2')
    })

    it('should reject merkle generation for active campaign', async () => {
      await Models.Campaign.create({
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
        transactionHash: '0x123',
        blockNumber: 100,
        blockTimestamp: 1640995200,
        metadataURI: 'https://ipfs.io/ipfs/test',
        allocationStrategy: testPluginAddress,
        token: '0xtoken123',
        payoutEncoder: '0xencoder123',
        multipleClaimsAllowed: true,
        startTime: 1640995200,
        endTime: 1672531200,
        active: true,
        merkleRoot: '0x123',
      })

      await expect(
        capitalDistributorGovernance.generateMerkleData({
          campaignId: testCampaignId,
        }),
      ).to.be.rejected
    })

    it('should reject merkle generation for ended campaign', async () => {
      await Models.Campaign.create({
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
        transactionHash: '0x123',
        blockNumber: 100,
        blockTimestamp: 1640995200,
        metadataURI: 'https://ipfs.io/ipfs/test',
        allocationStrategy: testPluginAddress,
        token: '0xtoken123',
        payoutEncoder: '0xencoder123',
        multipleClaimsAllowed: true,
        startTime: 1640995200,
        endTime: 1672531200,
        active: false,
        ended: true,
        merkleRoot: '0x123',
      })

      await expect(
        capitalDistributorGovernance.generateMerkleData({
          campaignId: testCampaignId,
        }),
      ).to.be.rejected
    })

    it('should return failure when no campaign rewards exist', async () => {
      await Models.CampaignReward.deleteMany({
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
      })

      await expect(
        capitalDistributorGovernance.generateMerkleData({
          campaignId: testCampaignId,
        }),
      ).to.be.rejected
    })

    it('should handle merkle tree generation errors', async () => {
      sandbox.stub(MerkleTreeHelper, 'generateTreeWithProofs').throws(new Error('Merkle error'))

      const result = await capitalDistributorGovernance.generateMerkleData({
        campaignId: testCampaignId,
      })

      expect(result.success).to.be.false
      expect(loggerWarnStub.calledWith('Error generating merkle data')).to.be.true
    })
  })

  describe('getUserCampaignReward', () => {
    const userAddress = '0x1111111111111111111111111111111111111111' as HexAddress

    it('should return reward data for existing user', async () => {
      await Models.CampaignReward.create({
        id: 'test-reward',
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
        userAddress,
        amount: '1000',
        totalClaimed: '250',
        claims: [
          {
            claimedAmount: '250',
            transactionHash: '0xabc',
            blockNumber: 123,
            blockTimestamp: 1640995200,
          },
        ],
        proof: ['0x123', '0x456'],
        leaf: '0xleaf',
      })

      const result = await capitalDistributorGovernance.getUserCampaignReward({
        campaignId: testCampaignId,
        userAddress,
      })

      expect(result.exists).to.be.true
      expect(result.amount).to.equal('1000')
      expect(result.totalClaimed).to.equal('250')
      expect(result.claims).to.have.lengthOf(1)
      expect(result.proof).to.deep.equal(['0x123', '0x456'])
      expect(result.leaf).to.equal('0xleaf')
      expect(result.isFullyClaimed).to.be.false
      expect(result.pluginAddress).to.equal(testPluginAddress)
      expect(result.network).to.equal(testNetwork)
    })

    it('should return exists: false for non-existing reward', async () => {
      const result = await capitalDistributorGovernance.getUserCampaignReward({
        campaignId: testCampaignId,
        userAddress,
      })

      expect(result.exists).to.be.false
      expect(result.campaignId).to.equal(testCampaignId)
      expect(result.userAddress).to.equal(userAddress)
      expect(result.pluginAddress).to.equal(testPluginAddress)
      expect(result.network).to.equal(testNetwork)
    })

    it('should correctly identify fully claimed rewards', async () => {
      await Models.CampaignReward.create({
        id: 'test-reward-claimed',
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
        userAddress,
        amount: '1000',
        totalClaimed: '1000',
        claims: [
          {
            claimedAmount: '500',
            transactionHash: '0xabc',
            blockNumber: 123,
            blockTimestamp: 1640995200,
          },
          {
            claimedAmount: '500',
            transactionHash: '0xdef',
            blockNumber: 124,
            blockTimestamp: 1640995300,
          },
        ],
        proof: ['0x123'],
        leaf: '0xleaf',
      })

      const result = await capitalDistributorGovernance.getUserCampaignReward({
        campaignId: testCampaignId,
        userAddress,
      })

      expect(result.exists).to.be.true
      expect(result.isFullyClaimed).to.be.true
      expect(result.totalClaimed).to.equal('1000')
      expect(result.amount).to.equal('1000')
    })

    it('should handle missing proof, leaf, and claims in getUserCampaignReward', async () => {
      await Models.CampaignReward.create({
        id: 'test-reward-no-optional-fields',
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
        userAddress,
        amount: '500',
      })

      const result = await capitalDistributorGovernance.getUserCampaignReward({
        campaignId: testCampaignId,
        userAddress,
      })

      expect(result.exists).to.be.true
      expect(result.totalClaimed).to.equal('0')
      expect(result.claims).to.deep.equal([])
      expect(result.proof).to.be.null
      expect(result.leaf).to.be.null
      expect(result.isFullyClaimed).to.be.false
    })
  })

  describe('getCampaignDetails', () => {
    it('should return campaign details with member count', async () => {
      await Models.Campaign.create({
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
        transactionHash: '0x123',
        blockNumber: 100,
        blockTimestamp: 1640995200,
        metadataURI: 'https://ipfs.io/ipfs/test',
        allocationStrategy: testPluginAddress,
        token: '0xtoken123',
        payoutEncoder: '0xencoder123',
        multipleClaimsAllowed: true,
        startTime: 1640995200,
        endTime: 1672531200,
        active: false,
        merkleRoot: '0xmerkleroot123',
      })

      await Models.CampaignReward.create({
        id: 'reward-1',
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
        userAddress: '0x1111111111111111111111111111111111111111',
        amount: '100',
        totalClaimed: '0',
        claims: [],
      })

      await Models.CampaignReward.create({
        id: 'reward-2',
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
        userAddress: '0x2222222222222222222222222222222222222222',
        amount: '200',
        totalClaimed: '0',
        claims: [],
      })

      const result = await capitalDistributorGovernance.getCampaignDetails({
        campaignId: testCampaignId,
      })

      expect(result.campaignId).to.equal(testCampaignId)
      expect(result.membersCount).to.equal(2)
      expect(result.merkleRoot).to.equal('0xmerkleroot123')
      expect(result.active).to.be.false
    })
  })

  describe('updateDaoMetrics', () => {
    it('should log that DAO metrics are not implemented', async () => {
      const result = await capitalDistributorGovernance.updateDaoMetrics()

      expect(result).to.be.null
      expect(loggerInfoStub.calledWith('CapitalDistributor governance does not implement DAO metrics')).to.be.true
    })
  })

  describe('getCampaignsWithPagination', () => {
    beforeEach(async () => {
      await Models.Campaign.create({
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
        transactionHash: '0x123',
        blockNumber: 100,
        blockTimestamp: 1640995200,
        metadataURI: 'https://ipfs.io/ipfs/test',
        allocationStrategy: testPluginAddress,
        token: '0xtoken123',
        payoutEncoder: '0xencoder123',
        multipleClaimsAllowed: true,
        startTime: 1640995200,
        endTime: 1672531200,
        active: true,
      })
    })

    it('should delegate to Models.Campaign.getCampaignsWithPagination', async () => {
      const paginationParams = { page: 1, pageSize: 10 }
      const apiParams = { pluginAddress: testPluginAddress, network: testNetwork }

      const result = await capitalDistributorGovernance.getCampaignsWithPagination(paginationParams, apiParams)

      expect(result).to.have.property('data')
      expect(result).to.have.property('metadata')
      expect(result.data).to.be.an('array')
    })
  })

  describe('getUserCampaignStatus', () => {
    it('should delegate to Models.CampaignReward.getUserCampaignStatus', async () => {
      const userAddress = '0x1111111111111111111111111111111111111111' as HexAddress

      await Models.CampaignReward.create({
        id: 'test-status-reward',
        pluginAddress: testPluginAddress,
        network: testNetwork,
        campaignId: testCampaignId,
        userAddress,
        amount: '1000',
        totalClaimed: '500',
        claims: [],
      })

      const result = await capitalDistributorGovernance.getUserCampaignStatus(userAddress)

      expect(result).to.have.property('totalClaimed')
      expect(result).to.have.property('totalClaimable')
    })

    it('should throw error for invalid userAddress', async () => {
      await expect(capitalDistributorGovernance.getUserCampaignStatus('' as any)).to.be.rejected
    })
  })

  describe('BaseGovernance empty method implementations', () => {
    it('should return null for getOrCreate', async () => {
      const result = await capitalDistributorGovernance.getOrCreate()
      expect(result).to.be.null
    })

    it('should return null for create', async () => {
      const result = await capitalDistributorGovernance.create()
      expect(result).to.be.null
    })

    it('should return null for update', async () => {
      const result = await capitalDistributorGovernance.update()
      expect(result).to.be.null
    })

    it('should return false for delete', async () => {
      const result = await capitalDistributorGovernance.delete()
      expect(result).to.be.false
    })

    it('should return null for findOne', async () => {
      const result = await capitalDistributorGovernance.findOne()
      expect(result).to.be.null
    })

    it('should return empty paginated result for findAndPaginateMembers', async () => {
      const result = await capitalDistributorGovernance.findAndPaginateMembers()
      expect(result.data).to.deep.equal([])
      expect(result.metadata.totalRecords).to.equal(0)
    })
  })
})
