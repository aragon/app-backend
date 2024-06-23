import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Setting from '@models/schema/setting'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorSetting' })

export const AggregatorSetting = {
  start: async () => {
    logger.verbose('Start AggregatorSetting', llo({}))

    const crawler = new DBCrawler({
      model: Models.LogPluginSetting,
      onDocument: AggregatorSetting.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error AggregatorSetting', llo({ error, document }))
      },
      useAggregate: true,
      aggregate: AggregatorSetting.query(),
      batchSize: 1000,
      concurrency: 1,
    })

    await crawler.crawl()
    logger.verbose('End AggregatorSetting', llo({ lastTimeSync: crawler.crawlResult.lastCreatedAt }))
  },

  async onDocument(document: Partial<Setting>) {
    const existingLog = await Models.Setting.findExistingLog({
      fromTxHash: document.fromTxHash!,
      network: document.network!,
    })

    await DbTx.executeTxFn(async ({ session }) => {
      let logDb: any
      if (!existingLog) {
        logDb = await Models.Setting.create(document, { session } as any)
      } else {
        logDb = await existingLog.update(document, { session })
      }
      await session.commitTransaction()
      await session.endSession()
      logger.verbose(existingLog ? 'Update Aggregate Setting' : 'Aggregate Setting', llo({ logId: logDb?.id }))
    })
  },

  query() {
    return [
      {
        $sort: { blockNumber: 1 },
      },
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
        $lookup: {
          from: 'logPluginSetupProcessor',
          localField: '_id.pluginAddress',
          foreignField: 'pluginAddress',
          as: 'pluginInfo',
        },
      },
      {
        $unwind: '$events',
      },
      {
        $setWindowFields: {
          partitionBy: '$_id',
          sortBy: { 'events.blockNumber': 1 },
          output: {
            nextTransactionHash: {
              $shift: {
                output: '$events.transactionHash',
                by: 1,
              },
            },
            nextBlockNumber: {
              $shift: {
                output: '$events.blockNumber',
                by: 1,
              },
            },
          },
        },
      },
      {
        $lookup: {
          from: 'logPluginRepo',
          let: { pluginSetupRepo: { $arrayElemAt: ['$pluginInfo.pluginSetupRepo', 0] } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$pluginRepo', '$$pluginSetupRepo'],
                },
              },
            },
            {
              $project: {
                subdomain: 1,
              },
            },
          ],
          as: 'pluginRepoInfo',
        },
      },
      {
        $addFields: {
          pluginSubdomain: {
            $arrayElemAt: ['$pluginRepoInfo.subdomain', 0],
          },
        },
      },
      {
        $project: {
          _id: 0,
          daoAddress: { $arrayElemAt: ['$pluginInfo.daoAddress', 0] },
          token: { $arrayElemAt: ['$pluginInfo.tokenAddress', 0] },
          pluginAddress: '$_id.pluginAddress',
          pluginSubdomain: 1,
          network: '$_id.network',
          fromTxHash: '$events.transactionHash',
          toTxHash: '$nextTransactionHash',
          fromBlockNumber: '$events.blockNumber',
          toBlockNumber: '$nextBlockNumber',
          settings: {
            $cond: {
              if: { $ne: [{ $ifNull: ['$events.minApprovals', null] }, null] },
              then: {
                minApprovals: '$events.minApprovals',
                onlyListed: '$events.onlyListed',
              },
              else: {
                votingMode: '$events.votingMode',
                supportThreshold: '$events.supportThreshold',
                minParticipation: '$events.minParticipation',
                minDuration: '$events.minDuration',
                minProposerVotingPower: { $toString: '$events.minProposerVotingPower' },
              },
            },
          },
        },
      },
      {
        $lookup: {
          from: 'token',
          localField: 'token',
          foreignField: 'address',
          as: 'token',
        },
      },
      {
        $addFields: {
          token: {
            $cond: {
              if: { $eq: [{ $size: '$token' }, 0] },
              then: null,
              else: {
                $let: {
                  vars: {
                    token: { $arrayElemAt: ['$token', 0] },
                  },
                  in: {
                    type: '$$token.type',
                    address: '$$token.address',
                    logo: '$$token.logo',
                    name: '$$token.name',
                    decimals: '$$token.decimals',
                    symbol: '$$token.symbol',
                  },
                },
              },
            },
          },
        },
      },
    ]
  },
}
