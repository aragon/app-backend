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
import * as fs from 'node:fs'
import logger from '@logger'
import RabbitMQ from '@modules/rabbitMQ'
import utils from '@helpers/utils'
import { PluginList } from '@test/mock/fakePlugins'

describe('Capital Distributor', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    RabbitMQ.connect()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle capital distribution event and plugin sync correctly', async function () {
    this.timeout(100000000)
    const network = NetworksEnum.ethereumSepolia
    const pluginAddress = '0x1F4Bd8b6fcb19F64D172310Da583753d4c0aF4a9'

    const addressesses = [
      {
        campaignId: '0',
        addresses: [
          {
            address: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
            amount: '2068407131086655006',
          },
          {
            address: '0xF6ad40D5D477ade0C640eaD49944bdD0AA1fBF05',
            amount: '3066005202605466524',
          },
          {
            address: '0x764a31E070c6Ea2E81CbC1f680BF9a07f762ED2c',
            amount: '3327258466775317797',
          },
          {
            address: '0x00C51Fad10462780e488B54D413aD92B28b88204',
            amount: '4301960492862894413',
          },
          {
            address: '0xD740fd724D616795120BC363316580dAFf41129A',
            amount: '4429543088946624610',
          },
        ],
      },
      {
        campaignId: '1',
        addresses: [
          {
            address: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
            amount: '5931865400721184342',
          },
          {
            address: '0xF6ad40D5D477ade0C640eaD49944bdD0AA1fBF05',
            amount: '7315096276842113998',
          },
          {
            address: '0x764a31E070c6Ea2E81CbC1f680BF9a07f762ED2c',
            amount: '8743269015224678811',
          },
          {
            address: '0x00C51Fad10462780e488B54D413aD92B28b88204',
            amount: '6674012549813207563',
          },
          {
            address: '0xD740fd724D616795120BC363316580dAFf41129A',
            amount: '9152804736221590487',
          },
        ],
      },
    ]

    await Utils.handleEventsFromTxHashes(
      ['0xbe8b845b443bfc8242eae8c5d90e6cbc47bf68e046609f91069c343ec790da1e'],
      network,
    )

    for (const address of addressesses) {
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

    for (const address of addressesses) {
      const totalRewards = address.addresses.reduce((acc, curr) => acc + BigInt(curr.amount), BigInt(0))
      const campaignDetail = await Models.Campaign.findOne({
        pluginAddress: plugin.address,
        network: plugin.network,
        campaignId: address.campaignId,
      })
      expect(campaignDetail).to.exist
      expect(campaignDetail.totalRewards).to.be.eq(totalRewards.toString())
    }

    await Utils.handleEventsFromTxHashes(
      ['0xd3fd0e6580943af162a12bfadfc7bfd071828263ff4a00b3396cf180b5b31f42'],
      network,
    )

    const rewardReceivedUsers = await Models.CampaignReward.find({
      claims: { $exists: true, $ne: [] },
    })

    const expectedUserAddress = rewardReceivedUsers[0].userAddress
    const campaignStatus = await CapitalDistributorController.getUserCampaignStatus(
      pluginAddress,
      network,
      expectedUserAddress,
    )

    const totalClaimedFromDb = rewardReceivedUsers
      .filter(r => r.userAddress === expectedUserAddress)
      .reduce((acc, curr) => acc + BigInt(curr.totalClaimed), BigInt(0))

    expect(campaignStatus.totalClaimed).to.be.eq(totalClaimedFromDb.toString())

    const totalAmountForUser = rewardReceivedUsers
      .filter(r => r.userAddress === expectedUserAddress)
      .reduce((acc, curr) => acc + BigInt(curr.amount), BigInt(0))

    const expectedClaimable = totalAmountForUser - totalClaimedFromDb
    expect(campaignStatus.totalClaimable).to.be.eq(expectedClaimable.toString())

    const daoDetails = await DaoController.getDaoByAddress(plugin.daoAddress, network)

    const pluginFromResponse = daoDetails.plugins.find(
      (pl: any) => pl.interfaceType === IPluginInterfaceType.capitalDistributor,
    ) as any

    expect(pluginFromResponse).to.exist

    expect(pluginFromResponse.isSupported).to.be.true

    expect(pluginFromResponse.blockedCountries).to.deep.eq(['RU', 'US'])
    expect(pluginFromResponse.enableOfacCheck).to.be.true
    expect(pluginFromResponse.termsConditionsUrl).to.be.eq('https://capital-distributor.com/terms')
    expect(pluginFromResponse.isBody).to.be.eq(false)
    expect(pluginFromResponse.isProcess).to.be.eq(false)
    expect(pluginFromResponse.isSubPlugin).to.be.eq(false)
  })


  it.only('should handle bulk merkle list for the capital distributor stuff', async function ()  {
    this.timeout(100000000000)
    const listFile = '/Users/sishirpokhrel/Projects/aragon/tools/airdrop_addresses_final.json'

    await Models.Plugin.create({
      ...PluginList[0],
      address: '0x1F4Bd8b6fcb19F64D172310Da583753d4c0aF4a9',
      interfaceType: IPluginInterfaceType.capitalDistributor,
      network: NetworksEnum.ethereumSepolia,
      daoAddress: '0x7f268357A8c2552623316ecBE2D7f32A9f0624C',
      tokenAddress: null
    })

    const campaignParm = {
      pluginAddress: '0x1F4Bd8b6fcb19F64D172310Da583753d4c0aF4a9',
      network: NetworksEnum.ethereumSepolia,
      campaignId: '2',
    }

    const rewards = fs.readFileSync(listFile, 'utf8')
    const rewardsJson = JSON.parse(rewards).slice(0, 10000)

    logger.info('Rewards', {
      count: rewardsJson.length,
    })

    const timestamp = Date.now()
    await CapitalDistributorAdminController.uploadMembersList({
      ...campaignParm,
      rewards: rewardsJson,
    })

    const elapsed = Date.now() - timestamp

    logger.info('Time taken to process bulk list', {
      timeInMs: elapsed,
    })

    const time = Date.now()
    await CapitalDistributorAdminController.generateMerkleData({
     ...campaignParm
    })
    const timeElapsed = Date.now() - time
    logger.info('Time taken to generate merkle tree', {
      timeInMs: timeElapsed,
    })


    setInterval(async () => {
      const status = await CapitalDistributorAdminController.getMerkleGenerationStatus({
        ...campaignParm
      })
      logger.info('Merkle generation status', {
        status,
      })

      const campaignDetail = await CapitalDistributorAdminController.getCampaignDetails({
        ...campaignParm
      })

      logger.info('Campaign detail', {
        campaignDetail,
      } as any)

    }, 1000)

    await utils.wait(100000)

  })

})
