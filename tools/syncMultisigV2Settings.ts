import { EnumConnection, type IService } from '@types'
import { Models } from '@dbModels'
import { LogTokenVoting } from '@services/aragon-plugins/logTokenVoting'
import { LogMultiSig } from '@services/aragon-plugins/logMultisig'
import { IPluginActionType } from '@types'

export const SyncDaoPluginEvents: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const plugins = await Models.Plugin.find({
      daoAddress: '',
      type: IPluginActionType.installed,
    })

    for (const plugin of plugins) {
      const setting = await Models.Setting.findActive({
        daoAddress: plugin.daoAddress,
        pluginAddress: plugin.address,
        network: plugin.network,
      })

      if (setting) {
        if (setting.tokenAddress) {
          const token = await Models.Token.findOne({
            address: setting.tokenAddress,
            network: plugin.network,
          })
          await LogTokenVoting.start(plugin, token)
        } else {
          await LogMultiSig.start(plugin)
        }
      }
    }
  },

  stop: async () => {},
}

export default SyncDaoPluginEvents
