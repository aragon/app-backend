import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Proposal from '@models/schema/proposal'
import Web3Helper from '@helpers/web3'
import DecodeActions from '@helpers/decodeActions'
import { NetworkHelper } from '@helpers/network'
import { type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorProposal' })

interface ILogAction {
  to: string
  value: string
  data: string
}

// must run after AggregatorSetting
export const AggregatorProposal = {
  start: async () => {
    logger.verbose('Start AggregatorProposal', llo({}))

    const supportedNetworks = NetworkHelper.supportedNetworks().map(network => network.networkName)
    const crawler = new DBCrawler({
      model: Models.LogProposal,
      onDocument: AggregatorProposal.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error AggregatorProposal', llo({ error, document }))
      },
      useAggregate: true,
      aggregate: AggregatorProposal.query(supportedNetworks),
      batchSize: 1000,
      concurrency: 10,
    })

    await crawler.crawl()
    logger.verbose('End AggregatorProposal', llo({ lastTimeSync: crawler.crawlResult?.lastCreatedAt }))
  },

  async onDocument(document: Partial<Proposal>) {
    const existingLog = await Models.Proposal.findExistingLog({
      transactionHash: document.transactionHash!,
      pluginAddress: document.pluginAddress!,
      proposalId: document.proposalId!,
    })

    if (Web3Helper.needToSyncBlockTime(existingLog)) {
      document.blockTimestamp = await Web3Helper.getBlockTimestamp(document.blockNumber!, document.network!)
    }

    if (document?.executed && Web3Helper.needToSyncBlockTime(existingLog?.executed)) {
      document.executed.blockTimestamp = await Web3Helper.getBlockTimestamp(
        document.executed.blockNumber,
        document.network!,
      )
    }

    document.actions = await AggregatorProposal.parseActions(document.actions, document)

    await DbTx.executeTxFn(async ({ session }) => {
      let logDb: any
      if (!existingLog) {
        logDb = await Models.Proposal.create(document, { session } as any)
      } else {
        document.metrics = await AggregatorProposal._getProposalMetrics(
          document.proposalId!.toString(),
          document.pluginAddress!,
        )

        logDb = await existingLog.update(document, { session })
      }
      await session.commitTransaction()
      await session.endSession()
      logger.verbose(existingLog ? 'Update Aggregate Proposal' : 'New Aggregate Proposal', llo({ logId: logDb?.id }))
    })
  },

  async parseActions(logActions: ILogAction[] | any, document: Partial<Proposal>) {
    if (!(logActions?.length > 0)) {
      return []
    }

    const decodeActions = new DecodeActions()

    const actions = await Promise.all(
      logActions.map(async (action: any) => {
        let decodeData: any

        if (action.data?.length >= 10) {
          decodeData = await decodeActions.decodeData(action.data)
        } else {
          decodeData = decodeActions.decodeTransfer(action, document)
        }

        if (decodeData) {
          return { ...action, ...decodeData }
        }

        return action
      }),
    )

    return actions
  },

  query(networks: NetworksEnum[]) {
    return [
      {
        $match: {
          ...(networks?.length > 0 && { network: { $in: networks } }),
        },
      },
      {
        $project: {
          _id: 0,
          pluginAddress: 1,
          creatorAddress: 1,
          proposalId: 1,
          executed: {
            status: 1,
            transactionHash: 1,
            blockNumber: 1,
          },
          startDate: 1,
          endDate: 1,
          actions: {
            $map: {
              input: '$actions',
              as: 'action',
              in: {
                $mergeObjects: [
                  {
                    $arrayToObject: {
                      $filter: {
                        input: { $objectToArray: '$$action' },
                        as: 'kv',
                        cond: { $ne: ['$$kv.k', '_id'] },
                      },
                    },
                  },
                ],
              },
            },
          },
          allowFailureMap: 1,
          transactionHash: 1,
          blockNumber: 1,
          network: 1,
          metadataUri: 1,
        },
      },
      {
        $lookup: {
          from: 'logPluginSetupProcessor',
          localField: 'pluginAddress',
          foreignField: 'pluginAddress',
          pipeline: [
            { $match: { event: 'InstallationPrepared' } },
            { $project: { daoAddress: 1, pluginAddress: 1, pluginSetupRepo: 1, subdomain: 1, tokenAddress: 1 } },
          ],
          as: 'pluginInfo',
        },
      },
      {
        $addFields: {
          pluginInfo: {
            $arrayElemAt: ['$pluginInfo', 0],
          },
        },
      },
      {
        $lookup: {
          from: 'logProposalMetadata',
          let: {
            pluginAddress: '$pluginAddress',
            proposalId: '$proposalId',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: ['$pluginAddress', '$$pluginAddress'],
                    },
                    {
                      $eq: ['$proposalId', '$$proposalId'],
                    },
                  ],
                },
              },
            },
            {
              $sort: {
                blockNumber: -1,
              },
            },
          ],
          as: 'metadata',
        },
      },
      {
        $addFields: {
          metadata: {
            $arrayElemAt: ['$metadata', 0],
          },
        },
      },
      {
        $lookup: {
          from: 'setting',
          localField: 'pluginAddress',
          foreignField: 'pluginAddress',
          as: 'pluginSettings',
        },
      },
      {
        $addFields: {
          pluginSettings: {
            $arrayElemAt: ['$pluginSettings', 0],
          },
        },
      },
      {
        $addFields: {
          validSettings: {
            $cond: {
              if: {
                $and: [
                  { $lte: ['$pluginSettings.fromBlockNumber', '$blockNumber'] },
                  {
                    $or: [
                      { $gt: ['$pluginSettings.toBlockNumber', '$blockNumber'] },
                      { $eq: ['$pluginSettings.toBlockNumber', null] },
                    ],
                  },
                ],
              },
              then: '$pluginSettings',
              else: null,
            },
          },
        },
      },
      {
        $match: {
          validSettings: {
            $ne: null,
          },
        },
      },
      {
        $addFields: {
          settings: {
            $mergeObjects: [
              '$validSettings.settings',
              '$validSettings.settings.configs',
              {
                fromBlockNumber: '$validSettings.fromBlockNumber',
                toBlockNumber: '$validSettings.toBlockNumber',
                fromTxHash: '$validSettings.fromTxHash',
                toTxHash: '$validSettings.toTxHash',
              },
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'logPluginRepo',
          let: { pluginSetupRepo: '$pluginInfo.pluginSetupRepo' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$pluginRepo', '$$pluginSetupRepo'],
                },
              },
            },
            {
              $project: {
                subdomain: 1,
              },
            },
          ],
          as: 'pluginRepoInfo',
        },
      },
      {
        $addFields: {
          pluginSubdomain: {
            $arrayElemAt: ['$pluginRepoInfo.subdomain', 0],
          },
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          blockNumber: 1,
          startDate: 1,
          endDate: 1,
          actions: 1,
          allowFailureMap: 1,
          executed: {
            status: 1,
            transactionHash: 1,
            blockNumber: 1,
          },
          pluginAddress: 1,
          pluginSubdomain: 1,
          transactionHash: 1,
          network: 1,
          metadataUri: 1,
          proposalId: 1,
          creatorAddress: 1,
          daoAddress: '$pluginInfo.daoAddress',
          title: '$metadata.title',
          description: '$metadata.description',
          summary: '$metadata.summary',
          media: {
            header: '$metadata.media.header',
            logo: '$metadata.media.logo',
          },
          settings: {
            votingMode: 1,
            supportThreshold: 1,
            minParticipation: 1,
            minDuration: 1,
            minProposerVotingPower: 1,
            minApprovals: 1,
            onlyListed: 1,
            fromBlockNumber: 1,
            toBlockNumber: 1,
            fromTxHash: 1,
            toTxHash: 1,
          },
        },
      },
    ]
  },

  async _getProposalMetrics(proposalId: string, pluginAddress: string) {
    const query = [
      {
        $match: {
          pluginAddress,
          proposalId,
        },
      },
      {
        $lookup: {
          from: 'member',
          let: {
            network: '$network',
            pluginAddress: '$pluginAddress',
            membersAddresses: '$voteEvents.memberAddress',
            voteBlockNumber: '$voteEvents.blockNumber',
            proposalBlockNumber: '$blockNumber',
            executedBlockNumber: '$executed.blockNumber',
          },
          pipeline: [
            { $unwind: '$history' },
            {
              $sort: {
                blockNumber: 1,
              },
            },
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$history.network', '$$network'] },
                    { $eq: ['$history.pluginAddress', '$$pluginAddress'] },
                    {
                      $and: [
                        {
                          $or: [
                            {
                              $or: [
                                { $eq: ['$history.toBlockNumber', null] },
                                { $lt: ['$history.toBlockNumber', '$$executedBlockNumber'] },
                              ],
                            },
                            { $in: ['$address', '$$membersAddresses'] },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            },
            {
              $addFields: {
                address: '$address',
                ens: '$ens',
                pluginAddress: '$history.pluginAddress',
                fromBlockNumber: '$history.fromBlockNumber',
                toBlockNumber: '$history.toBlockNumber',
              },
            },
            {
              $group: {
                _id: '$address',
                address: { $first: '$address' },
                ens: { $first: '$ens' },
                pluginAddress: { $first: '$history.pluginAddress' },
                fromBlockNumber: { $first: '$history.fromBlockNumber' },
                toBlockNumber: { $first: '$history.toBlockNumber' },
              },
            },
            {
              $project: {
                address: 1,
                ev: 1,
                ens: 1,
                pluginAddress: 1,
                fromBlockNumber: 1,
                toBlockNumber: 1,
              },
            },
          ],
          as: 'member',
        },
      },
      {
        $addFields: {
          totalVotes: { $size: '$voteEvents' },
          missingVotes: {
            $cond: {
              if: {
                $and: [{ $not: ['$executed'] }, { $lt: [{ $size: '$voteEvents' }, { $size: '$member' }] }],
              },
              then: {
                $subtract: [{ $size: '$member' }, { $size: '$voteEvents' }],
              },
              else: 0,
            },
          },
          votesByOption: {
            $map: {
              input: { $setUnion: '$voteEvents.voteOption' },
              as: 'option',
              in: {
                type: '$$option',
                totalVoters: {
                  $size: {
                    $filter: {
                      input: '$voteEvents',
                      as: 'vote',
                      cond: { $eq: ['$$vote.voteOption', '$$option'] },
                    },
                  },
                },
                totalVotingPower: {
                  $sum: {
                    $map: {
                      input: {
                        $filter: {
                          input: '$voteEvents',
                          as: 'vote',
                          cond: { $eq: ['$$vote.voteOption', '$$option'] },
                        },
                      },
                      as: 'vote',
                      in: { $toDouble: '$$vote.votingPower' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $project: {
          totalVotes: 1,
          missingVotes: 1,
          votesByOption: 1,
        },
      },
    ]

    const metrics = await Models.LogProposal.aggregate(query)
    return metrics.length ? metrics[0] : {}
  },
}
