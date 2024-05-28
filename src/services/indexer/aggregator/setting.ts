import { AggregatorTypeEnum } from '@types'
import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import { UtilsIndexer } from '@models/utils/indexer'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorSetting' })

export const AggregatorSetting = {
  start: async () => {
    logger.verbose('Start AggregatorSetting', llo({}))

    const aggregatorDb = await Models.Aggregator.findByType(AggregatorTypeEnum.plugin)

    const crawler = new DBCrawler({
      model: Models.LogPluginSetupProcessor,
      onDocument: AggregatorSetting.onDocument,
      onError: (error: any) => {
        logger.error('Error AggregatorSetting', llo({ error }))
      },
      useAggregate: true,
      aggregate: AggregatorSetting.query(),
      batchSize: 1000,
      concurrency: 1,
    })

    await crawler.crawl()
    await UtilsIndexer.saveAggregationSync(crawler, aggregatorDb, 'lastTimeSync')
    logger.verbose('End AggregatorSetting', llo({ lastTimeSync: crawler.crawlResult.lastCreatedAt }))
  },

  async onDocument(document: any) {
    const existingLog = await Models.Setting.findExistingLog(document.pluginAddress, document.network)
    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await Models.Setting.create(document, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Aggregate Setting', llo({ logId: logDb.id }))
      })
    } else {
      await DbTx.executeTxFn(async ({ session }) => {
        await existingLog.update(document, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Update Aggregate Setting', llo({ logId: existingLog.id }))
      })
    }
  },

  query() {
    return [
      {
        $group: {
          _id: {
            pluginAddress: '$pluginAddress',
            network: '$network',
          },
          events: { $push: '$$ROOT' },
        },
      },
      {
        $match: {
          $expr: {
            $gt: [{ $size: '$events' }, 2],
          },
        },
      },
      {
        $project: {
          _id: 0,
          pluginAddress: '$_id.pluginAddress',
          network: '$_id.network',
          events: 1,
        },
      },
      {
        $set: {
          history: {
            $map: {
              input: {
                $range: [0, { $size: '$events' }],
              },
              as: 'idx',
              in: {
                $let: {
                  vars: {
                    current: { $arrayElemAt: ['$events', '$$idx'] },
                    next: { $arrayElemAt: ['$events', { $add: ['$$idx', 1] }] },
                  },
                  in: {
                    fromTxHash: '$$current.transactionHash',
                    toTxHash: { $ifNull: ['$$next.transactionHash', null] },
                    fromBlockNumber: { $ifNull: ['$$current.blockNumber', '$$current.blockNumber'] },
                    toBlockNumber: { $ifNull: ['$$next.blockNumber', null] },

                    settings: {
                      $cond: {
                        if: { $ne: [{ $ifNull: ['$$current.minApprovals', null] }, null] },
                        then: {
                          minApprovals: '$$current.minApprovals',
                          onlyListed: '$$current.onlyListed',
                        },
                        else: {
                          votingMode: '$$current.votingMode',
                          supportThreshold: '$$current.supportThreshold',
                          minParticipation: '$$current.minParticipation',
                          minDuration: '$$current.minDuration',
                          minProposerVotingPower: { $toString: '$$current.minProposerVotingPower' },
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
        $project: {
          pluginAddress: 1,
          network: 1,
          history: 1,
        },
      },
    ]
  },
}
