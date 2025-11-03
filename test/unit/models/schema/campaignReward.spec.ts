import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum, HexAddress } from '@types'
import CampaignReward from '@models/schema/campaignReward'
import { Models } from '@dbModels'

describe('Model: CampaignReward', () => {
  let sandbox: SinonSandbox
  let rawReward: Partial<CampaignReward>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawReward = {
      pluginAddress: '0xabcdef1234567890abcdef1234567890abcdef12' as HexAddress,
      network: NetworksEnum.ethereumMainnet,
      campaignId: 'campaign-001',
      userAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
      amount: '1000000000000000000',
      totalClaimed: '0',
      claims: [],
      proof: null,
      leaf: null,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('create', () => {
    it('Should create CampaignReward with auto-generated id', async () => {
      const createdReward = await Models.CampaignReward.create(rawReward)
      const expectedId = Models.CampaignReward.getEntityId({
        network: rawReward.network!,
        pluginAddress: rawReward.pluginAddress!,
        campaignId: rawReward.campaignId!,
        userAddress: rawReward.userAddress!,
      })

      expect(createdReward.id).to.eq(expectedId)
      expect(createdReward.pluginAddress).to.eq(rawReward.pluginAddress)
      expect(createdReward.network).to.eq(rawReward.network)
      expect(createdReward.campaignId).to.eq(rawReward.campaignId)
      expect(createdReward.userAddress).to.eq(rawReward.userAddress)
      expect(createdReward.amount).to.eq(rawReward.amount)
      expect(createdReward.totalClaimed).to.eq('0')
      expect(createdReward.claims).to.deep.eq([])
    })

    it('Should create CampaignReward with provided id', async () => {
      const providedId = 'custom-reward-id'
      rawReward.id = providedId
      const createdReward = await Models.CampaignReward.create(rawReward)

      expect(createdReward.id).to.eq(providedId)
    })
  })

  describe('getEntityId', () => {
    it('Should generate correct entity ID', () => {
      const entityId = Models.CampaignReward.getEntityId({
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xPlugin123' as HexAddress,
        campaignId: 'campaign-123',
        userAddress: '0xUser456' as HexAddress,
      })

      const expected = `${NetworksEnum.ethereumMainnet}-0xPlugin123-campaign-123-0xUser456`
      expect(entityId).to.eq(expected)
    })
  })

  describe('findExisting', () => {
    it('Should find existing reward by params', async () => {
      const createdReward = await Models.CampaignReward.create(rawReward)
      const foundReward = await Models.CampaignReward.findExisting({
        network: rawReward.network!,
        pluginAddress: rawReward.pluginAddress!,
        campaignId: rawReward.campaignId!,
        userAddress: rawReward.userAddress!,
      })

      expect(foundReward?.id).to.eq(createdReward.id)
      expect(foundReward?.userAddress).to.eq(createdReward.userAddress)
    })

    it('Should return null for non-existing reward', async () => {
      const foundReward = await Models.CampaignReward.findExisting({
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0x9999999999999999999999999999999999999999' as HexAddress,
        campaignId: 'non-existing-campaign',
        userAddress: '0x8888888888888888888888888888888888888888' as HexAddress,
      })

      expect(foundReward).to.be.null
    })
  })

  describe('findByEntityId', () => {
    it('Should find reward by entity ID', async () => {
      const createdReward = await Models.CampaignReward.create(rawReward)
      const foundReward = await Models.CampaignReward.findByEntityId(createdReward.id)

      expect(foundReward?.id).to.eq(createdReward.id)
      expect(foundReward?.userAddress).to.eq(createdReward.userAddress)
    })

    it('Should return null for non-existing entity ID', async () => {
      const foundReward = await Models.CampaignReward.findByEntityId('non-existing-id')

      expect(foundReward).to.be.null
    })
  })

  describe('findRewardForCampaign', () => {
    it('Should find reward for specific campaign and user', async () => {
      const createdReward = await Models.CampaignReward.create(rawReward)
      const foundReward = await Models.CampaignReward.findRewardForCampaign(
        createdReward.pluginAddress,
        createdReward.network,
        createdReward.campaignId,
        createdReward.userAddress,
      )

      expect(foundReward?.id).to.eq(createdReward.id)
      expect(foundReward?.userAddress).to.eq(createdReward.userAddress)
    })

    it('Should return null for non-existing reward', async () => {
      const foundReward = await Models.CampaignReward.findRewardForCampaign(
        '0x1234567890123456789012345678901234567890' as HexAddress,
        NetworksEnum.ethereumMainnet,
        'non-existing-campaign',
        '0x9876543210987654321098765432109876543210' as HexAddress,
      )

      expect(foundReward).to.be.null
    })
  })

  describe('addClaim', () => {
    it('Should add claim and update total claimed amount', async () => {
      const createdReward = await Models.CampaignReward.create(rawReward)
      const claimAmount = '500000000000000000'
      const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as HexAddress
      const blockNumber = 12345678
      const blockTimestamp = 1640995200

      await createdReward.addClaim(claimAmount, txHash, blockNumber, blockTimestamp)

      expect(createdReward.totalClaimed).to.eq(claimAmount)
      expect(createdReward.claims).to.have.length(1)
      expect(createdReward.claims[0].claimedAmount).to.eq(claimAmount)
      expect(createdReward.claims[0].transactionHash).to.eq(txHash)
      expect(createdReward.claims[0].blockNumber).to.eq(blockNumber)
      expect(createdReward.claims[0].blockTimestamp).to.eq(blockTimestamp)
    })

    it('Should add multiple claims and accumulate total claimed', async () => {
      const createdReward = await Models.CampaignReward.create(rawReward)
      const firstClaimAmount = '300000000000000000'
      const secondClaimAmount = '200000000000000000'
      const txHash1 = '0xabc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abc1' as HexAddress
      const txHash2 = '0xdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890def2' as HexAddress

      await createdReward.addClaim(firstClaimAmount, txHash1, 12345678, 1640995200)
      await createdReward.addClaim(secondClaimAmount, txHash2, 12345679, 1640995300)

      expect(createdReward.totalClaimed).to.eq('500000000000000000')
      expect(createdReward.claims).to.have.length(2)
      expect(createdReward.claims[0].claimedAmount).to.eq(firstClaimAmount)
      expect(createdReward.claims[1].claimedAmount).to.eq(secondClaimAmount)
    })
  })

  describe('isFullyClaimed getter', () => {
    it('Should return false when not fully claimed', async () => {
      rawReward.amount = '1000000000000000000'
      rawReward.totalClaimed = '500000000000000000'
      const createdReward = await Models.CampaignReward.create(rawReward)

      expect(createdReward.isFullyClaimed).to.be.false
    })

    it('Should return true when fully claimed', async () => {
      rawReward.amount = '1000000000000000000'
      rawReward.totalClaimed = '1000000000000000000'
      const createdReward = await Models.CampaignReward.create(rawReward)

      expect(createdReward.isFullyClaimed).to.be.true
    })

    it('Should return true when over-claimed', async () => {
      rawReward.amount = '1000000000000000000'
      rawReward.totalClaimed = '1500000000000000000'
      const createdReward = await Models.CampaignReward.create(rawReward)

      expect(createdReward.isFullyClaimed).to.be.true
    })
  })

  describe('remainingAmount getter', () => {
    it('Should calculate remaining amount correctly', async () => {
      rawReward.amount = '1000000000000000000'
      rawReward.totalClaimed = '300000000000000000'
      const createdReward = await Models.CampaignReward.create(rawReward)

      expect(createdReward.remainingAmount).to.eq('700000000000000000')
    })

    it('Should return 0 when fully claimed', async () => {
      rawReward.amount = '1000000000000000000'
      rawReward.totalClaimed = '1000000000000000000'
      const createdReward = await Models.CampaignReward.create(rawReward)

      expect(createdReward.remainingAmount).to.eq('0')
    })
  })

  describe('findByCampaign', () => {
    it('Should find all rewards for a campaign', async () => {
      const reward1 = await Models.CampaignReward.create({
        ...rawReward,
        userAddress: '0x1111111111111111111111111111111111111111' as HexAddress,
      })
      const reward2 = await Models.CampaignReward.create({
        ...rawReward,
        userAddress: '0x2222222222222222222222222222222222222222' as HexAddress,
      })

      const rewards = await Models.CampaignReward.findByCampaign(
        rawReward.pluginAddress!,
        rawReward.network!,
        rawReward.campaignId!,
      )

      expect(rewards).to.have.length(2)
      expect(rewards.map(r => r.userAddress)).to.include.members([reward1.userAddress, reward2.userAddress])
    })

    it('Should return empty array for non-existing campaign', async () => {
      const rewards = await Models.CampaignReward.findByCampaign(
        '0x9999999999999999999999999999999999999999' as HexAddress,
        NetworksEnum.ethereumMainnet,
        'non-existing-campaign',
      )

      expect(rewards).to.be.an('array').that.is.empty
    })
  })

  describe('findByUserAddress', () => {
    it('Should find all rewards for a user', async () => {
      const userAddress = '0x1111111111111111111111111111111111111111' as HexAddress
      const reward1 = await Models.CampaignReward.create({
        ...rawReward,
        campaignId: 'campaign-001',
        userAddress,
      })
      const reward2 = await Models.CampaignReward.create({
        ...rawReward,
        campaignId: 'campaign-002',
        userAddress,
      })

      const rewards = await Models.CampaignReward.findByUserAddress(
        rawReward.pluginAddress!,
        rawReward.network!,
        userAddress,
      )

      expect(rewards).to.have.length(2)
      expect(rewards.map(r => r.campaignId)).to.include.members([reward1.campaignId, reward2.campaignId])
    })
  })

  describe('getTotalClaimedByAddress', () => {
    it('Should calculate total claimed amount for user across campaigns', async () => {
      const userAddress = '0x1111111111111111111111111111111111111111' as HexAddress

      await Models.CampaignReward.create({
        ...rawReward,
        campaignId: 'campaign-001',
        userAddress,
        totalClaimed: '300000000000000000',
      })
      await Models.CampaignReward.create({
        ...rawReward,
        campaignId: 'campaign-002',
        userAddress,
        totalClaimed: '200000000000000000',
      })

      const totalClaimed = await Models.CampaignReward.getTotalClaimedByAddress(
        rawReward.pluginAddress!,
        rawReward.network!,
        userAddress,
      )

      expect(totalClaimed).to.eq('500000000000000000')
    })

    it('Should return 0 for user with no rewards', async () => {
      const totalClaimed = await Models.CampaignReward.getTotalClaimedByAddress(
        '0x9999999999999999999999999999999999999999' as HexAddress,
        NetworksEnum.ethereumMainnet,
        '0x8888888888888888888888888888888888888888' as HexAddress,
      )

      expect(totalClaimed).to.eq('0')
    })
  })

  describe('getTotalClaimableByAddress', () => {
    it('Should calculate total claimable amount for user', async () => {
      const userAddress = '0x1111111111111111111111111111111111111111' as HexAddress

      await Models.CampaignReward.create({
        ...rawReward,
        campaignId: 'campaign-001',
        userAddress,
        amount: '1000000000000000000',
        totalClaimed: '300000000000000000',
      })
      await Models.CampaignReward.create({
        ...rawReward,
        campaignId: 'campaign-002',
        userAddress,
        amount: '800000000000000000',
        totalClaimed: '200000000000000000',
      })

      const totalClaimable = await Models.CampaignReward.getTotalClaimableByAddress(
        rawReward.pluginAddress!,
        rawReward.network!,
        userAddress,
      )

      expect(totalClaimable).to.eq('1300000000000000000')
    })

    it('Should return 0 when user has no claimable rewards', async () => {
      const totalClaimable = await Models.CampaignReward.getTotalClaimableByAddress(
        rawReward.pluginAddress!,
        rawReward.network!,
        '0x9999999999999999999999999999999999999999' as HexAddress,
      )

      expect(totalClaimable).to.eq('0')
    })
  })

  describe('calculateTotalRewards', () => {
    it('Should calculate total rewards for a campaign', async () => {
      await Models.CampaignReward.create({
        ...rawReward,
        userAddress: '0x1111111111111111111111111111111111111111' as HexAddress,
        amount: '1000000000000000000',
      })
      await Models.CampaignReward.create({
        ...rawReward,
        userAddress: '0x2222222222222222222222222222222222222222' as HexAddress,
        amount: '500000000000000000',
      })

      const totalRewards = await Models.CampaignReward.calculateTotalRewards(
        rawReward.pluginAddress!,
        rawReward.network!,
        rawReward.campaignId!,
      )

      expect(totalRewards).to.eq('1500000000000000000')
    })

    it('Should return 0 for campaign with no rewards', async () => {
      const totalRewards = await Models.CampaignReward.calculateTotalRewards(
        '0x9999999999999999999999999999999999999999' as HexAddress,
        NetworksEnum.ethereumMainnet,
        'non-existing-campaign',
      )

      expect(totalRewards).to.eq('0')
    })
  })

  describe('getUserCampaignStatus', () => {
    it('Should return user campaign status across all campaigns', async () => {
      const userAddress = '0x1111111111111111111111111111111111111111' as HexAddress

      await Models.CampaignReward.create({
        ...rawReward,
        campaignId: 'campaign-001',
        userAddress,
        amount: '1000000000000000000',
        totalClaimed: '400000000000000000',
      })
      await Models.CampaignReward.create({
        ...rawReward,
        campaignId: 'campaign-002',
        userAddress,
        amount: '800000000000000000',
        totalClaimed: '300000000000000000',
      })

      const status = await Models.CampaignReward.getUserCampaignStatus(
        rawReward.pluginAddress!,
        rawReward.network!,
        userAddress,
      )

      expect(status.totalClaimed).to.eq('700000000000000000')
      expect(status.totalClaimable).to.eq('1100000000000000000')
    })

    it('Should return zeros when user has no rewards', async () => {
      const status = await Models.CampaignReward.getUserCampaignStatus(
        rawReward.pluginAddress!,
        rawReward.network!,
        '0x9999999999999999999999999999999999999999' as HexAddress,
      )

      expect(status.totalClaimed).to.eq('0')
      expect(status.totalClaimable).to.eq('0')
    })
  })

  describe('update', () => {
    it('Should update campaign reward properties', async () => {
      const createdReward = await Models.CampaignReward.create(rawReward)
      const newAmount = '2000000000000000000'
      const newProof = ['0xproof1', '0xproof2']

      await createdReward.update({
        amount: newAmount,
        proof: newProof,
      })

      expect(createdReward.amount).to.eq(newAmount)
      expect(createdReward.proof).to.deep.eq(newProof)
    })

    it('Should not update required fields with null values', async () => {
      const createdReward = await Models.CampaignReward.create(rawReward)
      const originalAmount = createdReward.amount

      await createdReward.update({
        amount: null as any,
      })

      expect(createdReward.amount).to.eq(originalAmount)
    })

    it('Should skip update when field does not exist in schema', async () => {
      const createdReward = await Models.CampaignReward.create(rawReward)

      // Try to update with non-existent field
      await createdReward.update({
        nonExistentField: 'some value',
      } as any)

      // Should not throw error, just skip the field
      expect(createdReward).to.exist
    })
  })

  describe('reload', () => {
    it('Should reload document from database', async () => {
      const createdReward = await Models.CampaignReward.create(rawReward)

      const reloadedReward = await createdReward.reload()

      expect(reloadedReward?.id).to.eq(createdReward.id)
      expect(reloadedReward?.userAddress).to.eq(createdReward.userAddress)
    })
  })
})
