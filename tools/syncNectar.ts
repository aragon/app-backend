import { Models } from '@dbModels'
import TokenDetector from '@helpers/tokenDetector'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import { EnumConnection, type IService, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'service:SyncNectorDao' })

export const SyncNectorDao: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async () => {
    await ProviderModule.connectToAllNetworks()

    const tokenAddress = '0x01403157c847B2c0291c05DF5055876eB4e039bc'

    const token = await Models.Token.findOne({ address: tokenAddress })

    if (!token) {
      logger.error('Token not found', llo({ tokenAddress }))
      return
    }

    const interfaceType = await TokenDetector.detectTokenType(tokenAddress, NetworksEnum.ethereumSepolia)

    token.isGovernance = interfaceType.isGovernance
    token.hasDelegate = interfaceType.hasDelegate
    token.underlying = interfaceType.hasUnderlying
      ? await Web3Helper.getUnderlying(tokenAddress, NetworksEnum.ethereumSepolia)
      : null

    await token.save()

    if (!interfaceType.isGovernance) return

    const plugins = await Models.Plugin.find({ network: NetworksEnum.ethereumSepolia, tokenAddress })
    await Promise.all(
      plugins.map(async (plugin: any) => {
        plugin.isSupported = true
        await plugin.save()

        logger.verbose('Updated plugin', llo({ pluginId: plugin.id, tokenAddress }))

        await LogTokenVoting.start(await plugin.reload(), await token.reload(), true)
      }),
    )
  },

  stop: async () => {},
}

export default SyncNectorDao
