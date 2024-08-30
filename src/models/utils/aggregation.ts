import {
  type HexAddress,
  type IAggDaoMemberMappingParams,
  type IAggDaoParams,
  type IAggDaoProjectFields,
  type IAggMemberBalanceParams,
  type IAggMemberBalanceProjectFields,
  type IAggMemberMetricsParams,
  type IAggMemberMetricsProjectFields,
  type IAggMemberParams,
  type IAggMemberProjectFields,
  type IAggPluginInclude,
  type IAggPluginParams,
  type IAggPluginProjectFields,
  type IAggSettingParams,
  type IAggSettingProjectFields,
  type IAggTokenParams,
  type IAggTokenProjectFields,
  ISettingStatus,
  type NetworksEnum,
} from '@types'

export const AggregationQueryHelper = {
  dao: ({ address, network }: IAggDaoParams, as: string = 'dao', project?: IAggDaoProjectFields) => {
    const letVariables: any = {}
    const matchConditions: any[] = []

    if (address) {
      letVariables.address = address
      matchConditions.push({ $eq: ['$address', '$$address'] })
    }

    if (network) {
      letVariables.network = network
      matchConditions.push({ $eq: ['$network', '$$network'] })
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
        from: 'Dao',
        let: letVariables,
        pipeline,
        as,
      },
    }
  },

  daoMemberMapping: (
    { tokenAddress, memberAddress, daoAddress, pluginAddress, network }: IAggDaoMemberMappingParams,
    as: string = 'memberMapping',
  ) => {
    const letVariables: any = {}
    const matchConditions: any[] = []

    if (pluginAddress) {
      letVariables.pluginAddress = pluginAddress
      matchConditions.push({ $eq: ['$pluginAddress', '$$pluginAddress'] })
    }

    if (tokenAddress) {
      letVariables.tokenAddress = tokenAddress
      matchConditions.push({ $eq: ['$tokenAddress', '$$tokenAddress'] })
    }

    if (daoAddress) {
      letVariables.daoAddress = daoAddress
      matchConditions.push({ $eq: ['$daoAddress', '$$daoAddress'] })
    }

    if (memberAddress) {
      letVariables.memberAddress = memberAddress
      matchConditions.push({ $eq: ['$memberAddress', '$$memberAddress'] })
    }

    if (network) {
      letVariables.network = network
      matchConditions.push({ $eq: ['$network', '$$network'] })
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

    pipeline.push({
      $project: {
        daoAddress: 1,
        memberAddress: 1,
        pluginAddress: 1,
        tokenAddress: 1,
        network: 1,
      },
    })

    return {
      $lookup: {
        from: 'DaoMemberMapping',
        let: letVariables,
        pipeline,
        as,
      },
    }
  },

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
    includeSubDocuments?: IAggPluginInclude,
  ) => {
    const letVariables: any = {}
    const matchConditions: any[] = []

    if (pluginAddress) {
      letVariables.pluginAddress = pluginAddress
      matchConditions.push({ $eq: ['$address', '$$pluginAddress'] })
    }

    if (network) {
      letVariables.network = network
      matchConditions.push({ $eq: ['$network', '$$network'] })
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

    if (includeSubDocuments?.settings) {
      pipeline.push(
        AggregationQueryHelper.setting(
          { pluginAddress: '$address', network: '$$network', status: ISettingStatus.active },
          'settings',
          {
            _id: 0,
            onlyListed: 1,
            minApprovals: 1,
            votingMode: 1,
            supportThreshold: 1,
            minParticipation: 1,
            minDuration: 1,
            minProposerVotingPower: 1,
          },
        ),
        // Fetch token only if settings are included and plugin has tokenAddress
        AggregationQueryHelper.token({ address: '$tokenAddress', network: '$$network' }, 'token', {
          _id: 0,
          network: 1,
          address: 1,
          symbol: 1,
          name: 1,
          decimals: 1,
          logo: 1,
          type: 1,
          totalSupply: 1,
        }),
        {
          $addFields: {
            settings: {
              $cond: {
                if: { $gt: [{ $size: '$settings' }, 0] },
                then: {
                  $mergeObjects: [
                    { $arrayElemAt: ['$settings', 0] },
                    {
                      $cond: [{ $ne: ['$tokenAddress', null] }, { token: { $arrayElemAt: ['$token', 0] } }, null],
                    },
                  ],
                },
                else: null,
              },
            },
          },
        },
      )
    }

    if (project) {
      const projectStage: any = {
        ...project,
      }

      if (includeSubDocuments?.settings) {
        projectStage.settings = 1
      }

      pipeline.push({
        $project: projectStage,
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

  setting: (
    { pluginAddress, network, status }: IAggSettingParams,
    as: string = 'setting',
    project?: IAggSettingProjectFields,
  ) => {
    const letVariables: any = {}
    const matchConditions: any[] = []

    if (pluginAddress) {
      letVariables.pluginAddress = pluginAddress
      matchConditions.push({ $eq: ['$pluginAddress', '$$pluginAddress'] })
    }

    if (network) {
      letVariables.network = network
      matchConditions.push({ $eq: ['$network', '$$network'] })
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

    pipeline.push(
      {
        $sort: {
          blockNumber: -1,
        },
      },
      {
        $limit: 1,
      },
    )

    if (project) {
      pipeline.push({
        $project: project,
      })
    }

    return {
      $lookup: {
        from: 'Setting',
        let: letVariables,
        pipeline,
        as,
      },
    }
  },

  token: ({ address, network }: IAggTokenParams, as: string = 'token', project?: IAggTokenProjectFields) => {
    const letVariables: any = {}
    const matchConditions: any[] = []

    if (address) {
      letVariables.address = address
      matchConditions.push({ $eq: ['$address', '$$address'] })
    }

    if (network) {
      letVariables.network = network
      matchConditions.push({ $eq: ['$network', '$$network'] })
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
        from: 'Token',
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

  memberMetrics: (
    { pluginAddress, network, memberAddress }: IAggMemberMetricsParams,
    as: string = 'memberMetrics',
    project?: IAggMemberMetricsProjectFields,
  ) => {
    const letVariables: any = {}
    const matchConditions: any[] = []

    if (pluginAddress) {
      letVariables.pluginAddress = pluginAddress
      matchConditions.push({ $eq: ['$$pluginAddress', '$pluginAddress'] })
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
        from: 'MemberMetrics',
        let: letVariables,
        pipeline,
        as,
      },
    }
  },

  memberOrDaoInfo: ({ address, network }: { address: HexAddress; network?: NetworksEnum }) => {
    return [
      AggregationQueryHelper.member({ memberAddress: address }, 'memberInfo', { address: 1, ens: 1, avatar: 1 }),
      {
        $addFields: {
          creatorAddress: {
            $cond: {
              if: { $gt: [{ $size: '$memberInfo' }, 0] },
              then: {
                address: { $arrayElemAt: ['$memberInfo.address', 0] },
                ens: { $arrayElemAt: ['$memberInfo.ens', 0] },
                avatar: { $arrayElemAt: ['$memberInfo.avatar', 0] },
              },
              else: '$$REMOVE', // Remove field if member is not found
            },
          },
        },
      },
      {
        $lookup: {
          from: 'Dao',
          let: { daoAddress: address, network },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$address', '$$daoAddress'] }, { $eq: ['$network', '$$network'] }],
                },
              },
            },
            {
              $project: { address: 1, ens: 1, avatar: 1 },
            },
          ],
          as: 'daoInfo',
        },
      },
      {
        $addFields: {
          creatorAddress: {
            $cond: {
              if: {
                $and: [{ $lte: [{ $size: '$memberInfo' }, 0] }, { $gt: [{ $size: '$daoInfo' }, 0] }],
              },
              then: {
                address: { $arrayElemAt: ['$daoInfo.address', 0] },
                ens: { $arrayElemAt: ['$daoInfo.ens', 0] },
                avatar: { $arrayElemAt: ['$daoInfo.avatar', 0] },
              },
              else: {
                $cond: {
                  if: { $lte: [{ $size: '$memberInfo' }, 0] },
                  then: {
                    address,
                    ens: null,
                    avatar: null,
                  },
                  else: '$creatorAddress', // Retain existing creatorAddress if already set
                },
              },
            },
          },
        },
      },
      {
        $addFields: {
          memberInfo: '$$REMOVE',
          daoInfo: '$$REMOVE',
        },
      },
    ]
  },
}
