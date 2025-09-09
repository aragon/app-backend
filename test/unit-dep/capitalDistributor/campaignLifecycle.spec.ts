import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { CapitalDistributorAdminController } from '@services/aragon-admin-api/controllers/capitalDistributor'
import CapitalDistributorController from '@services/aragon-api/controllers/capitalDistributor'
import { CapitalDistributorHandler } from '@handlers/capitalDistributorHandler'
import { IPluginInterfaceType, NetworksEnum, type HexAddress } from '@types'
import { Models } from '@dbModels'
import { LogCampaignStrategy } from '@services/aragon-plugins/logCampaignStrategy'

describe('Integration: CapitalDistributor Campaign Lifecycle', () => {
  let sandbox: SinonSandbox

  const network = NetworksEnum.ethereumSepolia
  const daoAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const pluginAddress = '0x5dA61302D0d08d80D39f015b75595052fD4CdD06' as HexAddress
  const campaignId = '1'

  // Initial user list
  const initialUsers = [
    { address: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409' as HexAddress, amount: '1000' },
    { address: '0xF6ad40D5D477ade0C640eaD49944bdD0AA1fBF05' as HexAddress, amount: '2000' },
    { address: '0x764a31E070c6Ea2E81CbC1f680BF9a07f762ED2c' as HexAddress, amount: '3000' },
  ]

  // Updated user list after pause (preserves user1 who claimed, removes user2, adds new user)
  const updatedUsers = [
    { address: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409' as HexAddress, amount: '1500' }, // user1 - claimed, amount updated
    { address: '0x764a31E070c6Ea2E81CbC1f680BF9a07f762ED2c' as HexAddress, amount: '3500' }, // user3 - not claimed, amount updated
    { address: '0x00C51Fad10462780e488B54D413aD92B28b88204' as HexAddress, amount: '4000' }, // new user4
  ]

  beforeEach(function () {
    this.timeout(100000000)
    sandbox = sinon.createSandbox()

    // Stub the LogCampaignStrategy.start to prevent actual blockchain crawler from starting
    sandbox.stub(LogCampaignStrategy, 'start').resolves()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle complete campaign lifecycle with pause/resume/claims/updates', async function () {
    this.timeout(100000000)

    // Step 1: Create mock DAO and Plugin
    await Models.Dao.create({
      id: `${network}-${daoAddress.toLowerCase()}`,
      network,
      address: daoAddress,
      name: 'Test DAO',
      description: 'Test DAO for Capital Distributor',
      transactionHash: '0xdao123',
      blockNumber: 100,
      blockTimestamp: 1640995200,
      ensName: 'test-dao.eth',
      creatorAddress: '0x1111111111111111111111111111111111111111' as HexAddress,
    })

    await Models.Plugin.create({
      id: `${network}-${pluginAddress.toLowerCase()}-0`,
      address: pluginAddress,
      network,
      transactionHash: '0xplugin123',
      blockNumber: 101,
      status: 'installed',
      interfaceType: IPluginInterfaceType.capitalDistributor,
      daoAddress,
      isSupported: true,
    })

    // Step 2: Admin uploads initial member list and generates merkle data FIRST
    await CapitalDistributorAdminController.uploadMembersList({
      campaignId,
      pluginAddress,
      network,
      rewards: initialUsers,
    })

    await CapitalDistributorAdminController.generateMerkleData({
      campaignId,
      pluginAddress,
      network,
    })

    // Verify sync completed: merkle root and proofs set
    const rewardsAfterSync = await Models.CampaignReward.find({
      pluginAddress,
      network,
      campaignId,
    })
    expect(rewardsAfterSync).to.have.lengthOf(3)

    // Verify all rewards have proofs and leaf after sync
    rewardsAfterSync.forEach(reward => {
      expect(reward.proof).to.be.an('array')
      expect(reward.leaf).to.be.a('string')
      expect(reward.proof.length).to.be.greaterThan(0)
    })

    // Step 3: THEN trigger campaign creation handler
    const campaignCreationEvent = {
      args: {
        campaignId: BigInt(campaignId),
        metadataURI: 'https://ipfs.io/ipfs/QmTestCampaign',
        allocationStrategy: pluginAddress,
        token: '0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357',
        actionEncoder: '0xB1c86a33E6417aB8E96c8Bec61AF9A42D0b4f5B2',
        startTime: BigInt(1640995200),
        endTime: BigInt(1672531200),
      },
    } as any

    const logInfo = {
      address: pluginAddress,
      network,
      transactionHash: '0xcampaign123',
      blockNumber: 102,
      blockTimestamp: 1640995300,
    }

    await CapitalDistributorHandler.campaignCreated(campaignCreationEvent, logInfo as any)

    // Step 3b: Trigger merkle campaign set event to update merkle root
    const campaign = await Models.Campaign.findCampaignById(pluginAddress, network, campaignId)
    expect(campaign).to.exist

    // Get the merkle root from one of the campaign rewards that was generated during sync
    const sampleReward = await Models.CampaignReward.findOne({
      pluginAddress,
      network,
      campaignId,
    })
    expect(sampleReward).to.exist
    expect(sampleReward.proof).to.be.an('array')
    expect(sampleReward.leaf).to.be.a('string')

    // For the test, we'll use a mock merkle root since the admin controller would have generated it
    const mockMerkleRoot = '0x1234567890123456789012345678901234567890123456789012345678901234'

    const merkleCampaignSetEvent = {
      args: {
        campaignId: BigInt(campaignId),
        merkleRoot: mockMerkleRoot,
      },
    } as any

    const merkleLogInfo = {
      address: pluginAddress,
      network,
      transactionHash: '0xmerkle123',
      blockNumber: 103,
      blockTimestamp: 1640995400,
    }

    await CapitalDistributorHandler.merkleCampaignSet(merkleCampaignSetEvent, merkleLogInfo as any)

    // Now verify campaign has merkle root set
    const createdCampaign = await Models.Campaign.findCampaignById(pluginAddress, network, campaignId)
    expect(createdCampaign).to.exist
    expect(createdCampaign.active).to.be.true
    expect(createdCampaign.campaignId).to.equal(campaignId)
    expect(createdCampaign.merkleRoot).to.equal(mockMerkleRoot)

    const initialRewards = await Models.CampaignReward.find({
      pluginAddress,
      network,
      campaignId,
    })
    expect(initialRewards).to.have.lengthOf(3)

    // Step 4: User1 claims some rewards
    const user1ClaimEvent = {
      args: {
        campaignId: BigInt(campaignId),
        recipient: initialUsers[0].address,
        amount: BigInt('500'),
        totalClaimed: BigInt('500'),
      },
    } as any

    const claimLogInfo = {
      address: pluginAddress,
      network,
      transactionHash: '0xclaim123',
      blockNumber: 103,
      blockTimestamp: 1640995400,
    }

    await CapitalDistributorHandler.payoutClaimed(user1ClaimEvent, claimLogInfo as any)

    // Verify user1 has claims recorded
    const user1RewardAfterClaim = await Models.CampaignReward.findRewardForCampaign(
      pluginAddress,
      network,
      campaignId,
      initialUsers[0].address,
    )
    expect(user1RewardAfterClaim.totalClaimed).to.equal('500')
    expect(user1RewardAfterClaim.claims).to.have.lengthOf(1)
    expect(user1RewardAfterClaim.claims[0].claimedAmount).to.equal('500')

    // Step 5: Admin pauses campaign to update a user list
    const pauseEvent = {
      args: {
        campaignId: BigInt(campaignId),
      },
    } as any

    const pauseLogInfo = {
      address: pluginAddress,
      network,
      transactionHash: '0xpause123',
      blockNumber: 104,
      blockTimestamp: 1640995500,
    }

    await CapitalDistributorHandler.campaignPaused(pauseEvent, pauseLogInfo as any)

    // Verify campaign is paused (active: false)
    const pausedCampaign = await Models.Campaign.findCampaignById(pluginAddress, network, campaignId)
    expect(pausedCampaign.active).to.be.false

    // Step 6: Admin updates user list (preserves user1 claims, removes user2, adds user4)
    await CapitalDistributorAdminController.uploadMembersList({
      campaignId,
      pluginAddress,
      network,
      rewards: updatedUsers,
    })

    // Verify smart upsert logic
    const rewardsAfterUpdate = await Models.CampaignReward.find({
      pluginAddress,
      network,
      campaignId,
    }).sort({ userAddress: 1 })

    expect(rewardsAfterUpdate).to.have.lengthOf(3) // user1, user3, user4

    // Verify user1 (who claimed) - claims preserved, amount updated
    const user1AfterUpdate = rewardsAfterUpdate.find(r => r.userAddress === initialUsers[0].address)
    expect(user1AfterUpdate).to.exist
    expect(user1AfterUpdate.amount).to.equal('1500') // Updated amount
    expect(user1AfterUpdate.totalClaimed).to.equal('500') // Claims preserved
    expect(user1AfterUpdate.claims).to.have.lengthOf(1) // Claims preserved

    // Verify user2 (who didn't claim) - removed from database
    const user2AfterUpdate = rewardsAfterUpdate.find(r => r.userAddress === initialUsers[1].address)
    expect(user2AfterUpdate).to.be.undefined

    // Verify user3 (who didn't claim) - amount updated, no claims
    const user3AfterUpdate = rewardsAfterUpdate.find(r => r.userAddress === initialUsers[2].address)
    expect(user3AfterUpdate).to.exist
    expect(user3AfterUpdate.amount).to.equal('3500') // Updated amount
    expect(user3AfterUpdate.totalClaimed).to.equal('0')
    expect(user3AfterUpdate.claims).to.have.lengthOf(0)

    // Verify user4 (new user) - created with no claims
    const user4AfterUpdate = rewardsAfterUpdate.find(r => r.userAddress === updatedUsers[2].address)
    expect(user4AfterUpdate).to.exist
    expect(user4AfterUpdate.amount).to.equal('4000')
    expect(user4AfterUpdate.totalClaimed).to.equal('0')
    expect(user4AfterUpdate.claims).to.have.lengthOf(0)

    // Step 7: Regenerate merkle data after updates
    await CapitalDistributorAdminController.generateMerkleData({
      campaignId,
      pluginAddress,
      network,
    })

    // Verify all users have merkle proofs
    const rewardsWithProofs = await Models.CampaignReward.find({
      pluginAddress,
      network,
      campaignId,
    })
    rewardsWithProofs.forEach(reward => {
      expect(reward.proof).to.be.an('array')
      expect(reward.leaf).to.be.a('string')
      expect(reward.proof.length).to.be.greaterThan(0)
    })

    // Step 8: Resume campaign
    const resumeEvent = {
      args: {
        campaignId: BigInt(campaignId),
      },
    } as any

    const resumeLogInfo = {
      address: pluginAddress,
      network,
      transactionHash: '0xresume123',
      blockNumber: 105,
      blockTimestamp: 1640995600,
    }

    await CapitalDistributorHandler.campaignResumed(resumeEvent, resumeLogInfo as any)

    // Verify campaign is active again
    const resumedCampaign = await Models.Campaign.findCampaignById(pluginAddress, network, campaignId)
    expect(resumedCampaign.active).to.be.true

    // Step 9: User3 claims after resume
    const user3ClaimEvent = {
      args: {
        campaignId: BigInt(campaignId),
        recipient: updatedUsers[1].address, // user3
        amount: BigInt('1000'), // Partial claim
        totalClaimed: BigInt('1000'), // Total claimed so far
      },
    } as any

    const user3ClaimLogInfo = {
      address: pluginAddress,
      network,
      transactionHash: '0xclaim456',
      blockNumber: 106,
      blockTimestamp: 1640995700,
    }

    await CapitalDistributorHandler.payoutClaimed(user3ClaimEvent, user3ClaimLogInfo as any)

    // Verify user3 claim recorded
    const user3AfterClaim = await Models.CampaignReward.findRewardForCampaign(
      pluginAddress,
      network,
      campaignId,
      updatedUsers[1].address,
    )
    expect(user3AfterClaim.totalClaimed).to.equal('1000')
    expect(user3AfterClaim.claims).to.have.lengthOf(1)

    // Step 10: End campaign
    const endEvent = {
      args: {
        campaignId: BigInt(campaignId),
      },
    } as any

    const endLogInfo = {
      address: pluginAddress,
      network,
      transactionHash: '0xend123',
      blockNumber: 107,
      blockTimestamp: 1640995800,
    }

    await CapitalDistributorHandler.campaignEnded(endEvent, endLogInfo as any)

    // Verify campaign is ended (active: false)
    const endedCampaign = await Models.Campaign.findCampaignById(pluginAddress, network, campaignId)
    expect(endedCampaign.active).to.be.false

    // Step 11: Verify the final state through API controllers
    const campaignDetails = await CapitalDistributorAdminController.getCampaignDetails({
      campaignId,
      pluginAddress,
      network,
    })

    expect(campaignDetails.membersCount).to.equal(3) // user1, user3, user4
    expect(campaignDetails.active).to.be.false
    expect(campaignDetails.merkleRoot).to.be.a('string')

    // Test getUserCampaignReward API for each user
    const user1Reward = await CapitalDistributorController.getUserCampaignReward({
      pluginAddress,
      network,
      userAddress: updatedUsers[0].address,
      campaignId,
    })

    expect(user1Reward.exists).to.be.true
    expect(user1Reward.amount).to.equal('1500')
    expect(user1Reward.totalClaimed).to.equal('500')
    expect(user1Reward.claims).to.have.lengthOf(1)
    expect(user1Reward.isFullyClaimed).to.be.false

    const user3Reward = await CapitalDistributorController.getUserCampaignReward({
      pluginAddress,
      network,
      userAddress: updatedUsers[1].address,
      campaignId,
    })

    expect(user3Reward.exists).to.be.true
    expect(user3Reward.amount).to.equal('3500')
    expect(user3Reward.totalClaimed).to.equal('1000')
    expect(user3Reward.claims).to.have.lengthOf(1)

    const user4Reward = await CapitalDistributorController.getUserCampaignReward({
      pluginAddress,
      network,
      userAddress: updatedUsers[2].address,
      campaignId,
    })

    expect(user4Reward.exists).to.be.true
    expect(user4Reward.amount).to.equal('4000')
    expect(user4Reward.totalClaimed).to.equal('0')
    expect(user4Reward.claims).to.have.lengthOf(0)

    // Verify removed user2 doesn't exist
    const removedUser2Reward = await CapitalDistributorController.getUserCampaignReward({
      pluginAddress,
      network,
      userAddress: initialUsers[1].address, // user2 who was removed
      campaignId,
    })

    expect(removedUser2Reward.exists).to.be.false

    // Test getUserCampaignStatus for users
    const user1Status = await CapitalDistributorController.getUserCampaignStatus(
      pluginAddress,
      network,
      updatedUsers[0].address,
    )

    expect(user1Status.totalClaimed).to.equal('500')
    expect(user1Status.totalClaimable).to.equal('1000') // 1500 - 500 claimed

    const user3Status = await CapitalDistributorController.getUserCampaignStatus(
      pluginAddress,
      network,
      updatedUsers[1].address,
    )

    expect(user3Status.totalClaimed).to.equal('1000')
    expect(user3Status.totalClaimable).to.equal('2500') // 3500 - 1000 claimed

    // Test getCampaignsWithPagination
    const campaignsPaginated = await CapitalDistributorController.getCampaignsWithPagination(
      { page: 1, pageSize: 10 },
      { pluginAddress, network },
    )

    expect(campaignsPaginated.data).to.have.lengthOf(1)
    expect(campaignsPaginated.data[0].campaignId).to.equal(campaignId)
    expect(campaignsPaginated.data[0].active).to.be.false
  })
})
