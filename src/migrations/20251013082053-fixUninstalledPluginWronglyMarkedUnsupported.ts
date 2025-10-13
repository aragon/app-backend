import { type IMigration } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'

const llo = logger.logMeta.bind(null, { service: 'Migration: fixUninstalledPluginWronglyMarkedUnsupported' })

export const fixUninstalledPluginWronglyMarkedUnsupportedMigration: IMigration = {
  start: async () => {
    logger.info(
      'Starting Plugin migration',
      llo({ migration: '20251013082053-fixUninstalledPluginWronglyMarkedUnsupported' }),
    )
    const aggregationPipeline = [
      {
        $match: {
          status: 'installed',
          isSupported: false,
          interfaceType: { $ne: 'unknown' },
        },
      },
      {
        $lookup: {
          from: 'Setting',
          let: { daoAddr: '$daoAddress', pluginAddr: '$address' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: ['$daoAddress', '$$daoAddr'],
                    },
                    {
                      $eq: ['$pluginAddress', '$$pluginAddr'],
                    },
                  ],
                },
              },
            },
          ],
          as: 'settings',
        },
      },
      {
        $lookup: {
          from: 'PluginRepo',
          let: { repo: '$pluginSetupRepoAddress', network: '$network' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: ['$$repo', '$pluginRepo'],
                    },
                    {
                      $eq: ['$network', '$$network'],
                    },
                  ],
                },
              },
            },
          ],
          as: 'pluginRepo',
        },
      },
      {
        $addFields: {
          settingCount: {
            $size: '$settings',
          },
        },
      },
      {
        $match: {
          settingCount: { $gte: 1 },
        },
      },
      {
        $addFields: {
          pluginRepo: {
            $arrayElemAt: ['$pluginRepo', 0],
          },
        },
      },
      {
        $project: {
          settingCount: '$settingCount',
          pluginAddress: '$address',
          daoAddress: '$daoAddress',
          network: '$network',
          blockNumber: '$blockNumber',
          interfaceType: '$interfaceType',
          pluginRepoSubdomain: '$pluginRepo.subdomain',
          status: '$status',
        },
      },
    ]

    try {
      const plugins = await Models.Plugin.aggregate(aggregationPipeline)
      for (const plugin of plugins) {
        await Models.Plugin.updateOne(
          {
            address: plugin.pluginAddress,
            daoAddress: plugin.daoAddress,
            network: plugin.network,
          },
          {
            isSupported: true,
          }
        )
        logger.info(
          'Updated plugin',
          llo({ plugin: plugin.pluginAddress, dao: plugin.daoAddress, network: plugin.network }),
        )
      }
      logger.info(
        'Migration completed successfully',
        llo({ migration: '20251013082053-fixUninstalledPluginWronglyMarkedUnsupported' }),
      )
    } catch (error) {
      logger.error(
        'Migration failed',
        llo({ migration: '20251013082053-fixUninstalledPluginWronglyMarkedUnsupported', error }),
      )
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default fixUninstalledPluginWronglyMarkedUnsupportedMigration
