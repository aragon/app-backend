import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { CapitalDistributorAdminController } from '@admin-api/controllers/capitalDistributor'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import * as fs from 'node:fs'
import logger from '@logger'
import RabbitMQ from '@modules/rabbitMQ'
import utils from '@helpers/utils'
import { PluginList } from '@test/mock/fakePlugins'

describe.skip('Capital Distributor', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    RabbitMQ.connect()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle bulk merkle list for the capital distributor stuff', async function () {
    this.timeout(100000000000)
    const listFile = '/Users/sishirpokhrel/Projects/aragon/tools/airdrop_addresses_final.json'

    await Models.Plugin.create({
      ...PluginList[0],
      address: '0x1F4Bd8b6fcb19F64D172310Da583753d4c0aF4a9',
      interfaceType: IPluginInterfaceType.capitalDistributor,
      network: NetworksEnum.ethereumSepolia,
      daoAddress: '0x7f268357A8c2552623316ecBE2D7f32A9f0624C',
      tokenAddress: null,
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
      ...campaignParm,
    })
    const timeElapsed = Date.now() - time
    logger.info('Time taken to generate merkle tree', {
      timeInMs: timeElapsed,
    })

    const timer = setInterval(async () => {
      const status = await CapitalDistributorAdminController.getMerkleGenerationStatus({
        ...campaignParm,
      })
      logger.info('Merkle generation status', {
        status,
      })

      if (status) {
        clearTimeout(timer)
      }
    }, 1000)

    await utils.wait(100000)
  })
})
