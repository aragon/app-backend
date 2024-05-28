import { AggregatorTypeEnum } from '@types'
import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import { type IAPlugin } from '@src/types/plugin'
import DbTx from '@modules/dbTx'
import dayjs from '@helpers/dayjs'
import ProxyContractHelper from '@helpers/proxyContract'
import { UtilsIndexer } from '@models/utils/indexer'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorPlugin' })

export const AggregatorPlugin = {
  start: async () => {
    logger.verbose('Start AggregatorPlugin', llo({}))

    const aggregatorDb = await Models.Aggregator.findByType(AggregatorTypeEnum.plugin)

    const crawler = new DBCrawler({
      model: Models.LogPluginSetupProcessor,
      onDocument: AggregatorPlugin.onDocument,
      onError: (error: any) => {
        logger.error('Error AggregatorPlugin', llo({ error }))
      },
      useAggregate: true,
      aggregate: AggregatorPlugin.query(aggregatorDb?.lastTimeSync),
      batchSize: 1000,
      concurrency: 1,
    })

    await crawler.crawl()
    await UtilsIndexer.saveAggregationSync(crawler, aggregatorDb, 'lastTimeSync')
    logger.verbose('End AggregatorPlugin', llo({ lastTimeSync: crawler.crawlResult.lastCreatedAt }))
  },

  async onDocument(document: IAPlugin) {
    const existingLog = await Models.Plugin.findExistingLog(document.transactionHash, document.type, document.network)
    if (!existingLog) {
      document.implementationAddress = await ProxyContractHelper.getImplementationAddress(document.address, document.network)

      await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await Models.Plugin.create(document, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Aggregate Plugin', llo({ logId: logDb.id }))
      })
    }
  },

  query(createdAt: Date = dayjs.utc('1970-01-01T00:00:00Z').toDate()) {
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
          createdAt: { $gte: createdAt },
        },
      },
      {
        // Group by daoAddress and collect all relevant events
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
        // Filter out nulls from prepared and applied arrays
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
        // Ensure that both prepared and applied events exist for the daoAddress
        $match: {
          $and: [{ 'prepared.0': { $exists: true } }, { 'applied.0': { $exists: true } }],
        },
      },
      {
        // Unwind the arrays to match prepared and applied events correctly
        $unwind: '$prepared',
      },
      {
        $unwind: '$applied',
      },
      {
        // Ensure the events match correctly based on preparedSetupId or prepared event type
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
          type: {
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
        // Sort by blockNumber in ascending order
        $sort: { blockNumber: 1 },
      },
    ]
  },
}
