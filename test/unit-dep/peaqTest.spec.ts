import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { Models } from '@dbModels'
import { EnumQueueName, IPluginInterfaceType, type IQueuePlugin, ITokenType, NetworksEnum } from '@types'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import Web3 from '@helpers/web3'
import { expect } from 'chai'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { LogAdmin } from '@plugins/logAdmin'
import { LogMultiSig } from '@plugins/logMultisig'
import logger from '@logger'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import { LogSpp } from '@plugins/logSPP'
describe.skip('peaqTest', () => {
  before(async () => {
    await UnitDepUtils.registerRepoForPeaq()
  })

  let sandbox: SinonSandbox
  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })
  afterEach(() => {
    sandbox.restore()
  })

  it('should install complex peaq dao', async function () {
    this.timeout(10000000)

    const tx1 = '0xf6a2e2d9770bc58d0f5d280f8d837fd34939258c6b266791c5586919181b710c'
    const tx2 = '0x1e5abbb2291bac95b70bdb628cd8af7d2da81fba2ebfae88a88c036981792a6a'
    const tx3 = '0x4f33699bebcc098b006adfbb966d27f5b43fb3d506fb2f8f8b5f2658a02e5349'

    const [tx1Receipts, tx2Receipts, tx3Receipts] = await Promise.all([
      Web3.getTransactionReceipt(tx1, NetworksEnum.peaqMainnet),
      Web3.getTransactionReceipt(tx2, NetworksEnum.peaqMainnet),
      Web3.getTransactionReceipt(tx3, NetworksEnum.peaqMainnet),
    ])

    const [tx1Parsed, tx2Parsed, tx3Parsed] = await Promise.all([
      UnitDepUtils.parseLogsByConfig(tx1Receipts?.logs as any, NetworksEnum.peaqMainnet),
      UnitDepUtils.parseLogsByConfig(tx2Receipts?.logs as any, NetworksEnum.peaqMainnet),
      UnitDepUtils.parseLogsByConfig(tx3Receipts?.logs as any, NetworksEnum.peaqMainnet),
    ])

    sandbox.stub(RabbitMQHelper, 'sendMessage').callsFake(async (queue: string, job: any) => {
      if (queue === EnumQueueName.plugins) {
        const { address, network, isHistorical } = job.params as IQueuePlugin

        const plugin = await Models.Plugin.findByAddress(address, network)
        if (!plugin?.interfaceType) {
          console.log('PluginSyncService: plugin not found', { address, network })
          return
        }

        switch (plugin.interfaceType) {
          case IPluginInterfaceType.admin: {
            await LogAdmin.start(plugin)
            break
          }
          case IPluginInterfaceType.multisig: {
            await LogMultiSig.start(plugin)
            break
          }
          case IPluginInterfaceType.tokenVoting: {
            const token = await Models.Token.findOne({
              address: plugin.tokenAddress,
              network: plugin.network,
            })

            if (token?.type === ITokenType.ERC20 && token.isGovernance) {
              logger.info('Sync plugin: token is ERC721')

              await LogTokenVoting.start(plugin, token, isHistorical)
            } else {
              logger.warn('Sync plugin: token not governance erc20')
            }
            break
          }
          case IPluginInterfaceType.spp: {
            await LogSpp.start(plugin)
            break
          }
          default:
            break
        }
      }
    })

    for (const parsed of tx1Parsed) {
      const handler = parsed.handler
      const event = parsed.event
      const info = parsed.info

      await handler(event, info)
    }

    const daos = await Models.Dao.find({})
    expect(daos.length).to.be.greaterThan(0)

    for (const parsed of tx2Parsed) {
      const handler = parsed.handler
      const event = parsed.event
      const info = parsed.info

      await handler(event, info)
    }

    for (const parsed of tx3Parsed) {
      const handler = parsed.handler
      const event = parsed.event
      const info = parsed.info

      await handler(event, info)
    }

    console.log('DAOs:', daos)
  })
})
