import { type HexAddress } from '@types'

export const AggregationQueryHelper = {
  pluginRepo: (pluginSetupRepoAddress: string, network: string, as: string = 'pluginRepo') => {
    return {
      $lookup: {
        from: 'PluginRepo',
        let: {
          repoAddr: pluginSetupRepoAddress,
          network,
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$pluginRepo', '$$repoAddr'] }, { $eq: ['$network', '$$network'] }],
              },
            },
          },
        ],
        as,
      },
    }
  },

  plugin: (pluginAddress: string, network: string, as: string = 'plugin') => {
    return {
      $lookup: {
        from: 'Plugin',
        let: { pluginAddress, eventNetwork: network },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$address', '$$pluginAddress'] }, { $eq: ['$network', '$$eventNetwork'] }],
              },
            },
          },
        ],
        as,
      },
    }
  },

  logPluginSetupProcessor: (pluginAddress: HexAddress, network: string, as: string = 'plugin') => {
    return {
      $lookup: {
        from: 'LogPluginSetupProcessor',
        let: { pluginAddress, network },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$pluginAddress', '$$pluginAddress'] },
                  { $eq: ['$network', '$$network'] },
                  { $eq: ['$event', 'InstallationPrepared'] },
                ],
              },
            },
          },
        ],
        as,
      },
    }
  },
}
