import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import TokenUtils from '@helpers/tokenUtils'
import logger from '@logger'
import type Token from '@models/schema/token'
import DBCrawler from '@models/utils/crawler'
import { type IMigration, ITokenType, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: addSpamFieldsToToken' })

const TESTNET_NETWORKS = [NetworksEnum.ethereumSepolia, NetworksEnum.zksyncSepolia]

export const addSpamFieldsToTokenMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260114110516-addSpamFieldsToToken' }))

    try {
      const crawler = new DBCrawler({
        model: Models.Token,
        onDocument: async (token: Token) => {
          const coinGeckoResult = await CoinGeckoHelper.getToken(token.address, token.network)
          const coinGeckoData = coinGeckoResult || null

          const coinGeckoInfo =
            coinGeckoData?.priceUsd && parseFloat(coinGeckoData.priceUsd) > 0
              ? { priceUsd: coinGeckoData.priceUsd }
              : null

          const { spamScore, isSpam } = TokenUtils.shouldMarkAsSpam({
            name: token.name || '',
            symbol: token.symbol || '',
            logo: token.logo,
            tokenType: token.type,
            isGovernance: token.isGovernance,
            isTestnet: TESTNET_NETWORKS.includes(token.network),
            coinGeckoInfo,
          })

          token.spamScore = spamScore
          token.isSpam = isSpam
          if (coinGeckoData?.logo) token.logo = coinGeckoData.logo
          if (coinGeckoData?.priceUsd) token.priceUsd = coinGeckoData.priceUsd

          await token.save()

          logger.verbose(
            'Updated token spam fields',
            llo({
              address: token.address,
              network: token.network,
              spamScore,
              isSpam,
            }),
          )
        },
        onError: (error: any, document: any) => {
          logger.error(
            'Error updating token spam fields',
            llo({
              error,
              address: document.address,
              network: document.network,
            }),
          )
        },
        where: {
          network: { $nin: TESTNET_NETWORKS },
          isGovernance: false,
          type: ITokenType.ERC20,
          logo: { $in: [null, ''] },
        },
        batchSize: 1000,
        concurrency: 100,
      })

      await crawler.crawl()
      logger.info(
        'Migration completed successfully',
        llo({
          migration: '20260114110516-addSpamFieldsToToken',
        }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20260114110516-addSpamFieldsToToken', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default addSpamFieldsToTokenMigration
