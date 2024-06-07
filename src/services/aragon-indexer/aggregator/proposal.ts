import { AggregatorTypeEnum } from '@types'
import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import { UtilsIndexer } from '@models/utils/indexer'
import type Proposal from '@models/schema/proposal'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorProposal' })

export const AggregatorProposal = {
  start: async () => {
    logger.verbose('Start AggregatorProposal', llo({}))

    const aggregatorDb = await Models.Aggregator.findByType(AggregatorTypeEnum.proposals)

    const crawler = new DBCrawler({
      model: Models.LogProposal,
      onDocument: AggregatorProposal.onDocument,
      onError: (error: any) => {
        logger.error('Error AggregatorProposal', llo({ error }))
      },
      useAggregate: true,
      aggregate: AggregatorProposal.query(),
      batchSize: 1000,
      concurrency: 1,
    })

    await crawler.crawl()
    await UtilsIndexer.saveAggregationSync(crawler, aggregatorDb, 'lastTimeSync')
    logger.verbose('End AggregatorProposal', llo({ lastTimeSync: crawler.crawlResult?.lastCreatedAt }))
  },

  async onDocument(document: Proposal) {
    const existingLog = await Models.Proposal.findExistingLog(
      document.transactionHash,
      document.pluginAddress,
      document.proposalId,
    )

    await DbTx.executeTxFn(async ({ session }) => {
      let logDb: any
      if (!existingLog) {
        logDb = await Models.Proposal.create(document, { session })
      } else {
        logDb = await existingLog.update(document, { session })
      }
      await session.commitTransaction()
      await session.endSession()
      logger.verbose(existingLog ? 'Update Aggregate Proposal' : 'New Aggregate Proposal', llo({ logId: logDb?.id }))
    })
  },

  query() {
    return [
      {
        $project: {
          entityId: 1,
          pluginAddress: 1,
          creatorAddress: 1,
          proposalId: 1,
          executed: 1,
          startDate: 1,
          endDate: 1,
          transactionHash: 1,
          blockNumber: 1,
          network: 1,
          metadataUri: 1,
        },
      },
      {
        $lookup: {
          from: 'logPluginSetupProcessor',
          localField: 'pluginAddress',
          foreignField: 'pluginAddress',
          as: 'pluginInfo',
        },
      },
      {
        $addFields: {
          pluginInfo: {
            $arrayElemAt: ['$pluginInfo', 0],
          },
        },
      },
      {
        $lookup: {
          from: 'logProposalMetadata',
          let: {
            pluginAddress: '$pluginAddress',
            proposalId: '$proposalId',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: ['$pluginAddress', '$$pluginAddress'],
                    },
                    {
                      $eq: ['$proposalId', '$$proposalId'],
                    },
                  ],
                },
              },
            },
            {
              $sort: {
                blockNumber: -1,
              },
            },
          ],
          as: 'metadata',
        },
      },
      {
        $addFields: {
          metadata: {
            $arrayElemAt: ['$metadata', 0],
          },
        },
      },
      {
        $lookup: {
          from: 'setting',
          localField: 'pluginAddress',
          foreignField: 'pluginAddress',
          as: 'pluginSettings',
        },
      },
      {
        $addFields: {
          pluginSettings: {
            $arrayElemAt: ['$pluginSettings', 0],
          },
        },
      },
      {
        $unwind: '$pluginSettings.history',
      },
      {
        $addFields: {
          validSettings: {
            $cond: {
              if: {
                $and: [
                  { $lte: ['$pluginSettings.history.fromBlockNumber', '$blockNumber'] },
                  {
                    $or: [
                      { $gt: ['$pluginSettings.history.toBlockNumber', '$blockNumber'] },
                      { $eq: ['$pluginSettings.history.toBlockNumber', null] },
                    ],
                  },
                ],
              },
              then: '$pluginSettings.history',
              else: null,
            },
          },
        },
      },
      {
        $match: {
          validSettings: {
            $ne: null,
          },
        },
      },
      {
        $addFields: {
          settings: {
            $mergeObjects: [
              '$validSettings.settings',
              '$validSettings.settings.configs',
              {
                fromBlockNumber: '$validSettings.fromBlockNumber',
                toBlockNumber: '$validSettings.toBlockNumber',
                fromTxHash: '$validSettings.fromTxHash',
                toTxHash: '$validSettings.toTxHash',
              },
            ],
          },
        },
      },
      {
        $project: {
          blockNumber: 1,
          entityId: 1,
          startDate: 1,
          endDate: 1,
          executed: 1,
          pluginAddress: 1,
          transactionHash: 1,
          network: 1,
          metadataUri: 1,
          proposalId: 1,
          creatorAddress: 1,
          daoAddress: '$pluginInfo.daoAddress',
          title: '$metadata.title',
          description: '$metadata.description',
          summary: '$metadata.summary',
          media: '$metadata.media',
          settings: 1,
        },
      },
    ]
  },
}
