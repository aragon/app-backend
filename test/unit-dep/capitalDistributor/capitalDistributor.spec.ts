import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import Utils from '@test/lib/unit-dep/utils'
import { CapitalDistributorAdminController } from '@admin-api/controllers/capitalDistributor'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { LogCapitalDistributor } from '@plugins/logCapitalDistributor'
import CapitalDistributorController from '@api/controllers/capitalDistributor'
import DaoController from '@api/controllers/dao'

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
    const pluginAddress = '0x5dA61302D0d08d80D39f015b75595052fD4CdD06'

    const addressesses = [{
      campaignId: '0',
      addresses: [
        {
          address: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          amount: '2068407131086655006',
        },
        {
          address: '0xF6ad40D5D477ade0C640eaD49944bdD0AA1fBF05',
          amount: '3066005202605466524'
        },
        {
          address: '0x764a31E070c6Ea2E81CbC1f680BF9a07f762ED2c',
          amount: '3327258466775317797'
        },
        {
          address: '0x00C51Fad10462780e488B54D413aD92B28b88204',
          amount: '4301960492862894413'
        },
        {
          address: '0xD740fd724D616795120BC363316580dAFf41129A',
          amount: '4429543088946624610'
        },
      ],
    }, {
      campaignId: '1',
      addresses: [
        {
          address: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          amount: '5931865400721184342',
        },
        {
          address: '0xF6ad40D5D477ade0C640eaD49944bdD0AA1fBF05',
          amount: '7315096276842113998'
        },
        {
          address: '0x764a31E070c6Ea2E81CbC1f680BF9a07f762ED2c',
          amount: '8743269015224678811'
        },
        {
          address: '0x00C51Fad10462780e488B54D413aD92B28b88204',
          amount: '6674012549813207563'
        },
        {
          address: '0xD740fd724D616795120BC363316580dAFf41129A',
          amount: '9152804736221590487'
        },
      ],
    }]

    await Utils.handleEventsFromTxHashes(
      ['0x11faef71292d3fe642e87f00a4ef0776c0fe8f71e07029ef595535704cab04cd'],
      network,
    )

    for(const address of addressesses) {
      await CapitalDistributorAdminController.uploadMembersList({
        campaignId: address.campaignId,
        pluginAddress,
        network,
        rewards: address.addresses,
      })

      await CapitalDistributorAdminController.generateMerkleData({
        campaignId: address.campaignId,
        pluginAddress,
        network,
      })
    }

    const plugin = await Models.Plugin.findOne({
      interfaceType: IPluginInterfaceType.capitalDistributor,
    })

    await LogCapitalDistributor.start(plugin)

    for(const address of addressesses) {
      const totalRewards = address.addresses.reduce((acc, curr) => acc + BigInt(curr.amount), BigInt(0))
      const campaignDetail = await Models.Campaign.findOne({
        pluginAddress: plugin.address,
        network: plugin.network,
        campaignId: address.campaignId,
      })
      expect(campaignDetail).to.exist
      expect(campaignDetail.totalRewards).to.be.eq(totalRewards.toString())
    }

    const rewardReceivedUsers = await Models.CampaignReward.find({
      claims: { $exists: true, $ne: [] }
    })

    const campaignStatus = await CapitalDistributorController.getUserCampaignStatus(
      pluginAddress,
      network,
      rewardReceivedUsers[0].userAddress,
    )

    const campaignRewardForAddr0 = addressesses.reduce((acc, curr) => acc + BigInt(curr.addresses[0].amount), BigInt(0))

    expect(campaignStatus.totalClaimed).to.be.eq(campaignRewardForAddr0.toString())
    expect(campaignStatus.totalClaimable).to.be.eq('0')

    const userWhoNeverClaimed = addressesses[1].addresses[1].address
    const notClaimedRewardStat = await CapitalDistributorController.getUserCampaignStatus(
      pluginAddress,
      network,
      userWhoNeverClaimed,
    )

    expect(notClaimedRewardStat.totalClaimed).to.be.eq('0')

    //calculate the total rewards for the user who never claimed
    const totalRewardsForUser = addressesses.reduce((acc, curr) => {
      const userReward = curr.addresses.find(addr => addr.address === userWhoNeverClaimed)
      return userReward ? acc + BigInt(userReward.amount) : acc
    }, BigInt(0))
    expect(notClaimedRewardStat.totalClaimable).to.be.eq(totalRewardsForUser.toString())

    const daoDetails = await DaoController.getDaoByAddress(
      plugin.daoAddress,
      network,
    )

    const pluginFromResponse = daoDetails.plugins.find(
      (pl: any) => pl.interfaceType === IPluginInterfaceType.capitalDistributor
    ) as any

    expect(pluginFromResponse).to.exist

    expect(pluginFromResponse.isSupported).to.be.true

    expect(pluginFromResponse.blockedCountries).to.deep.eq([
      "RU",
      "US",
    ])
    expect(pluginFromResponse.enableOfacCheck).to.be.true
    expect(pluginFromResponse.termsConditionsUrl).to.be.eq('https://capital-distributor.com/terms')
    expect(pluginFromResponse.isBody).to.be.eq(false)
    expect(pluginFromResponse.isProcess).to.be.eq(false)
    expect(pluginFromResponse.isSubPlugin).to.be.eq(false)
  })
})
