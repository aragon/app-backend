import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Delegate from '@models/schema/delegate'
import { NetworkHelper } from '@helpers/network'
import Web3Helper from '@helpers/web3'
import config from '@config'
import type { NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorDelegate' })

export const AggregatorDelegate = {
  batchSize: config.CRAWLER_CONFIG.MEMBER_DELEGATE_BATCH_SIZE,
  concurrency: config.CRAWLER_CONFIG.MEMBER_DELEGATE_CONCURRENCY,

  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start AggregatorDelegate', llo({ startTime }))

    const supportedNetworks = NetworkHelper.supportedNetworks().map(network => network.networkName)
    const crawler = new DBCrawler({
      model: Models.LogMember,
      onDocument: AggregatorDelegate.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error AggregatorDelegate', llo({ error, document }))
      },
      useAggregate: true,
      aggregate: (skip: number, limit: number) => AggregatorDelegate.query(supportedNetworks, { skip, limit }),
      batchSize: AggregatorDelegate.batchSize,
      concurrency: AggregatorDelegate.concurrency,
    })

    await crawler.crawl()

    const duration = Date.now() - startTime
    logger.verbose(
      'End AggregatorDelegate',
      llo({ lastTimeSync: crawler.crawlResult?.lastCreatedAt, duration: `${duration}ms` }),
    )
  },

  async onDocument(document: Partial<Delegate>) {
    const existingLog = await Models.Delegate.findExistingLog({
      network: document.network!,
      transactionHash: document.transactionHash!,
    })

    await DbTx.executeTxFn(async ({ session }) => {
      let logDb: any

      if (Web3Helper.needToSyncBlockTime(existingLog)) {
        document.blockTimestamp = await Web3Helper.getBlockTimestamp(document.blockNumber!, document.network!)
      }

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

  query(networks: NetworksEnum[], { skip, limit }: { skip: number; limit: number }) {
    return [
      {
        $match: {
          event: 'DelegateChanged',
          ...(networks?.length > 0 && { network: { $in: networks } }),
        },
      },
      {
        $sort: { blockNumber: 1 },
      },
      ...DBCrawler.aggregatePagination(skip, limit),
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
          let: { tokenAddress: '$tokenAddress', network: '$network' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$address', '$$tokenAddress'] }, { $eq: ['$network', '$$network'] }],
                },
              },
            },
            {
              $project: {
                network: 1,
                type: 1,
                address: 1,
                logo: 1,
                name: 1,
                decimals: 1,
                symbol: 1,
                _id: 0,
              },
            },
          ],
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
                $arrayElemAt: ['$tokenDetails', 0],
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
