import { AggregatorTypeEnum } from '@types'
import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import { UtilsIndexer } from '@models/utils/indexer'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorMembers' })

export const AggregatorMembers = {
  start: async () => {
    logger.verbose('Start AggregatorMembers', llo({}))

    const aggregatorDb = await Models.Aggregator.findByType(AggregatorTypeEnum.members)

    const crawler = new DBCrawler({
      model: Models.LogMember,
      onDocument: AggregatorMembers.onDocument,
      onError: (error: any) => {
        logger.error('Error AggregatorMembers', llo({ error }))
      },
      useAggregate: true,
      aggregate: AggregatorMembers.query(),
      batchSize: 1000,
      concurrency: 1,
    })

    await crawler.crawl()
    await UtilsIndexer.saveAggregationSync(crawler, aggregatorDb, 'lastTimeSync')
    logger.verbose('End AggregatorMembers', llo({ lastTimeSync: crawler.crawlResult.lastCreatedAt }))
  },

  async onDocument(document: any) {
    const existingLog = await Models.Member.findExistingLog(document.address)
    if (!existingLog) {
      // TODO: find user ens
      await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await Models.Member.create(document, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New Aggregate Member', llo({ logId: logDb.id }))
      })
    } else {
      await DbTx.executeTxFn(async ({ session }) => {
        await existingLog.update(document, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Update Aggregate Member', llo({ logId: existingLog.id }))
      })
    }
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
        $project: {
          _id: 0,
          memberAddress: '$_id.memberAddress',
          daos: {
            $map: {
              input: '$history',
              as: 'entry',
              in: {
                $cond: [
                  { $eq: ['$$entry.event', 'MembersAdded'] },
                  {
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
                  },
                  {
                    $cond: [
                      { $eq: ['$$entry.event', 'DelegateChanged'] },
                      {
                        pluginAddress: '$_id.pluginAddress',
                        fromBlockNumber: '$$entry.blockNumber',
                        fromTxHash: '$$entry.transactionHash',
                        network: '$_id.network',
                        votingPower: '$$entry.newVotingPower',
                        delegateFromAddress: '$$entry.fromDelegate',
                        delegateToAddress: '$$entry.toDelegate',
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
          memberAddress: '$_id',
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
