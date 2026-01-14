import config from '@config'
import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import dayjs from '@helpers/dayjs'
import TokenUtils from '@helpers/tokenUtils'
import logger from '@logger'
import type Token from '@models/schema/token'
import DBCrawler from '@models/utils/crawler'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'rates:RefreshScamTokens' })

export const RefreshScamTokens = {
  batchSize: config.CRAWLER_CONFIG.TOKEN_RATES_BATCH_SIZE,
  concurrency: config.CRAWLER_CONFIG.TOKEN_RATES_CONCURRENCY,

  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start RefreshScamTokens', llo({ startTime }))

    const scamScoreThreshold = config.SERVICES.ARAGON_RATES.SCAM_SCORE_THRESHOLD

    const crawler = new DBCrawler({
      model: Models.Token,
      onDocument: RefreshScamTokens.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error RefreshScamTokens', llo({ error, document }))
      },
      where: {
        isScam: true,
        scamScore: { $lt: scamScoreThreshold },
      },
      batchSize: RefreshScamTokens.batchSize,
      concurrency: RefreshScamTokens.concurrency,
    })

    await crawler.crawl()

    const duration = Date.now() - startTime

    logger.verbose(
      'End RefreshScamTokens',
      llo({
        processedCount: crawler.crawlResult.count,
        duration: `${duration}ms`,
      }),
    )
  },

  async onDocument(token: Token) {
    try {
      const isTestnet = CoinGeckoHelper.isTestNetwork(token.network)

      if (isTestnet) {
        return
      }

      const coinGeckoInfo = await CoinGeckoHelper.getToken(token.address, token.network)

      const stillScam = TokenUtils.shouldMarkAsScam({
        name: token.name || '',
        symbol: token.symbol || '',
        tokenType: token.type,
        isGovernance: token.isGovernance,
        isTestnet,
        coinGeckoInfo: coinGeckoInfo
          ? {
              priceUsd: coinGeckoInfo.priceUsd,
              name: coinGeckoInfo.name,
              symbol: coinGeckoInfo.symbol,
            }
          : null,
      })

      if (stillScam) {
        return
      }

      await DbTx.executeTxFn(async ({ session }) => {
        await token.update(
          {
            isScam: false,
            lastUpdatedAt: dayjs.utc().toDate(),
          },
          { session },
        )
        await DbTx.safeCommit(session)
        logger.verbose(
          'Token scam status cleared',
          llo({
            logId: token.id,
            tokenSymbol: token.symbol,
            tokenName: token.name,
            scamScore: token.scamScore,
          }),
        )
      })
    } catch (error) {
      logger.error('Error RefreshScamTokens', llo({ error, address: token.address, network: token.network }))
    }
  },
}
