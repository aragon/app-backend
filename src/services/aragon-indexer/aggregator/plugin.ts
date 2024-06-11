import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import { type IAPlugin } from '@src/types/plugin'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorPlugin' })

export const AggregatorPlugin = {
  start: async () => {
    logger.verbose('Start AggregatorPlugin', llo({}))

    const crawler = new DBCrawler({
      model: Models.LogPluginSetupProcessor,
      onDocument: AggregatorPlugin.onDocument,
      onError: (error: any) => {
        logger.error('Error AggregatorPlugin', llo({ error }))
      },
      useAggregate: true,
      aggregate: AggregatorPlugin.query(),
      batchSize: 1000,
      concurrency: 1,
    })

    await crawler.crawl()
    logger.verbose('End AggregatorPlugin', llo({ lastTimeSync: crawler.crawlResult.lastCreatedAt }))
  },

  async onDocument(document: IAPlugin) {
    const existingLog = await Models.Plugin.findExistingLog(document.transactionHash, document.action, document.network)

    await DbTx.executeTxFn(async ({ session }) => {
      let logDb: any
      if (!existingLog) {
        logDb = await Models.Plugin.create(document, { session })
      } else {
        logDb = await existingLog.update(document, { session })
      }
      await session.commitTransaction()
      await session.endSession()
      logger.verbose(existingLog ? 'Update Aggregate Plugin' : 'New Aggregate Plugin', llo({ logId: logDb?.id }))
    })
  },

  query() {
    return [
      {
        $match: {
          $or: [
            { event: 'InstallationPrepared' },
            { event: 'InstallationApplied' },
            { event: 'UpdatePrepared' },
            { event: 'UpdateApplied' },
            { event: 'UninstallationPrepared' },
            { event: 'UninstallationApplied' },
          ],
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
          localField: 'prepared.pluginSetupRepo',
          foreignField: 'pluginRepo',
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
