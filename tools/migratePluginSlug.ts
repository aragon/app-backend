import { EnumConnection, IPluginStatus, type IService } from '@types'
import { Models } from '@dbModels'
import { PluginSlug } from '@helpers/pluginSlug'

export const ToolsMigratePluginSlug: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const BATCH_SIZE = 1000

    // Fetch all installed plugins
    const plugins = await Models.Plugin.find({ status: IPluginStatus.installed, isSupported: true })

    // Fetch already added plugins
    const alreadyAdded = await Models.PluginSlug.find({}, { pluginAddress: 1 }).lean()

    // Extract plugin addresses that are already added
    const addedPluginAddresses = new Set(alreadyAdded.map((item: any) => item.pluginAddress))

    // Filter out plugins that are already added
    const pluginsToProcess = plugins.filter((plugin: any) => !addedPluginAddresses.has(plugin.pluginAddress))

    // Process plugins in batches
    for (let i = 0; i < pluginsToProcess.length; i += BATCH_SIZE) {
      const batch = pluginsToProcess.slice(i, i + BATCH_SIZE)

      // Process each batch concurrently
      await Promise.all(batch.map(async (plugin: any) => PluginSlug.generateSlug(plugin, plugin?.processKey)))
    }
  },

  stop: async () => {},
}

export default ToolsMigratePluginSlug
