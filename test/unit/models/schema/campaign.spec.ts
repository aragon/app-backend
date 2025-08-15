import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum, HexAddress, IClaimStat, ITokenType } from '@types'
import Campaign, { CampaignMetadata } from '@models/schema/campaign'
import { Models } from '@dbModels'

describe('Model: Campaign', () => {
  let sandbox: SinonSandbox
  let rawCampaign: Partial<Campaign>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawCampaign = {
      transactionHash: '0x1234567890abcdef1234567890abcdef12345678901234567890abcdef123456' as HexAddress,
      blockNumber: 12345678,
      blockTimestamp: 1640995200,
      network: NetworksEnum.ethereumMainnet,
      pluginAddress: '0xabcdef1234567890abcdef1234567890abcdef12' as HexAddress,
      campaignId: 'campaign-001',
      allocationStrategy: '0x1234567890abcdef1234567890abcdef12345678' as HexAddress,
      token: '0xA0b86a33E6441D05d6E4C83c5c7E72d4e9B17c2' as HexAddress,
      payoutEncoder: '0xfedcba0987654321fedcba0987654321fedcba09' as HexAddress,
      multipleClaimsAllowed: true,
      startTime: 1640995200,
      endTime: 1672531200,
      active: true,
      metadataURI: 'https://ipfs.io/ipfs/QmTest123',
      claimCount: 0,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('create', () => {
    it('Should create Campaign with auto-generated id', async () => {
      const createdCampaign = await Models.Campaign.create(rawCampaign)
      const expectedId = Models.Campaign.getEntityId({
        network: rawCampaign.network!,
        pluginAddress: rawCampaign.pluginAddress!,
        campaignId: rawCampaign.campaignId!,
      })

      expect(createdCampaign.id).to.eq(expectedId)
      expect(createdCampaign.pluginAddress).to.eq(rawCampaign.pluginAddress)
      expect(createdCampaign.network).to.eq(rawCampaign.network)
      expect(createdCampaign.campaignId).to.eq(rawCampaign.campaignId)
      expect(createdCampaign.active).to.eq(true)
    })
  })

  describe('findExisting', () => {
    it('Should find existing campaign', async () => {
      const createdCampaign = await Models.Campaign.create(rawCampaign)
      const foundCampaign = await Models.Campaign.findExisting({
        network: createdCampaign.network,
        pluginAddress: createdCampaign.pluginAddress,
        campaignId: createdCampaign.campaignId,
      })

      expect(foundCampaign?.id).to.eq(createdCampaign.id)
    })

    it('Should return null for non-existing campaign', async () => {
      const foundCampaign = await Models.Campaign.findExisting({
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0x1234567890123456789012345678901234567890' as HexAddress,
        campaignId: 'non-existing',
      })

      expect(foundCampaign).to.be.null
    })
  })

  describe('findCampaignById', () => {
    it('Should find campaign by plugin, network, and campaignId', async () => {
      const createdCampaign = await Models.Campaign.create(rawCampaign)
      const foundCampaign = await Models.Campaign.findCampaignById(
        createdCampaign.pluginAddress,
        createdCampaign.network,
        createdCampaign.campaignId,
      )

      expect(foundCampaign?.id).to.eq(createdCampaign.id)
    })
  })

  describe('update', () => {
    it('Should update campaign active status', async () => {
      const createdCampaign = await Models.Campaign.create(rawCampaign)

      await createdCampaign.update({ active: false })

      expect(createdCampaign.active).to.be.false
    })
  })

  describe('updateMerkleRoot', () => {
    it('Should update merkle root', async () => {
      const createdCampaign = await Models.Campaign.create(rawCampaign)
      const newRoot = '0x1111111111111111111111111111111111111111111111111111111111111111'

      await createdCampaign.updateMerkleRoot(newRoot)

      expect(createdCampaign.merkleRoot).to.eq(newRoot)
    })
  })

  describe('incrementClaimCount', () => {
    it('Should increment claim count from 0', async () => {
      const createdCampaign = await Models.Campaign.create(rawCampaign)

      expect(createdCampaign.claimCount).to.eq(0)

      await createdCampaign.incrementClaimCount()

      expect(createdCampaign.claimCount).to.eq(1)
    })

    it('Should increment claim count from existing value', async () => {
      rawCampaign.claimCount = 5
      const createdCampaign = await Models.Campaign.create(rawCampaign)

      expect(createdCampaign.claimCount).to.eq(5)

      await createdCampaign.incrementClaimCount()

      expect(createdCampaign.claimCount).to.eq(6)
    })

    it('Should handle null/undefined claim count', async () => {
      const createdCampaign = await Models.Campaign.create(rawCampaign)

      // Manually set to null to test safety
      createdCampaign.claimCount = null as any

      await createdCampaign.incrementClaimCount()

      expect(createdCampaign.claimCount).to.eq(1)
    })
  })

  describe('updateMetadata', () => {
    it('Should update metadata when it exists', async () => {
      rawCampaign.metadata = { title: 'Original', description: 'Test', resources: [] } as CampaignMetadata
      const createdCampaign = await Models.Campaign.create(rawCampaign)

      await createdCampaign.updateMetadata({
        title: 'Updated Name',
        description: 'Updated Description',
      })

      expect(createdCampaign.metadata?.title).to.eq('Updated Name')
      expect(createdCampaign.metadata?.description).to.eq('Updated Description')
    })

    it('Should create metadata when it is null', async () => {
      rawCampaign.metadata = null
      const createdCampaign = await Models.Campaign.create(rawCampaign)

      await createdCampaign.updateMetadata({
        title: 'New Name',
      })

      expect(createdCampaign.metadata?.title).to.eq('New Name')
    })
  })

  describe('getCampaignsWithPagination', () => {
    beforeEach(async () => {
      // Create test token
      await Models.Token.create({
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
        address: '0xA0b86a33E6441D05d6E4C83c5c7E72d4e9B17c2',
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        priceUsd: '1.5',
      })

      // Create test campaigns
      const campaigns = [
        {
          ...rawCampaign,
          campaignId: 'campaign-001',
          merkleRoot: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          metadata: {
            name: 'First Campaign',
            description: 'Description for first campaign',
            links: [],
          } as CampaignMetadata,
        },
        {
          ...rawCampaign,
          campaignId: 'campaign-002',
          merkleRoot: null,
          metadata: {
            name: 'Second Campaign',
            description: 'Description for second campaign',
            links: [],
          } as CampaignMetadata,
        },
      ]

      await Promise.all(campaigns.map(campaign => Models.Campaign.create(campaign)))

      // Create test rewards
      const rewards = [
        {
          pluginAddress: rawCampaign.pluginAddress!,
          network: rawCampaign.network!,
          campaignId: 'campaign-001',
          userAddress: '0xUser1234567890123456789012345678901234567890' as HexAddress,
          amount: '1000000000000000000',
          totalClaimed: '500000000000000000',
          claims: [
            {
              claimedAmount: '500000000000000000',
              transactionHash: '0xClaim123456789012345678901234567890123456789012345678901234567890' as HexAddress,
              blockNumber: 12345678,
              blockTimestamp: 1640995200,
            },
          ],
          proof: ['0xproof1', '0xproof2'],
          leaf: '0xleaf123',
        },
        {
          pluginAddress: rawCampaign.pluginAddress!,
          network: rawCampaign.network!,
          campaignId: 'campaign-002',
          userAddress: '0xUser1234567890123456789012345678901234567890' as HexAddress,
          amount: '2000000000000000000',
          totalClaimed: '0',
          claims: [],
          proof: ['0xproof3', '0xproof4'],
          leaf: '0xleaf456',
        },
        {
          pluginAddress: rawCampaign.pluginAddress!,
          network: rawCampaign.network!,
          campaignId: 'campaign-001',
          userAddress: '0xFullyClaimedUser12345678901234567890123456' as HexAddress,
          amount: '1000000000000000000',
          totalClaimed: '1000000000000000000',
          claims: [
            {
              claimedAmount: '1000000000000000000',
              transactionHash: '0xFullClaim12345678901234567890123456789012345678901234567890123456' as HexAddress,
              blockNumber: 12345679,
              blockTimestamp: 1640995300,
            },
          ],
          proof: ['0xproof5', '0xproof6'],
          leaf: '0xleaf789',
        },
      ]

      await Promise.all(rewards.map(reward => Models.CampaignReward.create(reward)))
    })

    it('Should return campaigns with user data - partially claimed', async () => {
      const result = await Models.Campaign.getCampaignsWithPagination({
        paginationParams: {},
        extraParams: {
          pluginAddress: rawCampaign.pluginAddress!,
          network: rawCampaign.network!,
          userAddress: '0xUser1234567890123456789012345678901234567890' as HexAddress,
        },
      })

      expect(result.data.length).to.eq(2)

      const partiallyClaimedCampaign = result.data.find(c => c.campaignId === 'campaign-001')
      expect(partiallyClaimedCampaign?.userData.status).to.eq(IClaimStat.CLAIMABLE)
      expect(partiallyClaimedCampaign?.userData.totalAmount).to.eq('1000000000000000000')
      expect(partiallyClaimedCampaign?.userData.totalClaimed).to.eq('500000000000000000')
      expect(partiallyClaimedCampaign?.userData.claims).to.have.length(1)
      expect(partiallyClaimedCampaign?.userData.proofs).to.deep.eq(['0xproof1', '0xproof2'])

      const unclaimedCampaign = result.data.find(c => c.campaignId === 'campaign-002')
      expect(unclaimedCampaign?.userData.status).to.eq(IClaimStat.CLAIMABLE)
      expect(unclaimedCampaign?.userData.totalAmount).to.eq('2000000000000000000')
      expect(unclaimedCampaign?.userData.totalClaimed).to.eq('0')
      expect(unclaimedCampaign?.userData.claims).to.have.length(0)
    })

    it('Should return campaigns with user data - fully claimed', async () => {
      const result = await Models.Campaign.getCampaignsWithPagination({
        paginationParams: {},
        extraParams: {
          pluginAddress: rawCampaign.pluginAddress!,
          network: rawCampaign.network!,
          userAddress: '0xFullyClaimedUser12345678901234567890123456' as HexAddress,
        },
      })

      expect(result.data.length).to.eq(2)

      const fullyClaimedCampaign = result.data.find(c => c.campaignId === 'campaign-001')
      expect(fullyClaimedCampaign?.userData.status).to.eq(IClaimStat.CLAIMED)
      expect(fullyClaimedCampaign?.userData.totalAmount).to.eq('1000000000000000000')
      expect(fullyClaimedCampaign?.userData.totalClaimed).to.eq('1000000000000000000')
      expect(fullyClaimedCampaign?.userData.claims).to.have.length(1)
    })

    it('Should filter by claim status - CLAIMABLE', async () => {
      const result = await Models.Campaign.getCampaignsWithPagination({
        paginationParams: {},
        extraParams: {
          pluginAddress: rawCampaign.pluginAddress!,
          network: rawCampaign.network!,
          userAddress: '0xUser1234567890123456789012345678901234567890' as HexAddress,
          status: IClaimStat.CLAIMABLE,
        },
      })

      expect(result.data.length).to.eq(2)
      result.data.forEach(campaign => {
        expect(campaign.userData.status).to.eq(IClaimStat.CLAIMABLE)
      })
    })

    it('Should filter by claim status - CLAIMED', async () => {
      const result = await Models.Campaign.getCampaignsWithPagination({
        paginationParams: {},
        extraParams: {
          pluginAddress: rawCampaign.pluginAddress!,
          network: rawCampaign.network!,
          userAddress: '0xFullyClaimedUser12345678901234567890123456' as HexAddress,
          status: IClaimStat.CLAIMED,
        },
      })

      expect(result.data.length).to.eq(1)
      expect(result.data[0].userData.status).to.eq(IClaimStat.CLAIMED)
      expect(result.data[0].campaignId).to.eq('campaign-001')
    })

    it('Should return empty data for non-existing user', async () => {
      const result = await Models.Campaign.getCampaignsWithPagination({
        paginationParams: {},
        extraParams: {
          pluginAddress: rawCampaign.pluginAddress!,
          network: rawCampaign.network!,
          userAddress: '0xNonExistentUser1234567890123456789012345678' as HexAddress,
        },
      })

      expect(result.data.length).to.eq(2)
      result.data.forEach(campaign => {
        expect(campaign.userData.status).to.eq(IClaimStat.CLAIMABLE)
        expect(campaign.userData.totalAmount).to.eq('0')
        expect(campaign.userData.totalClaimed).to.eq('0')
        expect(campaign.userData.claims).to.have.length(0)
      })
    })

    it('Should handle pagination correctly', async () => {
      const result = await Models.Campaign.getCampaignsWithPagination({
        paginationParams: { page: 1, pageSize: 1 },
        extraParams: {
          pluginAddress: rawCampaign.pluginAddress!,
          network: rawCampaign.network!,
          userAddress: '0xUser1234567890123456789012345678901234567890' as HexAddress,
        },
      })

      expect(result.data.length).to.eq(1)
      expect(result.metadata.page).to.eq(1)
      expect(result.metadata.pageSize).to.eq(1)
      expect(result.metadata.totalRecords).to.eq(2)
      expect(result.metadata.totalPages).to.eq(2)
    })

    it('Should include token and strategy information', async () => {
      const result = await Models.Campaign.getCampaignsWithPagination({
        paginationParams: {},
        extraParams: {
          pluginAddress: rawCampaign.pluginAddress!,
          network: rawCampaign.network!,
          userAddress: '0xUser1234567890123456789012345678901234567890' as HexAddress,
        },
      })

      expect(result.data.length).to.eq(2)

      result.data.forEach(campaign => {
        expect(campaign.token).to.exist
        expect(campaign.token.symbol).to.eq('TEST')
        expect(campaign.strategy).to.exist
      })

      const campaignWithRoot = result.data.find(c => c.campaignId === 'campaign-001')
      expect(campaignWithRoot?.strategy.root).to.eq(
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      )

      const campaignWithoutRoot = result.data.find(c => c.campaignId === 'campaign-002')
      expect(campaignWithoutRoot?.strategy.root).to.eq('')
    })

    it('Should work without userAddress and not include userData field', async () => {
      const result = await Models.Campaign.getCampaignsWithPagination({
        paginationParams: {},
        extraParams: {
          pluginAddress: rawCampaign.pluginAddress!,
          network: rawCampaign.network!,
        },
      })

      expect(result.data.length).to.eq(2)

      result.data.forEach(campaign => {
        expect(campaign.token).to.exist
        expect(campaign.token.symbol).to.eq('TEST')
        expect(campaign.strategy).to.exist
        expect(campaign.userData).to.be.undefined // userData should not exist without userAddress
      })
    })
  })
})
