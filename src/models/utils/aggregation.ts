import {HexAddress, NetworksEnum} from "@types";

export const AggregationQueryHelper = {

  logPluginRepo: (pluginRepoAddress: string, network: string, as: string = 'pluginRepo') => {

    return {
      $lookup: {
        from: 'logPluginRepo',
        let: {
          repoAddr: pluginRepoAddress,
          network: network,
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$pluginRepo', '$$repoAddr'] }, { $eq: ['$network', '$$network'] }],
              },
            },
          }
        ],
        as,
      },
    }
  },

  plugin: (pluginAddress: string, network: string, as: string = 'plugin') => {

    return {
      $lookup: {
        from: 'plugin',
        let: { pluginAddress: pluginAddress, eventNetwork: network },
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
        from: 'logPluginSetupProcessor',
        let: { pluginAddress: pluginAddress, network: network },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$pluginAddress', '$$pluginAddress'] },
                  { $eq: ['$network', '$$network'] },
                  { $eq: ['$event', 'InstallationPrepared'] }
                ]
              }
            }
          },
        ],
        as
      },
    }
  }

}
