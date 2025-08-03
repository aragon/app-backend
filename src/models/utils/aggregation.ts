import {
  type HexAddress,
  type IAggDaoParams,
  type IAggDaoProjectFields,
  type IAggMemberParams,
  type IAggMemberProjectFields,
  type IAggMemberTransactionParams,
  type IAggMemberTransactionProjectFields,
  type IAggPluginInclude,
  type IAggPluginMetricsParams,
  type IAggPluginMetricsProjectFields,
  type IAggPluginParams,
  type IAggPluginProjectFields,
  type IAggPluginSlugParams,
  type IAggProposalParams,
  type IAggSettingParams,
  type IAggSettingProjectFields,
  type IAggTokenParams,
  type IAggTokenProjectFields,
  type IAggVpMemberParams,
  type IAggVpMemberProjectFields,
  ICollectionNames,
  ISettingStatus,
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
        from: ICollectionNames.Dao,
        let: letVariables,
        pipeline,
        as,
      },
    }
  },

  proposals: ({ proposalIndex, pluginAddress, network, as = 'proposals' }: IAggProposalParams) => {
    const letVariables: any = {}
    const matchConditions: any[] = []

    if (proposalIndex) {
      letVariables.proposalIndex = proposalIndex
      matchConditions.push({ $in: ['$proposalIndex', '$$proposalIndex'] })
    }

    if (pluginAddress) {
      letVariables.pluginAddress = pluginAddress
      matchConditions.push({ $in: ['$pluginAddress', '$$pluginAddress'] })
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

    pipeline.push(
      AggregationQueryHelper.token({ address: '$settings.tokenAddress', network: '$$network' }, 'token', {
        _id: 0,
        network: 1,
        address: 1,
        symbol: 1,
        name: 1,
        decimals: 1,
        logo: 1,
        isGovernance: 1,
        ignoreTransfer: 1,
        hasDelegate: 1,
        underlying: 1,
        type: 1,
        totalSupply: 1,
        mintableByDao: 1,
      }),
      {
        $addFields: {
          settings: {
            $mergeObjects: [
              '$settings',
              { token: { $arrayElemAt: ['$token', 0] } },
              { historicalMembersCount: '$snapshot.membersCount' },
              { historicalTotalSupply: '$snapshot.totalSupply' },
            ],
          },
        },
      },
      {
        $addFields: {
          token: '$$REMOVE',
        },
      },
    )

    pipeline.push({
      $project: {
        _id: 0,
        id: 1,
        network: 1,
        transactionHash: 1,
        blockNumber: 1,
        blockTimestamp: 1,
        proposalIndex: 1,
        incrementalId: 1,
        stageIndex: 1,
        lastStageTransition: 1,
        creator: 1,
        parentProposal: 1,
        pluginAddress: 1,
        pluginSubdomain: 1,
        daoAddress: 1,
        startDate: 1,
        endDate: 1,
        metadataUri: 1,
        title: 1,
        description: 1,
        summary: 1,
        resources: 1,
        executed: 1,
        hasActions: AggregationQueryHelper.computeHasActions(),
        decoding: 1,
        media: 1,
        metrics: 1,
        settings: 1,
      },
    })

    return {
      $lookup: {
        from: ICollectionNames.Proposal,
        let: letVariables,
        pipeline,
        as,
      },
    }
  },

  pluginRepo: (pluginSetupRepoAddress: string, network: string, as: string = 'pluginRepo') => {
    return {
      $lookup: {
        from: ICollectionNames.PluginRepo,
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
    { addresses, daoAddress, pluginAddress, network, status }: IAggPluginParams,
    as: string = 'plugin',
    project?: IAggPluginProjectFields,
    includeSubDocuments?: IAggPluginInclude,
  ) => {
    const letVariables: any = {}
    const matchConditions: any[] = []

    if (addresses && addresses.length > 0) {
      letVariables.addresses = addresses
      matchConditions.push({ $in: ['$address', '$$addresses'] })
    }

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

    pipeline.push(
      AggregationQueryHelper.pluginSlug(
        {
          pluginAddress: '$address',
          network: '$network',
        },
        'pluginSlug',
      ),
      {
        $addFields: {
          slug: {
            $cond: {
              if: { $gt: [{ $size: '$pluginSlug' }, 0] },
              then: { $arrayElemAt: ['$pluginSlug.slug', 0] },
              else: null,
            },
          },
        },
      },
      {
        $unset: 'pluginSlug',
      },
    )

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
            stages: 1,
            votingEscrow: 1,
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
          isGovernance: 1,
          ignoreTransfer: 1,
          hasDelegate: 1,
          underlying: 1,
          type: 1,
          totalSupply: 1,
          mintableByDao: 1,
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
        slug: 1,
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
        from: ICollectionNames.Plugin,
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
        from: ICollectionNames.Setting,
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
        from: ICollectionNames.Token,
        let: letVariables,
        pipeline,
        as,
      },
    }
  },

  logPluginSetupProcessor: (pluginAddress: HexAddress, network: string, as: string = 'plugin') => {
    return {
      $lookup: {
        from: ICollectionNames.LogPluginSetupProcessor,
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
        from: ICollectionNames.Member,
        let: letVariables,
        pipeline,
        as,
      },
    }
  },

  memberTransaction: (
    { network, memberAddress, tokenAddress, type, side }: IAggMemberTransactionParams,
    as: string = 'memberTransaction',
    project?: IAggMemberTransactionProjectFields,
    sort?: any,
    limit?: any,
  ) => {
    const letVariables: any = {}
    const matchConditions: any[] = []

    if (network) {
      letVariables.network = network
      matchConditions.push({ $eq: ['$$network', '$network'] })
    }

    if (type) {
      letVariables.type = type
      matchConditions.push({ $eq: ['$$type', '$type'] })
    }

    if (side) {
      letVariables.side = side
      matchConditions.push({ $eq: ['$$side', '$side'] })
    }

    if (memberAddress) {
      letVariables.address = memberAddress
      matchConditions.push({ $eq: ['$$address', '$address'] })
    }

    if (tokenAddress) {
      letVariables.tokenAddress = tokenAddress
      matchConditions.push({ $eq: ['$$tokenAddress', '$tokenAddress'] })
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

    if (sort) {
      pipeline.push({
        $sort: sort,
      })
    }

    if (limit) {
      pipeline.push({
        $limit: limit,
      })
    }

    if (project) {
      pipeline.push({
        $project: project,
      })
    }

    return {
      $lookup: {
        from: ICollectionNames.MemberTransaction,
        let: letVariables,
        pipeline,
        as,
      },
    }
  },

  vpMember: (
    { tokenAddress, network, memberAddress }: IAggVpMemberParams,
    as: string = 'vpMember',
    project?: IAggVpMemberProjectFields,
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
        from: ICollectionNames.VpMember,
        let: letVariables,
        pipeline,
        as,
      },
    }
  },

  pluginMetrics: (
    { pluginAddress, network, memberAddress }: IAggPluginMetricsParams,
    as: string = 'vpMember',
    project?: IAggPluginMetricsProjectFields,
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
        from: ICollectionNames.PluginMetrics,
        let: letVariables,
        pipeline,
        as,
      },
    }
  },

  pluginSlug: (
    { pluginAddress, network }: IAggPluginSlugParams,
    as: string = 'token',
    project?: IAggTokenProjectFields,
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
        from: ICollectionNames.PluginSlug,
        let: letVariables,
        pipeline,
        as,
      },
    }
  },
  computeHasActions: () => ({ $cond: [{ $gt: [{ $size: { $ifNull: ['$rawActions', []] } }, 0] }, true, false] }),
}
