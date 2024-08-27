import {
  type HexAddress,
  type IAggMemberBalanceParams,
  type IAggMemberBalanceProjectFields,
  type IAggMemberParams,
  type IAggMemberProjectFields,
  type IAggPluginParams,
  type IAggPluginProjectFields,
} from '@types'

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

  plugin: (
    { daoAddress, pluginAddress, network, status }: IAggPluginParams,
    as: string = 'plugin',
    project?: IAggPluginProjectFields,
  ) => {
    const letVariables: any = {}
    const matchConditions: any[] = []

    if (pluginAddress) {
      letVariables.pluginAddress = pluginAddress
      matchConditions.push({ $eq: ['$address', '$$pluginAddress'] })
    }

    if (network) {
      letVariables.eventNetwork = network
      matchConditions.push({ $eq: ['$network', '$$eventNetwork'] })
    }

    if (daoAddress) {
      letVariables.daoAddress = daoAddress
      matchConditions.push({ $eq: ['$daoAddress', '$$daoAddress'] })
    }

    if (status) {
      letVariables.status = status
      matchConditions.push({ $eq: ['$status', '$$status'] })
    }

    const pipeline: any[] = []

    if (matchConditions.length > 0) {
      pipeline.push({
        $match: {
          $expr: {
            $and: matchConditions,
          },
        },
      })
    }

    if (project) {
      pipeline.push({
        $project: project,
      })
    }

    return {
      $lookup: {
        from: 'Plugin',
        let: letVariables,
        pipeline,
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

  member: ({ memberAddress }: IAggMemberParams, as: string = 'member', project?: IAggMemberProjectFields) => {
    const letVariables: any = {}
    const matchConditions: any[] = []

    if (memberAddress) {
      letVariables.memberAddr = memberAddress
      matchConditions.push({ $eq: ['$$memberAddr', '$address'] })
    }

    const pipeline: any[] = []

    if (matchConditions.length > 0) {
      pipeline.push({
        $match: {
          $expr: {
            $and: matchConditions,
          },
        },
      })
    }

    if (project) {
      pipeline.push({
        $project: project,
      })
    }

    return {
      $lookup: {
        from: 'Member',
        let: letVariables,
        pipeline,
        as,
      },
    }
  },

  memberBalance: (
    { tokenAddress, network, memberAddress }: IAggMemberBalanceParams,
    as: string = 'memberBalance',
    project?: IAggMemberBalanceProjectFields,
  ) => {
    const letVariables: any = {}
    const matchConditions: any[] = []

    if (tokenAddress) {
      letVariables.tokenAddress = tokenAddress
      matchConditions.push({ $eq: ['$$tokenAddress', '$tokenAddress'] })
    }

    if (network) {
      letVariables.network = network
      matchConditions.push({ $eq: ['$$network', '$network'] })
    }

    if (memberAddress) {
      letVariables.memberAddress = memberAddress
      matchConditions.push({ $eq: ['$$memberAddress', '$address'] })
    }

    const pipeline: any[] = []

    if (matchConditions.length > 0) {
      pipeline.push({
        $match: {
          $expr: {
            $and: matchConditions,
          },
        },
      })
    }

    if (project) {
      pipeline.push({
        $project: project,
      })
    }

    return {
      $lookup: {
        from: 'MemberBalance',
        let: letVariables,
        pipeline,
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
