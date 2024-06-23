import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Member from '@models/schema/member'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorMembers' })

export const AggregatorMembers = {
  start: async () => {
    logger.verbose('Start AggregatorMembers', llo({}))

    const crawler = new DBCrawler({
      model: Models.LogMember,
      onDocument: AggregatorMembers.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error AggregatorMembers', llo({ error, document }))
      },
      useAggregate: true,
      aggregate: AggregatorMembers.query(),
      batchSize: 1000,
      concurrency: 1,
    })

    await crawler.crawl()
    logger.verbose('End AggregatorMembers', llo({ lastTimeSync: crawler.crawlResult.lastCreatedAt }))
  },

  async onDocument(document: Partial<Member>) {
    const existingLog = await Models.Member.findExistingLog({ address: document.address! })
    // TODO: find user ens
    await DbTx.executeTxFn(async ({ session }) => {
      let logDb: any
      if (!existingLog) {
        logDb = await Models.Member.create(document, { session } as any)
      } else {
        logDb = await existingLog.update(document, { session })
      }
      await session.commitTransaction()
      await session.endSession()
      logger.verbose(existingLog ? 'Update Aggregate Member' : 'New Aggregate Member', llo({ logId: logDb?.id }))
    })
  },

  query() {
    return [
      {
        $match: {
          event: { $in: ['MembersAdded', 'MembersRemoved', 'DelegateChanged'] },
        },
      },
      {
        $sort: { blockNumber: 1, transactionHash: 1 },
      },
      {
        $group: {
          _id: {
            address: '$address',
            pluginAddress: '$pluginAddress',
            network: '$network',
          },
          events: { $push: '$$ROOT' },
        },
      },
      {
        $project: {
          _id: 0,
          memberAddress: '$_id.address',
          pluginAddress: '$_id.pluginAddress',
          network: '$_id.network',
          events: 1,
        },
      },
      {
        $unwind: '$events',
      },
      {
        $sort: {
          'events.blockNumber': 1,
          'events.transactionHash': 1,
        },
      },
      {
        $group: {
          _id: {
            memberAddress: '$memberAddress',
            pluginAddress: '$pluginAddress',
            network: '$network',
          },
          history: {
            $push: {
              blockNumber: '$events.blockNumber',
              transactionHash: '$events.transactionHash',
              event: '$events.event',
              fromDelegate: '$events.fromDelegate',
              toDelegate: '$events.toDelegate',
              previousVotingPower: '$events.previousVotingPower',
              newVotingPower: '$events.newVotingPower',
            },
          },
        },
      },
      {
        $lookup: {
          from: 'logPluginSetupProcessor',
          localField: '_id.pluginAddress',
          foreignField: 'pluginAddress',
          as: 'pluginInfo',
        },
      },
      {
        $lookup: {
          from: 'logPluginRepo',
          let: { pluginSetupRepo: { $arrayElemAt: ['$pluginInfo.pluginSetupRepo', 0] } },
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
          daoAddress: { $arrayElemAt: ['$pluginInfo.daoAddress', 0] },
          pluginSubdomain: { $arrayElemAt: ['$pluginRepoInfo.subdomain', 0] },
        },
      },
      {
        $project: {
          _id: 0,
          memberAddress: '$_id.memberAddress',
          pluginAddress: '$_id.pluginAddress',
          pluginSubdomain: 1,
          daos: {
            $map: {
              input: '$history',
              as: 'entry',
              in: {
                $cond: [
                  { $eq: ['$$entry.event', 'MembersAdded'] },
                  {
                    daoAddress: '$daoAddress',
                    pluginAddress: '$_id.pluginAddress',
                    fromBlockNumber: '$$entry.blockNumber',
                    fromTxHash: '$$entry.transactionHash',
                    toBlockNumber: {
                      $arrayElemAt: [
                        {
                          $map: {
                            input: {
                              $filter: {
                                input: '$history',
                                as: 'entry',
                                cond: {
                                  $and: [
                                    { $eq: ['$$entry.event', 'MembersRemoved'] },
                                    { $gte: ['$$entry.blockNumber', '$$entry.blockNumber'] },
                                  ],
                                },
                              },
                            },
                            as: 'removed',
                            in: '$$removed.blockNumber',
                          },
                        },
                        0,
                      ],
                    },
                    toTxHash: {
                      $arrayElemAt: [
                        {
                          $map: {
                            input: {
                              $filter: {
                                input: '$history',
                                as: 'entry',
                                cond: {
                                  $and: [
                                    { $eq: ['$$entry.event', 'MembersRemoved'] },
                                    { $gte: ['$$entry.blockNumber', '$$entry.blockNumber'] },
                                  ],
                                },
                              },
                            },
                            as: 'removed',
                            in: '$$removed.transactionHash',
                          },
                        },
                        0,
                      ],
                    },
                    network: '$_id.network',
                    pluginSubdomain: '$pluginSubdomain',
                  },
                  {
                    $cond: [
                      { $eq: ['$$entry.event', 'DelegateChanged'] },
                      {
                        daoAddress: '$daoAddress',
                        pluginAddress: '$_id.pluginAddress',
                        fromBlockNumber: '$$entry.blockNumber',
                        fromTxHash: '$$entry.transactionHash',
                        network: '$_id.network',
                        votingPower: '$$entry.newVotingPower',
                        delegateFromAddress: '$$entry.fromDelegate',
                        delegateToAddress: '$$entry.toDelegate',
                        pluginSubdomain: '$pluginSubdomain',
                      },
                      null,
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          memberAddress: 1,
          daos: {
            $filter: {
              input: '$daos',
              as: 'dao',
              cond: { $ne: ['$$dao', null] },
            },
          },
        },
      },
      {
        $group: {
          _id: '$memberAddress',
          daos: { $push: '$daos' },
        },
      },
      {
        $project: {
          _id: 0,
          address: '$_id',
          daos: {
            $reduce: {
              input: {
                $map: {
                  input: '$daos',
                  as: 'dao',
                  in: { $ifNull: ['$$dao', []] },
                },
              },
              initialValue: [],
              in: { $concatArrays: ['$$value', '$$this'] },
            },
          },
        },
      },
    ]
  },
}
