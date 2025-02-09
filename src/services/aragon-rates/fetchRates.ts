import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Token from '@models/schema/token'
import { RateModule } from '@modules/rates'
import dayjs from '@helpers/dayjs'
import { ITokenType, NetworksEnum } from '@types'
import config from '@config'
import { ProxyToken } from '@modules/proxyToken'
import Web3Helper from '@helpers/web3'
import CovalentHelper from '@helpers/covalent'
import BlockScoutHelper from '@helpers/blockScout'

const llo = logger.logMeta.bind(null, { service: 'rates:FetchRates' })

export const FetchRates = {
  batchSize: config.CRAWLER_CONFIG.TOKEN_RATES_BATCH_SIZE,
  concurrency: config.CRAWLER_CONFIG.TOKEN_RATES_CONCURRENCY,

  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start FetchRates', llo({ startTime }))

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
              { lastUpdatedAt: { $lte: new Date(dayjs.utc().subtract(6, 'hours').toDate()) } },
            ],
          },
        ],
      },
      batchSize: FetchRates.batchSize,
      concurrency: FetchRates.concurrency,
    })

    await crawler.crawl()

    const duration = Date.now() - startTime
    logger.verbose(
      'End FetchRates',
      llo({ lastTimeSync: crawler.crawlResult.lastCreatedAt, duration: `${duration}ms` }),
    )
  },

  async onDocument(token: Token) {
    try {
      const rawTokenUpdate = {
        priceChangeOnDayUsd: '0',
        priceUsd: '0',
      }

      const [rawRate, blockScoutInfo] = await Promise.all([
        RateModule.fetchRate(token.address, token.network),
        token.type === ITokenType.native
          ? Promise.resolve(null)
          : BlockScoutHelper.getTokenFullDetails(token.address, token.network),
      ])

      // If both source failed to fetch token details, skip the token
      if (rawRate.decimals === null && !blockScoutInfo) {
        return
      }

      if (rawRate.decimals !== null) {
        Object.assign(rawTokenUpdate, {
          priceUsd: rawRate.priceUsd,
          priceChangeOnDayUsd: rawRate.priceChangeOnDayUsd,
        })
      }

      if (blockScoutInfo) {
        Object.assign(rawTokenUpdate, {
          holders: blockScoutInfo.holders,
          totalSupply: blockScoutInfo.totalSupply,
        })
      }

      if (
        !blockScoutInfo &&
        (token.type === ITokenType.GovernanceERC20 || Web3Helper.isWhitelistedToken(token.address, token.network))
      ) {
        const covalentInfo = await CovalentHelper.getTokenSupplyAndHolders(token.address, token.network)
        if (covalentInfo.totalSupply !== '0' && covalentInfo.totalHolders !== 0) {
          Object.assign(rawTokenUpdate, {
            holders: covalentInfo.totalHolders,
            totalSupply: covalentInfo.totalSupply,
          })
        }
      }

      if (rawRate.decimals === null && blockScoutInfo) {
        Object.assign(rawTokenUpdate, {
          priceUsd: blockScoutInfo.priceUsd,
        })
      }

      // If token price is not 0 and rate is 0, skip the token
      if (token.priceUsd !== '0' && rawRate.priceUsd === '0') {
        return
      }

      if (ProxyToken.shouldSkipFetch(token, rawRate)) {
        Object.assign(rawTokenUpdate, {
          lastUpdatedAt: dayjs.utc().toDate(),
          skipFetchRate: true,
        })
      }

      await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await token.update(
          {
            ...rawTokenUpdate,
            lastUpdatedAt: dayjs.utc().toDate(),
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
        logger.verbose(
          'Token rate updated',
          llo({ logId: logDb.id, tokenSymbol: logDb.symbol, tokenType: logDb.type, priceUsd: logDb.priceUsd }),
        )
      })
    } catch (error) {
      logger.error('Error FetchRates', llo({ error }))
    }
  },
}
