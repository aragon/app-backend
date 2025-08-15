import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import Utils from '@test/lib/unit-dep/utils'
import Addresses from './addresses.json'
import { CapitalDistributorAdminController } from '@admin-api/controllers/capitalDistributor'
import { IClaimStat, NetworksEnum } from '@types'
import CapitalDistributorController from '@api/controllers/capitalDistributor'
import { expect } from 'chai'
import { Models } from '@dbModels'

describe('Capital Distributor', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it.only('should handle capital distribution event and plugin sync correctly', async function () {
    this.timeout(100000000)
    const network = NetworksEnum.ethereumSepolia
    const pluginAddress = '0x884fb2Cd1A0710d5AcC219C6163FCa75aa63c867'
    const campaignId = '2'

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

    await Utils.handleEventsFromTxHashes(
      [
        '0x4597fa36a8d24ab25ca6b0dca311b3d4767c77c2b39082bf50caa7cbf9c397d4',
        '0x95ef153e8fdeb70a4315ff0311251e624181dcf36f17ff07589fd0d6298f7814',
      ],
      network,
    )

    const userReward = await Models.CampaignReward.findOne({
      pluginAddress,
      network,
      campaignId,
      userAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
    })

    //as the camping and the data we have is different to match i am foring the data updates.
    await userReward.update({
      amount: '100',
    })

    const members = await CapitalDistributorController.getCampaignsWithPagination(
      {
        page: 1,
      },
      {
        network,
        pluginAddress,
        userAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
      },
    )

    const campignData = members.data[0]

    expect(campignData.campaignId).to.equal(campaignId)
    expect(campignData.multipleClaimsAllowed).to.be.false
    expect(campignData.userData).to.be.exist
    expect(campignData.userData.status).to.be.eq(IClaimStat.CLAIMED)
    expect(campignData.strategy.root).to.be.exist
    expect(campignData.userData.proofs).to.be.an('array').that.is.not.empty
    expect(campignData.userData.claims).to.be.an('array').that.is.not.empty //user has a claim

    const nonClaimedMembers = await CapitalDistributorController.getCampaignsWithPagination(
      {
        page: 1,
      },
      {
        network,
        pluginAddress,
        userAddress: Addresses[5].address,
      },
    )

    const nonClaimedCampaignData = nonClaimedMembers.data[0]
    expect(nonClaimedCampaignData.campaignId).to.equal(campaignId)
    expect(nonClaimedCampaignData.multipleClaimsAllowed).to.be.false
    expect(nonClaimedCampaignData.userData).to.be.exist
    expect(nonClaimedCampaignData.userData.status).to.be.eq(IClaimStat.CLAIMABLE)
    expect(nonClaimedCampaignData.strategy.root).to.be.exist
    expect(nonClaimedCampaignData.userData.proofs).to.be.an('array').that.is.not.empty
    expect(nonClaimedCampaignData.userData.claims).to.be.an('array').that.is.empty //user has no claim
    expect(nonClaimedCampaignData.userData.totalAmount).to.be.eq(Addresses[5].amount)
  })
})
