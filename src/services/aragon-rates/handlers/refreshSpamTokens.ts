import config from '@config'
import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import dayjs from '@helpers/dayjs'
import TokenSpam from '@helpers/tokenSpam'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Token from '@models/schema/token'
import DBCrawler from '@models/utils/crawler'
import DbTx from '@modules/dbTx'
import { SpamSource } from '@types'

const llo = logger.logMeta.bind(null, { service: 'rates:RefreshSpamTokens' })

export const RefreshSpamTokens = {
  batchSize: config.CRAWLER_CONFIG.TOKEN_RATES_BATCH_SIZE,
  concurrency: config.CRAWLER_CONFIG.TOKEN_RATES_CONCURRENCY,

  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start RefreshSpamTokens', llo({ startTime }))

    const crawler = new DBCrawler({
      model: Models.Token,
      onDocument: RefreshSpamTokens.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error RefreshSpamTokens', llo({ error, document }))
      },
      where: {
        isSpam: true,
        spamSource: { $ne: SpamSource.CMS },
        // UNREADABLE marks score above the threshold but come from a live read that can
        // fail transiently, so they stay re-checkable alongside the low-score marks.
        $or: [{ spamScore: { $lt: TokenSpam.MARK_THRESHOLD } }, { spamSource: SpamSource.UNREADABLE }],
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

      if (token.spamSource === SpamSource.UNREADABLE) {
        // Only an affirmative balanceOf answer may clear the mark — a provider error
        // (balance null, unreadable false) is inconclusive and keeps it.
        const { balance, unreadable } = await Web3Helper.getERC20BalanceResult(
          token.address,
          token.address,
          token.network,
        )
        if (unreadable || balance === null) {
          return
        }
      }

      const coinGeckoInfo = await CoinGeckoHelper.getToken(token.address, token.network)

      const { isSpam: stillSpam, spamScore } = TokenSpam.evaluate({
        name: token.name || '',
        symbol: token.symbol || '',
        logo: token.logo,
        tokenType: token.type,
        isGovernance: token.isGovernance,
        isTestnet,
        coinGeckoInfo: coinGeckoInfo
          ? {
              priceUsd: coinGeckoInfo.priceUsd,
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
            spamScore,
            spamSource: null,
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
