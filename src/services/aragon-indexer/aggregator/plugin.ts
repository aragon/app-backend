import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Plugin from '@models/schema/plugin'
import { NetworkHelper } from '@helpers/network'
import { type NetworksEnum } from '@types'
import ProxyContractHelper from '@helpers/proxyContract'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorPlugin' })

export const AggregatorPlugin = {
  batchSize: config.CRAWLER_CONFIG.DA0_PLUGIN_BATCH_SIZE,
  concurrency: config.CRAWLER_CONFIG.DAO_PLUGIN_CONCURRENCY,

  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start AggregatorPlugin', llo({ startTime }))

    const supportedNetworks = NetworkHelper.supportedNetworks().map(network => network.networkName)
    const crawler = new DBCrawler({
      model: Models.LogPluginSetupProcessor,
      onDocument: AggregatorPlugin.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error AggregatorPlugin', llo({ error, document }))
      },
      useAggregate: true,
      disablePagination: true,
      aggregate: () => AggregatorPlugin.query(supportedNetworks),
      batchSize: AggregatorPlugin.batchSize,
      concurrency: AggregatorPlugin.concurrency,
    })

    await crawler.crawl()

    const duration = Date.now() - startTime
    logger.verbose(
      'End AggregatorPlugin',
      llo({ lastTimeSync: crawler.crawlResult?.lastCreatedAt, duration: `${duration}ms` }),
    )
  },

  async onDocument(document: Partial<Plugin>) {
    const existingLog = await Models.Plugin.findExistingLog({
      transactionHash: document.transactionHash!,
      action: document.action!,
      network: document.network!,
    })

    await DbTx.executeTxFn(async ({ session }) => {
      let logDb: any
      if (!existingLog) {
        const implementationAddress = await ProxyContractHelper.getImplementationAddress(
          document.address!,
          document.network!,
        )
        if (implementationAddress) {
          document.implementationAddress = implementationAddress
        }
        logDb = await Models.Plugin.create(document as any, { session } as any)
      } else {
        logDb = await existingLog.update(document, { session })
      }
      await session.commitTransaction()
      await session.endSession()
      logger.verbose(existingLog ? 'Update Aggregate Plugin' : 'New Aggregate Plugin', llo({ logId: logDb?.id }))
    })
  },

  query(networks: NetworksEnum[]) {
    return [
      {
        $match: {
          ...(networks?.length > 0 && { network: { $in: networks } }),
          event: {
            $in: [
              'InstallationPrepared',
              'InstallationApplied',
              'UpdatePrepared',
              'UpdateApplied',
              'UninstallationPrepared',
              'UninstallationApplied',
            ],
          },
        },
      },
      {
        $sort: {
          preparedSetupId: 1,
          event: 1,
        },
      },
      {
        $group: {
          _id: {
            preparedSetupId: '$preparedSetupId',
            network: '$network',
          },
          events: {
            $push: {
              eventType: '$event',
              document: '$$ROOT',
            },
          },
        },
      },
      {
        $match: {
          $expr: {
            $gte: [{ $size: '$events' }, 2],
          },
        },
      },
      {
        $project: {
          mergedEvent: {
            $reduce: {
              input: '$events.document',
              initialValue: {},
              in: {
                $mergeObjects: [
                  '$$value',
                  {
                    eventCombination: {
                      $concat: [{ $ifNull: ['$$this.event', ''] }, '|', { $ifNull: ['$$value.event', ''] }],
                    },
                    event: '$$this.event',
                    transactionHash: { $ifNull: ['$$this.transactionHash', '$$value.transactionHash'] },
                    blockNumber: { $ifNull: ['$$this.blockNumber', '$$value.blockNumber'] },
                    network: { $ifNull: ['$$this.network', '$$value.network'] },
                    address: { $ifNull: ['$$this.pluginAddress', '$$value.pluginAddress'] },
                    daoAddress: { $ifNull: ['$$this.daoAddress', '$$value.daoAddress'] },
                    preparedSetupId: { $ifNull: ['$$this.preparedSetupId', '$$value.preparedSetupId'] },
                    appliedSetupId: { $ifNull: ['$$this.appliedSetupId', '$$value.appliedSetupId'] },
                    pluginSetupRepoAddress: { $ifNull: ['$$this.pluginSetupRepo', '$$value.pluginSetupRepo'] },
                    sender: { $ifNull: ['$$this.sender', '$$value.sender'] },
                    release: { $ifNull: ['$$this.release', '$$value.release'] },
                    build: { $ifNull: ['$$this.build', '$$value.build'] },
                    tokenAddress: { $ifNull: ['$$this.tokenAddress', '$$value.tokenAddress'] },
                    permissions: {
                      $cond: {
                        if: {
                          $or: [
                            {
                              $gt: [
                                { $size: { $ifNull: ['$$this.permissions', []] } },
                                { $size: { $ifNull: ['$$value.permissions', []] } },
                              ],
                            },
                            { $eq: [{ $size: { $ifNull: ['$$value.permissions', []] } }, 0] },
                          ],
                        },
                        then: '$$this.permissions',
                        else: '$$value.permissions',
                      },
                    },
                    action: {
                      $switch: {
                        branches: [
                          {
                            case: {
                              $and: [
                                { $in: ['InstallationPrepared', ['$$this.event']] },
                                { $in: ['InstallationApplied', ['$$value.event']] },
                              ],
                            },
                            then: 'install',
                          },
                          {
                            case: {
                              $and: [
                                { $in: ['UpdatePrepared', ['$$this.event']] },
                                { $in: ['UpdateApplied', ['$$value.event']] },
                              ],
                            },
                            then: 'update',
                          },
                          {
                            case: {
                              $and: [
                                { $in: ['UninstallationPrepared', ['$$this.event']] },
                                { $in: ['UninstallationApplied', ['$$value.event']] },
                              ],
                            },
                            then: 'uninstall',
                          },
                        ],
                        default: null,
                      },
                    },
                  },
                ],
              },
            },
          },
          eventType: { $arrayElemAt: ['$events.eventType', 1] },
        },
      },
      {
        $replaceRoot: { newRoot: '$mergedEvent' },
      },
      {
        $match: { action: { $ne: null } },
      },
      {
        $lookup: {
          from: 'logPluginRepo',
          let: {
            repoAddr: '$pluginSetupRepoAddress',
            network: '$network',
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
          as: 'pluginRepo',
        },
      },
      {
        $unwind: {
          path: '$pluginRepo',
        },
      },

      {
        $project: {
          action: 1,
          transactionHash: 1,
          blockNumber: 1,
          network: 1,
          address: 1,
          daoAddress: 1,
          tokenAddress: 1,
          preparedSetupId: 1,
          appliedSetupId: 1,
          pluginSetupRepoAddress: 1,
          sender: 1,
          release: 1,
          build: 1,
          permissions: 1,
          subdomain: '$pluginRepo.subdomain',
        },
      },

      // uninstall
      //        {
      //            $group: {
      //                _id: {
      //                    address: "$address",
      //                    network: "$network",
      //                },
      //                documents: { $push: "$$ROOT" },
      //                hasUninstall: {
      //                    $max: {
      //                        $cond: [{ $eq: ["$action", "uninstall"] }, 1, 0],
      //                    },
      //                },
      //                maxBlockNumber: { $max: "$blockNumber" },
      //            },
      //        },
      //        {
      //            $match: {
      //                hasUninstall: 0, // Exclude groups that have an uninstall action
      //            },
      //        },
      //        {
      //            $project: {
      //                document: {
      //                    $filter: {
      //                        input: "$documents",
      //                        as: "doc",
      //                        cond: {
      //                            $eq: ["$$doc.blockNumber", "$maxBlockNumber"],
      //                        },
      //                    },
      //                },
      //            },
      //        },
      //        {
      //            $unwind: "$document",
      //        },
      //        {
      //            $replaceRoot: {
      //                newRoot: "$document",
      //            },
      //        },
    ]
  },
}
