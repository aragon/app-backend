import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import Utils from '@test/lib/unit-dep/utils'
import Addresses from './addresses.json'
import { CapitalDistributorAdminController } from '@admin-api/controllers/capitalDistributor'
import { IClaimStat, IPluginInterfaceType, NetworksEnum } from '@types'
import CapitalDistributorController from '@api/controllers/capitalDistributor'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { LogCampaignStrategy } from '@plugins/logCampaignStrategy'
import { LogCapitalDistributor } from '@plugins/logCapitalDistributor'

describe.only('Capital Distributor', () => {
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
            campaignId: "5",
            claims: { $exists: true, $ne: [] }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $toDecimal: "$totalClaimed" } }
          }
        },
        {
          $project: {
            total: { $toString: "$total" }
          }
        }
      ]
    )
    expect(claimRewards[0].total).to.be.eq(campaign.totalClaimed.toString())
  })
})
