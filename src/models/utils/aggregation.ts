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
  pluginDetails: () => {
    return {
      $lookup: {
        from: 'Plugin',
        let: { daoAddress: '$address', daoNetwork: '$network' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ['$$daoAddress', '$daoAddress'],
                  },
                  {
                    $eq: ['$$daoNetwork', '$network'],
                  },
                ],
              },
            },
          },
          {
            $lookup: {
              from: 'Token',
              let: { tokenAddr: '$tokenAddress', network: '$network' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        {
                          $eq: ['$$tokenAddr', '$address'],
                        },
                        {
                          $eq: ['$$network', '$network'],
                        },
                      ],
                    },
                  },
                },
              ],
              as: 'token',
            },
          },
          {
            $addFields: {
              token: {
                $arrayElemAt: ['$token', 0],
              },
            },
          },
        ],
        as: 'plugin',
      },
    }
  },
  daoMemberList() {
    return {
      $lookup: {
        from: 'DaoMemberMapping',
        let: { daoAddr: '$address', network: '$network' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ['$$daoAddr', '$daoAddress'],
                  },
                  {
                    $eq: ['$$network', '$network'],
                  },
                ],
              },
            },
          },
          {
            $lookup: {
              from: 'Member',
              let: { memberAddr: '$memberAddress' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ['$$memberAddr', '$address'],
                    },
                  },
                },
              ],
              as: 'info',
            },
          },
          {
            $addFields: {
              info: {
                $arrayElemAt: ['$info', 0],
              },
            },
          },
        ],
        as: 'members',
      },
    }
  },
}
