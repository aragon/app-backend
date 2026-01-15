import config from '@config'
import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import dayjs from '@helpers/dayjs'
import TokenUtils from '@helpers/tokenUtils'
import logger from '@logger'
import type Token from '@models/schema/token'
import DBCrawler from '@models/utils/crawler'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'rates:RefreshSpamTokens' })

export const RefreshSpamTokens = {
  batchSize: config.CRAWLER_CONFIG.TOKEN_RATES_BATCH_SIZE,
  concurrency: config.CRAWLER_CONFIG.TOKEN_RATES_CONCURRENCY,

  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start RefreshSpamTokens', llo({ startTime }))

    const spamScoreThreshold = config.SERVICES.ARAGON_RATES.SPAM_SCORE_THRESHOLD

    const crawler = new DBCrawler({
      model: Models.Token,
      onDocument: RefreshSpamTokens.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error RefreshSpamTokens', llo({ error, document }))
      },
      where: {
        isSpam: true,
        spamScore: { $lt: spamScoreThreshold },
      },
      batchSize: RefreshSpamTokens.batchSize,
      concurrency: RefreshSpamTokens.concurrency,
    })

    await crawler.crawl()

    const duration = Date.now() - startTime

    logger.verbose(
      'End RefreshSpamTokens',
      llo({
        crawlResult: crawler.crawlResult,
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

      const { isSpam: stillSpam } = TokenUtils.shouldMarkAsSpam({
        name: token.name || '',
        symbol: token.symbol || '',
        logo: token.logo,
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

      if (stillSpam) {
        return
      }

      await DbTx.executeTxFn(async ({ session }) => {
        await token.update(
          {
            isSpam: false,
            lastUpdatedAt: dayjs.utc().toDate(),
          },
          { session },
        )
        await DbTx.safeCommit(session)
        logger.verbose(
          'Token spam status cleared',
          llo({
            logId: token.id,
            tokenSymbol: token.symbol,
            tokenName: token.name,
            spamScore: token.spamScore,
          }),
        )
      })
    } catch (error) {
      logger.error('Error RefreshSpamTokens', llo({ error, address: token.address, network: token.network }))
    }
  },
}
