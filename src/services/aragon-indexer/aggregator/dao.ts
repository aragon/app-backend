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
      onError: (error: any, document: any) => {
        logger.error('Error AggregatorDao', llo({ error, document }))
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

      document.proposalsCreated = Math.floor(document.proposalsCreated)
      document.proposalsExecuted = Math.floor(document.proposalsExecuted)
      document.uniqueVoters = Math.floor(document.uniqueVoters)
      document.votes = Math.floor(document.votes)
      const isValid = await Web3Helper.subdomainExists(document.subdomain, document.network)
      document.ens = isValid ? Web3Helper.parseSubdomainToEns(document.subdomain) : null

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
          localField: 'address',
          foreignField: 'daoAddress',
          as: 'plugins',
        },
      },
      {
        $unwind: {
          path: '$plugins',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $sort: {
          'plugins.subdomain': 1,
          'plugins.blockNumber': -1,
        },
      },
      {
        $group: {
          _id: {
            address: '$address',
            subdomain: '$plugins.subdomain',
          },
          network: { $first: '$network' },
          creatorAddress: { $first: '$creatorAddress' },
          subdomain: { $first: '$subdomain' },
          plugin: { $first: '$plugins' },
          transactionHash: { $first: '$transactionHash' },
          blockNumber: { $first: '$blockNumber' },
          implementationAddress: { $first: '$implementationAddress' },
        },
      },
      {
        $group: {
          _id: '$_id.address',
          network: { $first: '$network' },
          creatorAddress: { $first: '$creatorAddress' },
          subdomain: { $first: '$subdomain' },
          plugins: { $push: '$plugin' },
          transactionHash: { $first: '$transactionHash' },
          blockNumber: { $first: '$blockNumber' },
          implementationAddress: { $first: '$implementationAddress' },
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
          members: { $size: '$members' },
        },
      },
      // {
      //   $addFields: {
      //     members: {
      //       $map: {
      //         input: '$members',
      //         as: 'member',
      //         in: '$$member.address',
      //       },
      //     },
      //   },
      // },
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
          votes: { $floor: '$proposals.votes' },
        },
      },
      {
        $project: {
          members: 1,
          transactionHash: 1,
          network: 1,
          address: '$_id',
          implementationAddress: 1,
          subdomain: '$subdomain',
          creatorAddress: 1,
          plugins: {
            $map: {
              input: '$plugins',
              as: 'plugin',
              in: {
                transactionHash: '$$plugin.transactionHash',
                blockNumber: '$$plugin.blockNumber',
                type: '$$plugin.type',
                address: '$$plugin.address',
                implementationAddress: '$$plugin.implementationAddress',
                tokenAddress: '$$plugin.tokenAddress',
                pluginSetupRepoAddress: '$$plugin.pluginSetupRepoAddress',
                release: '$$plugin.release',
                build: '$$plugin.build',
                subdomain: '$$plugin.subdomain'
              },
            },
          },
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
                network: '$network',
                blockNumber: '$blockNumber',
                transactionHash: '$transactionHash',
                address: '$address',
                implementationAddress: '$implementationAddress',
                creatorAddress: '$creatorAddress',
                subdomain: '$subdomain',
                members: '$members',
                plugins: '$plugins',
                proposalsCreated: { $ifNull: ['$proposalsCreated', 0] },
                proposalsExecuted: { $ifNull: ['$proposalsExecuted', 0] },
                uniqueVoters: '$totalUniqueVoters',
                votes: { $ifNull: ['$votes', 0] },
                latestBlockNumber: '$latestBlockNumber',
                latestTxHash: '$latestTxHash',
              },
              {
                metadataUri: '$metadata.metadataUri',
                name: '$metadata.name',
                description: '$metadata.description',
                avatar: '$metadata.avatar',
                links: {
                  $map: {
                    input: '$metadata.links',
                    as: 'link',
                    in: {
                      name: '$$link.name',
                      url: '$$link.url',
                    },
                  },
                },
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
      {
        $sort: {
          blockNumber: 1,
        },
      },
    ]
  },
}
