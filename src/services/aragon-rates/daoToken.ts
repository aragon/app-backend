import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Token from '@models/schema/token'

import config from '@config'
import Covalent from '@helpers/covalent'

const llo = logger.logMeta.bind(null, { service: 'rates:DaoToken' })
export const FetchDaoTokenInfo = {
  batchSize: config.CRAWLER_CONFIG.TOKEN_RATES_BATCH_SIZE,
  concurrency: config.CRAWLER_CONFIG.TOKEN_RATES_CONCURRENCY,
  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start FetchRates', llo({ startTime }))

    const crawler = new DBCrawler({
      model: Models.Plugin,
      onDocument: FetchDaoTokenInfo.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error Dao Token Info', llo({ error, document }))
      },
      useAggregate: true,
      aggregate: FetchDaoTokenInfo.getAllDaoTokens(),
      batchSize: FetchDaoTokenInfo.batchSize,
      concurrency: FetchDaoTokenInfo.concurrency,
    })

    await crawler.crawl()

    const duration = Date.now() - startTime
    logger.verbose(
      'End FetchRates',
      llo({ lastTimeSync: crawler.crawlResult.lastCreatedAt, duration: `${duration}ms` }),
    )
  },

  getAllDaoTokens() {
    return [
      {
        $match: {
          tokenAddress: { $ne: null },
        },
      },
      {
        $lookup: {
          from: 'token',
          let: { tokenAddr: '$tokenAddress' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$address', '$$tokenAddr'],
                },
              },
            },
            {
              $project: {
                id: 1,
                type: 1,
                network: 1,
                address: 1,
                totalSupply: 1,
                holders: 1,
              },
            },
          ],
          as: 'token',
        },
      },
      {
        $addFields: {
          token: {
            $arrayElemAt: ['$token', 0],
          },
        },
      },
      {
        $replaceRoot: {
          newRoot: '$token',
        },
      },
    ]
  },

  async onDocument(token: Partial<Token>) {
    const tokenInfo = await Covalent.getTokenInfo(token.address!, token.network!)
    if (!tokenInfo) {
      return
    }

    const tokenDb = await Models.Token.findByEntityId(token.id!)

    await DbTx.executeTxFn(async ({ session }) => {
      tokenDb.holders = tokenInfo.totalHolders
      tokenDb.totalSupply = tokenInfo.totalSupply

      const logDb = await tokenDb.update(tokenDb, { session })
      await session.commitTransaction()
      await session.endSession()
      logger.verbose(
        'Token Info updated',
        llo({ logId: logDb.id, tokenSymbol: logDb.symbol, tokenType: logDb.type, priceUsd: logDb.priceUsd }),
      )
    })
  },
}
