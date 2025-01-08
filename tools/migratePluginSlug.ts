import { EnumConnection, IPluginStatus, type IService } from '@types'
import { Models } from '@dbModels'
import { PluginSlug } from '@helpers/pluginSlug'

export const ToolsMigratePluginSlug: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const plugins = await Models.Plugin.find({ status: IPluginStatus.installed })

    for (const plugin of plugins) {
      await PluginSlug.generateSlug(plugin, plugin?.processKey)
    }
  },

  stop: async () => {},
}

export default ToolsMigratePluginSlug
