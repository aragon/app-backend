import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Token from '@models/schema/token'
import { RateModule } from '@modules/rates'
import dayjs from '@helpers/dayjs'
import { NetworksEnum } from '@types'
import { UtilsIndexer } from '@indexer/utils/indexer'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:FetchRates' })

export const FetchRates = {
  start: async () => {
    logger.verbose('Start FetchRates', llo({}))

    const crawler = new DBCrawler({
      model: Models.Token,
      onDocument: FetchRates.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error FetchRates', llo({ error, document }))
      },
      where: {
        $and: [
          { skipFetchRate: { $ne: true } },
          { network: { $nin: [NetworksEnum.zksyncSepolia, NetworksEnum.ethereumSepolia] } },
          {
            $or: [
              { lastUpdatedAt: { $exists: false } },
              { lastUpdatedAt: null },
              { lastUpdatedAt: { $lte: dayjs.utc().subtract(6, 'hours').toDate() } },
            ],
          },
        ],
      },
      batchSize: 1000,
      concurrency: 1,
    })

    await crawler.crawl()
    logger.verbose('End FetchRates', llo({ lastTimeSync: crawler.crawlResult.lastCreatedAt }))
  },

  async onDocument(token: Token) {
    const rawTokenUpdateRate = await RateModule.fetchRate(token.address, token.network)

    // skip governance tokens with no price or unsupported token networks
    if (UtilsIndexer.skipFetchToken(token, rawTokenUpdateRate)) {
      rawTokenUpdateRate.lastUpdatedAt = dayjs.utc().toDate()
      rawTokenUpdateRate.skipFetchRate = true
    }

    await DbTx.executeTxFn(async ({ session }) => {
      const logDb = await token.update(rawTokenUpdateRate, { session })
      await session.commitTransaction()
      await session.endSession()
      logger.verbose(
        'Token rate updated',
        llo({ logId: logDb.id, tokenSymbol: logDb.symbol, tokenType: logDb.type, priceUsd: logDb.priceUsd }),
      )
    })
  },
}
