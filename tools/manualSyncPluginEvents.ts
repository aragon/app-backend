import { EnumConnection, type IService } from '@types'
import { Models } from '@dbModels'
import { LogTokenVoting } from '@indexer/logTokenVoting'
import { LogMultiSig } from '@indexer/logMultisig'
import { IPluginActionType } from '@indexer/handlers/pluginSetupProcessorHandler'

export const ToolsManualSyncDaoPluginEvents: IService = {
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
          await LogTokenVoting.start(plugin)
        } else {
          await LogMultiSig.start(plugin)
        }
      }
    }
  },

  stop: async () => {},
}

export default ToolsManualSyncDaoPluginEvents
