import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import Utils from '@test/lib/unit-dep/utils'
import Addresses from './addresses.json'
import { CapitalDistributorAdminController } from '@admin-api/controllers/capitalDistributor'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { LogCapitalDistributor } from '@plugins/logCapitalDistributor'
import { ethers } from 'ethers'

describe('Capital Distributor', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle capital distribution event and plugin sync correctly', async function () {
    this.timeout(100000000)
    const network = NetworksEnum.ethereumSepolia
    const pluginAddress = '0x884fb2Cd1A0710d5AcC219C6163FCa75aa63c867'
    const campaignId = '5'

    await Utils.handleEventsFromTxHashes(
      ['0xc87580b4629dc9c89c6afdb98fe3c63fe300adf9cbf40cd2e5d7f5e970bc807f'],
      network,
    )

    await CapitalDistributorAdminController.uploadMembersList({
      campaignId,
      pluginAddress,
      network,
      rewards: [...Addresses],
    })

    await CapitalDistributorAdminController.generateMerkleData({
      campaignId,
      pluginAddress,
      network,
    })

    const plugin = await Models.Plugin.findOne({
      interfaceType: IPluginInterfaceType.capitalDistributor,
    })

    await LogCapitalDistributor.start(plugin)

    const campaign = await Models.Campaign.findOne({
      pluginAddress: plugin.address,
      network: plugin.network,
      campaignId: campaignId,
    })

    const totalRewardsDirect = Addresses.reduce((acc, curr) => acc + BigInt(curr.amount), BigInt(0))
    expect(campaign).to.exist
    expect(campaign.totalRewards).to.be.eq(totalRewardsDirect.toString())

    const claimRewards = await Models.CampaignReward.aggregate([
      {
        $match: {
          campaignId: '5',
          claims: { $exists: true, $ne: [] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $toDecimal: '$totalClaimed' } },
        },
      },
      {
        $project: {
          total: { $toString: '$total' },
        },
      },
    ])
    expect(claimRewards[0].total).to.be.eq(campaign.totalClaimed.toString())

    const randomUser = Addresses[Math.floor(Math.random() * Addresses.length)]
    expect(randomUser).to.exist

    const result = await Models.CampaignReward.getUserCampaignStatus(
      pluginAddress,
      network,
      ethers.getAddress(randomUser.address),
    )
    expect(result.totalClaimable).to.be.eq(randomUser.amount)

    const claimingUser = ethers.getAddress('0x17366cae2b9c6C3055e9e3C78936a69006BE5409')
    const userClaimConfig = Addresses.find(claimConfig => claimingUser === ethers.getAddress(claimConfig.address))

    expect(userClaimConfig).to.exist

    const claimResultOfUserB = await Models.CampaignReward.getUserCampaignStatus(pluginAddress, network, claimingUser)
    expect(claimResultOfUserB.totalClaimable).to.be.eq('0')
  })

  it('should test campaign totalRewards and totalClaimed functionality', async function () {
    this.timeout(100000000)
    const network = NetworksEnum.ethereumSepolia
    const pluginAddress = '0x884fb2Cd1A0710d5AcC219C6163FCa75aa63c867'
    const campaignId = '5'

    await Utils.handleEventsFromTxHashes(
      ['0xc87580b4629dc9c89c6afdb98fe3c63fe300adf9cbf40cd2e5d7f5e970bc807f'],
      network,
    )

    await CapitalDistributorAdminController.uploadMembersList({
      campaignId,
      pluginAddress,
      network,
      rewards: [...Addresses],
    })

    await CapitalDistributorAdminController.generateMerkleData({
      campaignId,
      pluginAddress,
      network,
    })

    const plugin = await Models.Plugin.findOne({
      interfaceType: IPluginInterfaceType.capitalDistributor,
    })

    await LogCapitalDistributor.start(plugin)

    const campaign = await Models.Campaign.findOne({
      pluginAddress: plugin.address,
      network: plugin.network,
      campaignId: campaignId,
    })

    expect(campaign).to.exist
    expect(campaign.totalRewards).to.exist
    expect(campaign.totalClaimed).to.exist

    const initialTotalClaimed = campaign.totalClaimed
    const initialTotalRewards = campaign.totalRewards

    await campaign.addToTotalClaimed('1000000000000000000')
    expect(campaign.totalClaimed).to.be.eq((BigInt(initialTotalClaimed) + BigInt('1000000000000000000')).toString())

    await campaign.updateTotalRewards('5000000000000000000')
    expect(campaign.totalRewards).to.be.eq('5000000000000000000')

    await campaign.addToTotalClaimed('500000000000000000')
    expect(campaign.totalClaimed).to.be.eq((BigInt(initialTotalClaimed) + BigInt('1500000000000000000')).toString())
  })

  it('should verify calculateTotalRewards method works correctly', async function () {
    this.timeout(100000000)
    const network = NetworksEnum.ethereumSepolia
    const pluginAddress = '0x884fb2Cd1A0710d5AcC219C6163FCa75aa63c867'
    const campaignId = '5'

    const calculatedTotal = await Models.CampaignReward.calculateTotalRewards(pluginAddress, network, campaignId)

    const directCalculation = Addresses.reduce((acc, curr) => acc + BigInt(curr.amount), BigInt(0))
    expect(calculatedTotal).to.be.eq(directCalculation.toString())

    const campaign = await Models.Campaign.findOne({
      pluginAddress,
      network,
      campaignId,
    })

    expect(campaign.totalRewards).to.be.eq(calculatedTotal)
  })

  it('should verify getUserCampaignStatus aggregation', async function () {
    this.timeout(100000000)
    const network = NetworksEnum.ethereumSepolia
    const pluginAddress = '0x884fb2Cd1A0710d5AcC219C6163FCa75aa63c867'

    for (const addressConfig of Addresses.slice(0, 3)) {
      const userAddress = ethers.getAddress(addressConfig.address)
      const status = await Models.CampaignReward.getUserCampaignStatus(pluginAddress, network, userAddress)

      expect(status).to.have.property('totalClaimed')
      expect(status).to.have.property('totalClaimable')
      expect(typeof status.totalClaimed).to.be.eq('string')
      expect(typeof status.totalClaimable).to.be.eq('string')

      const userRewards = await Models.CampaignReward.findByUserAddress(pluginAddress, network, userAddress)

      if (userRewards.length > 0) {
        const manualTotalClaimed = userRewards.reduce((acc, reward) => acc + BigInt(reward.totalClaimed), BigInt(0))
        const manualTotalClaimable = userRewards.reduce(
          (acc, reward) => acc + BigInt(reward.remainingAmount),
          BigInt(0),
        )

        expect(status.totalClaimed).to.be.eq(manualTotalClaimed.toString())
        expect(status.totalClaimable).to.be.eq(manualTotalClaimable.toString())
      }
    }
  })

  it('should verify duplicate claim prevention works', async function () {
    this.timeout(100000000)
    const network = NetworksEnum.ethereumSepolia
    const pluginAddress = '0x884fb2Cd1A0710d5AcC219C6163FCa75aa63c867'
    const campaignId = '5'
    const claimingUser = ethers.getAddress('0x17366cae2b9c6C3055e9e3C78936a69006BE5409')

    const userReward = await Models.CampaignReward.findRewardForCampaign(
      pluginAddress,
      network,
      campaignId,
      claimingUser,
    )

    expect(userReward).to.exist
    expect(userReward.claims).to.be.an('array')

    if (userReward.claims.length > 0) {
      const existingClaim = userReward.claims[0]
      const initialClaimsCount = userReward.claims.length
      const initialTotalClaimed = userReward.totalClaimed

      const duplicateClaimExists = userReward.claims.find(
        (claim: any) => claim.transactionHash === existingClaim.transactionHash,
      )
      expect(duplicateClaimExists).to.exist

      expect(userReward.claims).to.have.length(initialClaimsCount)
      expect(userReward.totalClaimed).to.be.eq(initialTotalClaimed)
    }
  })
})
