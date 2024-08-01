import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Dao from '@models/schema/dao'
import Web3Helper from '@helpers/web3'
import { type NetworksEnum } from '@types'
import { NetworkHelper } from '@helpers/network'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorDao' })

export const AggregatorDao = {
  batchSize: config.CRAWLER_CONFIG.DA0_BATCH_SIZE,
  concurrency: config.CRAWLER_CONFIG.DAO_CONCURRENCY,

  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start AggregatorDao', llo({ startTime }))

    const supportedNetworks = NetworkHelper.supportedNetworks().map(network => network.networkName)
    const crawler = new DBCrawler({
      model: Models.LogDaoRegistry,
      onDocument: AggregatorDao.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error AggregatorDao', llo({ error, document }))
      },
      useAggregate: true,
      aggregate: AggregatorDao.query(supportedNetworks),
      batchSize: AggregatorDao.batchSize,
      concurrency: AggregatorDao.concurrency,
    })

    await crawler.crawl()

    const duration = Date.now() - startTime
    logger.verbose(
      'End AggregatorDao',
      llo({ lastTimeSync: crawler.crawlResult?.lastCreatedAt, duration: `${duration}ms` }),
    )
  },

  async onDocument(document: Partial<Dao>) {
    const existingLog = await Models.Dao.findExistingLog({
      network: document.network!,
      address: document.address!,
    })

    await DbTx.executeTxFn(async ({ session }) => {
      let logDb: any

      document.proposalsCreated = Math.floor(document.proposalsCreated)
      document.proposalsExecuted = Math.floor(document.proposalsExecuted)
      document.uniqueVoters = Math.floor(document.uniqueVoters)
      document.votes = Math.floor(document.votes)
      const isValid = await Web3Helper.subdomainExists(document.subdomain!, document.network!)
      document.ens = isValid ? Web3Helper.parseSubdomainToEns(document.subdomain!) : null

      if (Web3Helper.needToSyncBlockTime(existingLog)) {
        document.blockTimestamp = await Web3Helper.getBlockTimestamp(document.blockNumber!, document.network!)
      }

      if (!existingLog) {
        logDb = await Models.Dao.create(document, { session } as any)
      } else {
        document.tvlUSD = existingLog.tvlUSD // keep tvl
        logDb = await existingLog.update(document, { session })
      }
      await session.commitTransaction()
      await session.endSession()
      logger.verbose(existingLog ? 'Update Aggregate Dao' : 'New Aggregate Dao', llo({ logId: logDb?.id }))
    })
  },

  query(networks: NetworksEnum[]) {
    return [
      {
        $match: {
          ...(networks?.length > 0 && { network: { $in: networks } }),
        },
      },
      {
        $lookup: {
          from: 'plugin',
          let: {
            daoAddr: '$address',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$$daoAddr', '$daoAddress'],
                },
              },
            },
            {
              $sort: {
                tokenAddress: -1, // Sort to prioritize plugins with tokenAddress
              },
            },
            {
              $limit: 1, // Only return the top result after sorting
            },
          ],
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
            { $unwind: '$history' },
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ['$history.pluginAddress', '$$pluginAddresses'] },
                    {
                      $or: [
                        { $eq: ['$history.toBlockNumber', null] },
                        { $not: { $ifNull: ['$history.toBlockNumber', false] } },
                      ],
                    },
                  ],
                },
              },
            },
            { $project: { address: 1 } },
          ],
          as: 'members',
        },
      },
      {
        $addFields: {
          totalMembers: { $size: '$members' },
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
          votes: { $floor: '$proposals.votes' },
        },
      },
      {
        $project: {
          totalMembers: 1,
          members: 1,
          transactionHash: 1,
          network: 1,
          address: '$_id',
          implementationAddress: 1,
          subdomain: {
            $cond: { if: { $eq: ['$subdomain', ''] }, then: null, else: '$subdomain' },
          },
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
                subdomain: '$$plugin.subdomain',
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
          let: {
            daoAddr: '$address',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$$daoAddr', '$daoAddress'],
                },
              },
            },
          ],
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
                metrics: {
                  proposalsCreated: { $ifNull: ['$proposalsCreated', 0] },
                  proposalsExecuted: { $ifNull: ['$proposalsExecuted', 0] },
                  uniqueVoters: '$totalUniqueVoters',
                  votes: { $ifNull: ['$votes', 0] },
                  members: { $ifNull: ['$totalMembers', 0] },
                },
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
