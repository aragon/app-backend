import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Delegate from '@models/schema/delegate'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorDelegate' })

export const AggregatorDelegate = {
  start: async () => {
    logger.verbose('Start AggregatorDelegate', llo({}))

    const crawler = new DBCrawler({
      model: Models.LogMember,
      onDocument: AggregatorDelegate.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error AggregatorDelegate', llo({ error, document }))
      },
      useAggregate: true,
      aggregate: AggregatorDelegate.query(),
      batchSize: 1000,
      concurrency: 1,
    })

    await crawler.crawl()
    logger.verbose('End AggregatorDelegate', llo({ lastTimeSync: crawler.crawlResult?.lastCreatedAt }))
  },

  async onDocument(document: Partial<Delegate>) {
    const existingLog = await Models.Delegate.findExistingLog({
      network: document.network!,
      transactionHash: document.transactionHash!,
    })

    await DbTx.executeTxFn(async ({ session }) => {
      let logDb: any
      if (!existingLog) {
        logDb = await Models.Delegate.create(document, { session } as any)
      } else {
        logDb = await existingLog.update(document, { session })
      }
      await session.commitTransaction()
      await session.endSession()
      logger.verbose(existingLog ? 'Update Aggregate Delegate' : 'Aggregate Delegate', llo({ logId: logDb?.id }))
    })
  },

  query() {
    return [
      {
        $match: { event: 'DelegateChanged' },
      },
      {
        $lookup: {
          from: 'logPluginSetupProcessor',
          let: { pluginAddr: '$pluginAddress' },
          pipeline: [
            { $match: { $expr: { $eq: ['$pluginAddress', '$$pluginAddr'] } } },
            { $project: { daoAddress: 1, _id: 0 } },
          ],
          as: 'daoAddressDetails',
        },
      },
      {
        $addFields: {
          daoAddress: { $arrayElemAt: ['$daoAddressDetails.daoAddress', 0] },
        },
      },
      {
        $lookup: {
          from: 'token',
          localField: 'tokenAddress',
          foreignField: 'address',
          as: 'tokenDetails',
        },
      },
      {
        $addFields: {
          token: {
            $cond: {
              if: { $eq: [{ $size: '$tokenDetails' }, 0] },
              then: null,
              else: {
                $let: {
                  vars: {
                    token: { $arrayElemAt: ['$tokenDetails', 0] },
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
      {
        $project: {
          _id: 0,
          fromDelegate: 1,
          toDelegate: 1,
          amount: '$newVotingPower',
          transactionHash: 1,
          network: 1,
          pluginAddress: 1,
          tokenAddress: 1,
          daoAddress: 1,
          blockNumber: 1,
          token: 1,
        },
      },
    ]
  },
}
