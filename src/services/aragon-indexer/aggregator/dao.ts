import { AggregatorTypeEnum } from '@types'
import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import { UtilsIndexer } from '@models/utils/indexer'
import type Dao from '@models/schema/dao'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorDao' })

export const AggregatorDao = {
  start: async () => {
    logger.verbose('Start AggregatorDao', llo({}))

    const aggregatorDb = await Models.Aggregator.findByType(AggregatorTypeEnum.daos)

    const crawler = new DBCrawler({
      model: Models.LogDaoRegistry,
      onDocument: AggregatorDao.onDocument,
      onError: (error: any) => {
        logger.error('Error AggregatorDao', llo({ error }))
      },
      useAggregate: true,
      aggregate: AggregatorDao.query(),
      batchSize: 1000,
      concurrency: 1,
    })

    await crawler.crawl()
    await UtilsIndexer.saveAggregationSync(crawler, aggregatorDb, 'lastTimeSync')
    logger.verbose('End AggregatorDao', llo({ lastTimeSync: crawler.crawlResult?.lastCreatedAt }))
  },

  async onDocument(document: Dao) {
    const existingLog = await Models.Dao.findExistingLog(document.address, document.network)

    await DbTx.executeTxFn(async ({ session }) => {
      let logDb: any
      if (!existingLog) {
        document.blockTimestamp = await Web3Helper.getBlockTimestamp(document.blockNumber, document.network)
        logDb = await Models.Dao.create(document, { session })
      } else {
        logDb = await existingLog.update(document, { session })
      }
      await session.commitTransaction()
      await session.endSession()
      logger.verbose(existingLog ? 'Update Aggregate Dao' : 'New Aggregate Dao', llo({ logId: logDb?.id }))
    })
  },

  query() {
    return [
      {
        $lookup: {
          from: 'plugin',
          let: { daoAddress: '$address' },
          pipeline: [
            { $match: { $expr: { $eq: ['$daoAddress', '$$daoAddress'] } } },
            {
              $sort: {
                pluginSetupRepoAddress: 1,
                blockNumber: -1,
              },
            },
            {
              $group: {
                _id: '$pluginSetupRepoAddress',
                doc: { $first: '$$ROOT' },
              },
            },
            {
              $replaceRoot: { newRoot: '$doc' },
            },
            {
              $project: {
                transactionHash: 1,
                blockNumber: 1,
                network: 1,
                type: 1,
                address: 1,
                implementationAddress: 1,
                release: 1,
                build: 1,
                subdomain: 1,
                pluginSetupRepoAddress: 1,
              },
            },
          ],
          as: 'plugins',
        },
      },
      {
        $group: {
          _id: '$address',
          network: { $first: '$network' },
          creatorAddress: { $first: '$creatorAddress' },
          ens: { $first: '$ens' },
          plugins: { $push: '$plugins' },
          transactionHash: { $first: '$transactionHash' },
          blockNumber: { $first: '$blockNumber' },
        },
      },
      {
        $lookup: {
          from: 'member',
          let: { pluginAddresses: '$plugins.address' },
          pipeline: [
            { $unwind: '$daos' },
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ['$daos.pluginAddress', '$$pluginAddresses'] },
                    {
                      $or: [
                        { $eq: ['$daos.toBlockNumber', null] },
                        { $not: { $ifNull: ['$daos.toBlockNumber', false] } },
                      ],
                    },
                  ],
                },
              },
            },
          ],
          as: 'members',
        },
      },
      {
        $addFields: {
          members: {
            $map: {
              input: '$members',
              as: 'member',
              in: '$$member.address',
            },
          },
        },
      },
      {
        $lookup: {
          from: 'logProposal',
          let: { pluginAddresses: '$plugins.address' },
          pipeline: [
            { $match: { $expr: { $in: ['$pluginAddress', '$$pluginAddresses'] } } },
            {
              $group: {
                _id: '$pluginAddress',
                uniqueVoters: { $addToSet: '$voteEvents.memberAddress' },
                votes: { $sum: { $size: '$voteEvents' } },
                proposalsCreated: { $sum: 1 },
                proposalsExecuted: {
                  $sum: {
                    $cond: [{ $eq: ['$executed.status', true] }, 1, 0],
                  },
                },
                latestBlockNumber: { $max: '$blockNumber' },
                latestTxHash: {
                  $first: {
                    $cond: [{ $eq: ['$blockNumber', { $max: '$blockNumber' }] }, '$transactionHash', null],
                  },
                },
              },
            },
          ],
          as: 'proposals',
        },
      },
      {
        $addFields: {
          proposals: { $ifNull: [{ $first: '$proposals' }, {}] },
        },
      },
      {
        $addFields: {
          flattenedUniqueVoters: {
            $reduce: {
              input: {
                $map: {
                  input: '$proposals.uniqueVoters',
                  as: 'uniqueVoterSet',
                  in: { $setUnion: '$$uniqueVoterSet' },
                },
              },
              initialValue: [],
              in: { $setUnion: ['$$value', '$$this'] },
            },
          },
        },
      },
      {
        $addFields: {
          totalUniqueVoters: { $size: { $ifNull: ['$flattenedUniqueVoters', []] } },
        },
      },
      {
        $project: {
          members: 1,
          transactionHash: 1,
          network: 1,
          address: '$_id',
          ens: '$ens',
          creatorAddress: 1,
          plugins: 1,
          proposalsCreated: '$proposals.proposalsCreated',
          proposalsExecuted: '$proposals.proposalsExecuted',
          latestBlockNumber: '$proposals.latestBlockNumber',
          latestTxHash: '$proposals.latestTxHash',
          totalUniqueVoters: 1,
          blockNumber: 1,
          votes: '$proposals.votes',
        },
      },
      {
        $lookup: {
          from: 'logDaoMetadata',
          localField: 'address',
          foreignField: 'daoAddress',
          as: 'metadata',
        },
      },
      {
        $addFields: {
          metadata: {
            $arrayElemAt: [
              {
                $sortArray: {
                  input: '$metadata',
                  sortBy: {
                    blockNumber: -1,
                  },
                },
              },
              0,
            ],
          },
        },
      },
      {
        $addFields: {
          mergedData: {
            $mergeObjects: [
              {
                creatorAddress: '$creatorAddress',
                address: '$address',
                plugins: '$plugins',
                uniqueVoters: '$totalUniqueVoters',
                votes: { $ifNull: ['$votes', 0] },
                proposalsCreated: { $ifNull: ['$proposalsCreated', 0] },
                proposalsExecuted: { $ifNull: ['$proposalsExecuted', 0] },
                ens: '$ens',
                blockNumber: '$blockNumber',
                transactionHash: '$transactionHash',
                network: '$network',
                members: '$members',
                latestBlockNumber: '$latestBlockNumber',
                latestTxHash: '$latestTxHash',
              },
              {
                metadataUri: '$metadata.metadataUri',
                name: '$metadata.name',
                description: '$metadata.description',
                avatar: '$metadata.avatar',
                links: '$metadata.links',
              },
            ],
          },
        },
      },
      {
        $replaceRoot: {
          newRoot: '$mergedData',
        },
      },
    ]
  },
}
