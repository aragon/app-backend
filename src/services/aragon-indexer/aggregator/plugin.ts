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
      aggregate: AggregatorPlugin.query(supportedNetworks),
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
        $group: {
          _id: '$daoAddress',
          prepared: {
            $push: {
              $cond: [
                { $in: ['$event', ['InstallationPrepared', 'UpdatePrepared', 'UninstallationPrepared']] },
                '$$ROOT',
                null,
              ],
            },
          },
          applied: {
            $push: {
              $cond: [
                { $in: ['$event', ['InstallationApplied', 'UpdateApplied', 'UninstallationApplied']] },
                '$$ROOT',
                null,
              ],
            },
          },
        },
      },
      {
        $project: {
          prepared: {
            $filter: {
              input: '$prepared',
              as: 'item',
              cond: { $ne: ['$$item', null] },
            },
          },
          applied: {
            $filter: {
              input: '$applied',
              as: 'item',
              cond: { $ne: ['$$item', null] },
            },
          },
        },
      },
      {
        $match: {
          $and: [{ 'prepared.0': { $exists: true } }, { 'applied.0': { $exists: true } }],
        },
      },
      {
        $unwind: '$prepared',
      },
      {
        $unwind: '$applied',
      },
      {
        $match: {
          $expr: {
            $or: [
              { $eq: ['$prepared.preparedSetupId', '$applied.preparedSetupId'] },
              {
                $and: [
                  { $eq: ['$prepared.event', 'InstallationPrepared'] },
                  { $eq: ['$applied.event', 'InstallationApplied'] },
                ],
              },
              {
                $and: [{ $eq: ['$prepared.event', 'UpdatePrepared'] }, { $eq: ['$applied.event', 'UpdateApplied'] }],
              },
              {
                $and: [
                  { $eq: ['$prepared.event', 'UninstallationPrepared'] },
                  { $eq: ['$applied.event', 'UninstallationApplied'] },
                ],
              },
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'logPluginRepo',
          let: {
            repoAddr: '$prepared.pluginSetupRepo',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$pluginRepo', '$$repoAddr'],
                },
              },
            },
            {
              $project: {
                subdomain: 1,
              },
            },
          ],
          as: 'pluginDetails',
        },
      },
      {
        $unwind: {
          path: '$pluginDetails',
        },
      },
      {
        $project: {
          _id: 0,
          transactionHash: '$applied.transactionHash',
          blockNumber: '$applied.blockNumber',
          network: '$applied.network',
          address: '$prepared.pluginAddress',
          daoAddress: '$prepared.daoAddress',
          tokenAddress: '$prepared.tokenAddress',
          pluginSetupRepoAddress: '$prepared.pluginSetupRepo',
          build: '$prepared.build',
          release: '$prepared.release',
          sender: '$prepared.sender',
          subdomain: '$pluginDetails.subdomain',
          action: {
            $cond: [
              { $eq: ['$prepared.event', 'InstallationPrepared'] },
              'install',
              {
                $cond: [{ $eq: ['$prepared.event', 'UpdatePrepared'] }, 'update', 'uninstall'],
              },
            ],
          },
        },
      },
      {
        $sort: { blockNumber: 1 },
      },
    ]
  },
}
