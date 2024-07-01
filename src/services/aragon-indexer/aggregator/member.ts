import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Member from '@models/schema/member'
import { NetworkHelper } from '@helpers/network'
import { type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorMembers' })

export const AggregatorMembers = {
  start: async () => {
    logger.verbose('Start AggregatorMembers', llo({}))

    const supportedNetworks = NetworkHelper.supportedNetworks().map(network => network.networkName)
    const crawler = new DBCrawler({
      model: Models.LogMember,
      onDocument: AggregatorMembers.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error AggregatorMembers', llo({ error, document }))
      },
      useAggregate: true,
      aggregate: AggregatorMembers.query(
        AggregatorMembers.queryVotingPowerMembers(supportedNetworks),
        AggregatorMembers.queryMultisigMembers(supportedNetworks),
      ),
      batchSize: 1000,
      concurrency: 1,
    })

    await crawler.crawl()
    logger.verbose('End AggregatorMembers', llo({ lastTimeSync: crawler.crawlResult.lastCreatedAt }))
  },

  onDocument: async function (document: Partial<Member>) {
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

  query(votingPowerMembers: any, multisigMembers: any) {
    return [
      {
        $facet: {
          votingPowerMembers,
          multisigMembers,
        },
      },
      {
        $project: {
          combined: { $concatArrays: ['$votingPowerMembers', '$multisigMembers'] },
        },
      },
      { $unwind: '$combined' },
      { $replaceRoot: { newRoot: '$combined' } },
      { $sort: { 'history.fromBlockNumber': -1 } },
      {
        $group: {
          _id: '$address',
          history: { $push: '$history' },
        },
      },
      {
        $project: {
          _id: 0,
          address: '$_id',
          history: {
            $reduce: {
              input: '$history',
              initialValue: [],
              in: { $concatArrays: ['$$value', '$$this'] },
            },
          },
        },
      },
      {
        $addFields: {
          history: { $arrayElemAt: ['$history', 0] },
        },
      },
    ]
  },

  queryVotingPowerMembers(networks: NetworksEnum[]) {
    return [
      {
        $match: {
          network: { $in: networks },
          event: { $in: ['MembersAdded', 'MembersRemoved'] },
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
        $lookup: {
          from: 'logPluginSetupProcessor',
          localField: '_id.pluginAddress',
          foreignField: 'pluginAddress',
          pipeline: [
            { $match: { event: 'InstallationPrepared' } },
            { $project: { daoAddress: 1, pluginAddress: 1, pluginSetupRepo: 1 } },
          ],
          as: 'pluginInfo',
        },
      },
      {
        $lookup: {
          from: 'logPluginRepo',
          localField: 'pluginInfo.pluginSetupRepo',
          foreignField: 'pluginRepo',
          pipeline: [{ $project: { subdomain: 1 } }],
          as: 'pluginRepoInfo',
        },
      },
      {
        $project: {
          _id: 0,
          address: '$_id.address',
          pluginAddress: '$_id.pluginAddress',
          network: '$_id.network',
          events: 1,
          daoAddress: { $arrayElemAt: ['$pluginInfo.daoAddress', 0] },
          pluginSubdomain: { $arrayElemAt: ['$pluginRepoInfo.subdomain', 0] },
        },
      },
      {
        $addFields: {
          history: {
            $reduce: {
              input: '$events',
              initialValue: { isAdded: false, entries: [] },
              in: {
                $cond: {
                  if: { $eq: ['$$this.event', 'MembersAdded'] },
                  then: {
                    isAdded: true,
                    entries: {
                      $concatArrays: [
                        '$$value.entries',
                        [
                          {
                            network: '$network',
                            fromBlockNumber: '$$this.blockNumber',
                            fromTxHash: '$$this.transactionHash',
                            toBlockNumber: null,
                            toTxHash: null,
                            pluginAddress: '$$this.pluginAddress',
                            daoAddress: '$daoAddress',
                            pluginSubdomain: '$pluginSubdomain',
                          },
                        ],
                      ],
                    },
                  },
                  else: {
                    isAdded: false,
                    entries: {
                      $map: {
                        input: '$$value.entries',
                        as: 'entry',
                        in: {
                          $cond: {
                            if: {
                              $and: [
                                { $eq: ['$$entry.pluginAddress', '$$this.pluginAddress'] },
                                { $eq: ['$$entry.toBlockNumber', null] },
                              ],
                            },
                            then: {
                              network: '$$entry.network',
                              fromBlockNumber: '$$entry.fromBlockNumber',
                              fromTxHash: '$$entry.fromTxHash',
                              toBlockNumber: '$$this.blockNumber',
                              toTxHash: '$$this.transactionHash',
                              pluginAddress: '$$entry.pluginAddress',
                              daoAddress: '$$entry.daoAddress',
                              pluginSubdomain: '$$entry.pluginSubdomain',
                            },
                            else: '$$entry',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: '$address',
          history: { $push: '$history.entries' },
        },
      },
      {
        $addFields: {
          history: {
            $reduce: {
              input: '$history',
              initialValue: [],
              in: { $concatArrays: ['$$value', '$$this'] },
            },
          },
        },
      },
      {
        $unwind: '$history',
      },
      {
        $sort: {
          'history.toTxHash': -1, // Sort by toTxHash, with non-null values coming first
          'history.fromBlockNumber': 1, // Then sort by fromBlockNumber
        },
      },
      {
        $group: {
          _id: '$_id',
          history: { $push: '$history' },
        },
      },
      {
        $project: {
          _id: 0,
          address: '$_id',
          history: 1,
        },
      },
    ]
  },

  queryMultisigMembers(networks: NetworksEnum[]) {
    return [
      {
        $match: {
          network: { $in: networks },
          event: { $in: ['MembersAdded', 'MembersRemoved'] },
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
        $lookup: {
          from: 'logPluginSetupProcessor',
          localField: '_id.pluginAddress',
          foreignField: 'pluginAddress',
          pipeline: [
            { $match: { event: 'InstallationPrepared' } },
            { $project: { daoAddress: 1, pluginAddress: 1, pluginSetupRepo: 1 } },
          ],
          as: 'pluginInfo',
        },
      },
      {
        $lookup: {
          from: 'logPluginRepo',
          localField: 'pluginInfo.pluginSetupRepo',
          foreignField: 'pluginRepo',
          pipeline: [{ $project: { subdomain: 1 } }],
          as: 'pluginRepoInfo',
        },
      },
      {
        $project: {
          _id: 0,
          address: '$_id.address',
          pluginAddress: '$_id.pluginAddress',
          network: '$_id.network',
          events: 1,
          daoAddress: { $arrayElemAt: ['$pluginInfo.daoAddress', 0] },
          pluginSubdomain: { $arrayElemAt: ['$pluginRepoInfo.subdomain', 0] },
        },
      },
      {
        $addFields: {
          history: {
            $reduce: {
              input: '$events',
              initialValue: { isAdded: false, entries: [] },
              in: {
                $cond: {
                  if: { $eq: ['$$this.event', 'MembersAdded'] },
                  then: {
                    isAdded: true,
                    entries: {
                      $concatArrays: [
                        '$$value.entries',
                        [
                          {
                            network: '$network',
                            fromBlockNumber: '$$this.blockNumber',
                            fromTxHash: '$$this.transactionHash',
                            toBlockNumber: null,
                            toTxHash: null,
                            pluginAddress: '$$this.pluginAddress',
                            daoAddress: '$daoAddress',
                            pluginSubdomain: '$pluginSubdomain',
                          },
                        ],
                      ],
                    },
                  },
                  else: {
                    isAdded: false,
                    entries: {
                      $map: {
                        input: '$$value.entries',
                        as: 'entry',
                        in: {
                          $cond: {
                            if: {
                              $and: [
                                { $eq: ['$$entry.pluginAddress', '$$this.pluginAddress'] },
                                { $eq: ['$$entry.toBlockNumber', null] },
                              ],
                            },
                            then: {
                              network: '$$entry.network',
                              fromBlockNumber: '$$entry.fromBlockNumber',
                              fromTxHash: '$$entry.fromTxHash',
                              toBlockNumber: '$$this.blockNumber',
                              toTxHash: '$$this.transactionHash',
                              pluginAddress: '$$entry.pluginAddress',
                              daoAddress: '$$entry.daoAddress',
                              pluginSubdomain: '$$entry.pluginSubdomain',
                            },
                            else: '$$entry',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: '$address',
          history: { $push: '$history.entries' },
        },
      },
      {
        $addFields: {
          history: {
            $reduce: {
              input: '$history',
              initialValue: [],
              in: { $concatArrays: ['$$value', '$$this'] },
            },
          },
        },
      },
      {
        $unwind: '$history',
      },
      {
        $sort: {
          'history.toTxHash': -1, // Sort by toTxHash, with non-null values coming first
          'history.fromBlockNumber': 1, // Then sort by fromBlockNumber
        },
      },
      {
        $group: {
          _id: '$_id',
          history: { $push: '$history' },
        },
      },
      {
        $project: {
          _id: 0,
          address: '$_id',
          history: 1,
        },
      },
    ]
  },
}
