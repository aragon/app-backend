import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Token from '@models/schema/token'
import dayjs from '@helpers/dayjs'
import { ITokenType, NetworksEnum } from '@types'
import config from '@config'
import { ProxyToken } from '@modules/proxyToken'

import TokenUtils from '@helpers/tokenUtils'
import BlockScoutHelper from '@helpers/blockScout'

const llo = logger.logMeta.bind(null, { service: 'rates:FetchRates' })

export const FetchRates = {
  batchSize: config.CRAWLER_CONFIG.TOKEN_RATES_BATCH_SIZE,
  concurrency: config.CRAWLER_CONFIG.TOKEN_RATES_CONCURRENCY,

  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start FetchRates', llo({ startTime }))

    const crawlerMainnet = new DBCrawler({
      model: Models.Token,
      onDocument: FetchRates.onMainnetDocument,
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

    const crawlerTestnet = new DBCrawler({
      model: Models.Token,
      onDocument: FetchRates.onTestnetDocument,
      onError: (error: any, document: any) => {
        logger.error('Error FetchRates', llo({ error, document }))
      },
      where: {
        $and: [
          { type: ITokenType.ERC20, isGovernance: true },
          { network: { $in: [NetworksEnum.zksyncSepolia, NetworksEnum.ethereumSepolia] } },
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

    await Promise.all([crawlerMainnet.crawl(), crawlerTestnet.crawl()])

    const duration = Date.now() - startTime
    logger.verbose(
      'End FetchRates',
      llo({
        lastTimeSyncMainnet: crawlerMainnet.crawlResult.lastCreatedAt,
        lastTimeSyncTestnet: crawlerTestnet.crawlResult,
        duration: `${duration}ms`,
      }),
    )
  },

  async onTestnetDocument(token: Token) {
    try {
      const rawTokenUpdate = {
        holders: 0,
        totalSupply: '0',
      }

      const blockScoutInfo = await BlockScoutHelper.getTokenFullDetails(token.address, token.network)

      if (!blockScoutInfo?.holders || !blockScoutInfo?.totalSupply) return
      if (token.holders === blockScoutInfo.holders && token.totalSupply === blockScoutInfo.totalSupply) return

      Object.assign(rawTokenUpdate, {
        holders: blockScoutInfo.holders,
        totalSupply: blockScoutInfo.totalSupply,
      })

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
      logger.error('Error FetchRates on testnet', llo({ error }))
    }
  },

  async onMainnetDocument(token: Token) {
    try {
      const rawTokenUpdate = await TokenUtils.fetchTokenUpdate(token)
      if (!rawTokenUpdate) return

      if (
        token.priceUsd === rawTokenUpdate.priceUsd &&
        token.holders === rawTokenUpdate.holders &&
        token.totalSupply === rawTokenUpdate.totalSupply
      ) {
        return
      }

      // check if to skip fetching rate
      if (ProxyToken.shouldSkipFetch(token, rawTokenUpdate as any)) {
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
