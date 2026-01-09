import {
  type HexAddress,
  type IAggDaoParams,
  type IAggDaoProjectFields,
  type IAggGaugeMetricsParams,
  type IAggGaugeMetricsProjectFields,
  type IAggLockToVoteMemberParams,
  type IAggMemberParams,
  type IAggMemberProjectFields,
  type IAggPluginInclude,
  type IAggPluginMetricsParams,
  type IAggPluginMetricsProjectFields,
  type IAggPluginParams,
  type IAggPluginProjectFields,
  type IAggPluginSlugParams,
  type IAggProposalParams,
  type IAggSettingParams,
  type IAggSettingProjectFields,
  type IAggTokenMemberParams,
  type IAggTokenMemberProjectFields,
  type IAggTokenParams,
  type IAggTokenProjectFields,
  ICollectionNames,
  IPluginStatus,
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
    { addresses, daoAddress, pluginAddress, network, status, isPolicy }: IAggPluginParams,
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

    if (isPolicy !== undefined) {
      letVariables.isPolicy = isPolicy
      if (!isPolicy) {
        matchConditions.push({
          $or: [{ $eq: ['$isPolicy', false] }, { $eq: [{ $ifNull: ['$isPolicy', null] }, null] }],
        })
      } else {
        matchConditions.push({ $eq: ['$isPolicy', '$$isPolicy'] })
      }
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

  lockToVoteMember: (
    { lockManagerAddress, network, memberAddress }: IAggLockToVoteMemberParams,
    as: string = 'lockToVoteMember',
    project?: IAggTokenMemberProjectFields,
  ) => {
    const letVariables: any = {}
    const matchConditions: any[] = []

    if (lockManagerAddress) {
      letVariables.lockManagerAddress = lockManagerAddress
      matchConditions.push({ $eq: ['$$lockManagerAddress', '$lockManagerAddress'] })
    }

    if (network) {
      letVariables.network = network
      matchConditions.push({ $eq: ['$$network', '$network'] })
    }

    if (memberAddress) {
      letVariables.memberAddress = memberAddress
      matchConditions.push({ $eq: ['$$memberAddress', '$memberAddress'] })
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
        from: ICollectionNames.LockToVoteMember,
        let: letVariables,
        pipeline,
        as,
      },
    }
  },

  tokenMember: (
    { tokenAddress, network, memberAddress }: IAggTokenMemberParams,
    as: string = 'tokenMember',
    project?: IAggTokenMemberProjectFields,
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
      matchConditions.push({ $eq: ['$$memberAddress', '$memberAddress'] })
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
        from: ICollectionNames.TokenMember,
        let: letVariables,
        pipeline,
        as,
      },
    }
  },

  pluginMetrics: (
    { pluginAddress, network, memberAddress }: IAggPluginMetricsParams,
    as: string = 'tokenMember',
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
      matchConditions.push({ $eq: ['$$memberAddress', '$memberAddress'] })
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

  gaugeMetrics: (
    { gaugeAddress, epochId, network, pluginAddress }: IAggGaugeMetricsParams,
    as: string = 'gaugeMetrics',
    project?: IAggGaugeMetricsProjectFields,
  ) => {
    const letVariables: any = {}
    const matchConditions: any[] = []

    if (gaugeAddress) {
      letVariables.gaugeAddress = gaugeAddress
      matchConditions.push({ $eq: ['$$gaugeAddress', '$gaugeAddress'] })
    }

    if (network) {
      letVariables.network = network
      matchConditions.push({ $eq: ['$$network', '$network'] })
    }

    if (epochId) {
      letVariables.epochId = epochId
      matchConditions.push({ $eq: ['$$epochId', '$epochId'] })
    }

    if (pluginAddress) {
      letVariables.pluginAddress = pluginAddress
      matchConditions.push({ $eq: ['$$pluginAddress', '$pluginAddress'] })
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
        from: ICollectionNames.GaugeMetrics,
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

  pluginsFromDaoHierarchy: (
    { daoAddress, network }: { daoAddress: string; network: string },
    as: string = 'plugins',
  ) => {
    return {
      $lookup: {
        from: ICollectionNames.Dao,
        let: { targetDaoAddress: daoAddress },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$address', '$$targetDaoAddress'] }, { $eq: ['$network', network] }],
              },
            },
          },
          {
            $limit: 1,
          },
          {
            $addFields: {
              relatedDaoAddresses: {
                $concatArrays: [
                  ['$$targetDaoAddress'],
                  {
                    $cond: {
                      if: { $ne: ['$parentDao', null] },
                      then: ['$parentDao'],
                      else: [],
                    },
                  },
                  { $ifNull: ['$subDaos', []] },
                ],
              },
            },
          },
          {
            $lookup: {
              from: ICollectionNames.Plugin,
              let: { relatedDaos: '$relatedDaoAddresses' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $in: ['$daoAddress', '$$relatedDaos'] },
                        { $eq: ['$network', network] },
                        { $eq: ['$status', IPluginStatus.installed] },
                      ],
                    },
                  },
                },
              ],
              as: 'plugins',
            },
          },
          {
            $unwind: {
              path: '$plugins',
              preserveNullAndEmptyArrays: false,
            },
          },
          {
            $replaceRoot: {
              newRoot: '$plugins',
            },
          },
        ],
        as,
      },
    }
  },

  pluginDetailsWithNestedSubPlugins: (network: string, useNetworkFieldRef = false) => {
    const networkValue = useNetworkFieldRef ? '$network' : network
    return [
      {
        $addFields: {
          allPluginAddresses: {
            $reduce: {
              input: '$plugins',
              initialValue: [],
              in: {
                $concatArrays: [
                  '$$value',
                  {
                    $reduce: {
                      input: { $ifNull: ['$$this.settings.stages', []] },
                      initialValue: [],
                      in: {
                        $concatArrays: [
                          '$$value',
                          {
                            $map: {
                              input: { $ifNull: ['$$this.plugins', []] },
                              as: 'stagePlugin',
                              in: '$$stagePlugin.address',
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
      AggregationQueryHelper.plugin(
        {
          addresses: '$allPluginAddresses',
          network: networkValue,
          status: IPluginStatus.installed,
          isPolicy: false,
        },
        'allPluginDocs',
        {
          _id: 0,
          transactionHash: 1,
          blockTimestamp: 1,
          address: 1,
          implementationAddress: 1,
          name: 1,
          description: 1,
          processKey: 1,
          slug: 1,
          links: 1,
          isSupported: 1,
          interfaceType: 1,
          conditionAddress: 1,
          lockManagerAddress: 1,
          enableOfacCheck: 1,
          blockedCountries: 1,
          termsConditionsUrl: 1,
          release: 1,
          build: 1,
          subdomain: 1,
          isProcess: 1,
          proposalCreationConditionAddress: 1,
          isBody: 1,
          isSubPlugin: 1,
          totalStages: 1,
          subPlugins: 1,
          stageIndex: 1,
          parentPlugin: 1,
          tokenAddress: 1,
          votingEscrow: 1,
        },
      ),
      {
        $addFields: {
          plugins: {
            $map: {
              input: '$plugins',
              as: 'plugin',
              in: {
                $mergeObjects: [
                  '$$plugin',
                  {
                    settings: {
                      $cond: {
                        if: { $gt: ['$$plugin.settings', null] },
                        then: {
                          $mergeObjects: [
                            '$$plugin.settings',
                            {
                              stages: {
                                $map: {
                                  input: { $ifNull: ['$$plugin.settings.stages', []] },
                                  as: 'stage',
                                  in: {
                                    $mergeObjects: [
                                      '$$stage',
                                      {
                                        plugins: {
                                          $map: {
                                            input: { $ifNull: ['$$stage.plugins', []] },
                                            as: 'stagePlugin',
                                            in: {
                                              $let: {
                                                vars: {
                                                  stagePluginClean: {
                                                    $arrayToObject: {
                                                      $filter: {
                                                        input: {
                                                          $objectToArray: '$$stagePlugin',
                                                        },
                                                        as: 'field',
                                                        cond: {
                                                          $not: {
                                                            $in: ['$$field.k', ['isManual', 'allowedBody']],
                                                          },
                                                        },
                                                      },
                                                    },
                                                  },
                                                  matchedPlugin: {
                                                    $arrayElemAt: [
                                                      {
                                                        $filter: {
                                                          input: '$allPluginDocs',
                                                          as: 'pluginDoc',
                                                          cond: {
                                                            $eq: ['$$pluginDoc.address', '$$stagePlugin.address'],
                                                          },
                                                        },
                                                      },
                                                      0,
                                                    ],
                                                  },
                                                },
                                                in: {
                                                  $mergeObjects: ['$$stagePluginClean', '$$matchedPlugin'],
                                                },
                                              },
                                            },
                                          },
                                        },
                                      },
                                    ],
                                  },
                                },
                              },
                            },
                          ],
                        },
                        else: null,
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          allPluginAddresses: 0,
          allPluginDocs: 0,
        },
      },
    ]
  },
}
