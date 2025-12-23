import { Models } from '@dbModels'
import { PluginSlug } from '@helpers/pluginSlug'
import logger from '@logger'
import { EnumConnection, IPluginStatus, type IService } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Tools: MissingSlugs' })

export const MissingSlugs: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const plugins = await Models.Plugin.aggregate([
      {
        $match: {
          isSupported: true,
          status: IPluginStatus.installed,
        },
      },
      {
        $lookup: {
          from: 'PluginSlug',
          localField: 'address',
          foreignField: 'pluginAddress',
          as: 'slug',
        },
      },
      {
        $match: {
          slug: { $eq: [] }, // only return plugins with no matching PluginSlug
        },
      },
      {
        $project: {
          _id: 0,
          address: 1,
          daoAddress: 1,
          network: 1,
          interfaceType: 1,
          processKey: 1,
        },
      },
    ])

    await Promise.all(
      plugins.map(async (plugin: any) => {
        const slug = await Models.PluginSlug.findPluginSlug(plugin.address, plugin.daoAddress, plugin.network)
        if (!slug) {
          await PluginSlug.generateSlug(plugin, plugin?.processKey)
        }
      }),
    )
    logger.info('MissingSlugs End', llo({ length: plugins.length }))
  },

  stop: async () => {},
}

export default MissingSlugs
