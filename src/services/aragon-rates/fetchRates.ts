import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Token from '@models/schema/token'
import dayjs from '@helpers/dayjs'
import { EnumQueueName, ITokenType, NetworksEnum } from '@types'
import config from '@config'
import TokenUtils from '@helpers/tokenUtils'
import RabbitMQHelper from '@helpers/rabbitMQ'
import ProxyWeb3Provider from '@modules/proxyProvider'

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
        logger.error('Error FetchRates on testnet', llo({ error, document }))
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

    await FetchRates.updateDaoMetrics()

    const duration = Date.now() - startTime

    logger.verbose(
      'End FetchRates and dao metrics',
      llo({
        lastTimeSyncMainnet: crawlerMainnet.crawlResult.lastCreatedAt,
        lastTimeSyncTestnet: crawlerTestnet.crawlResult,
        duration: `${duration}ms`,
      }),
    )
  },

  async updateDaoMetrics() {
    logger.verbose(
      'Start Dao Metrics Update',
      llo({
        startTime: Date.now(),
      }),
    )

    const crawler = new DBCrawler({
      model: Models.Asset,
      useAggregate: true,
      aggregate: (_skip: number | undefined, _limit: number | undefined) => {
        return [
          {
            $match: {
              network: {
                $nin: [NetworksEnum.ethereumSepolia, NetworksEnum.zksyncSepolia],
              },
            },
          },
          {
            $group: {
              _id: '$daoAddress',
              fields: {
                $last: {
                  daoAddress: '$daoAddress',
                  network: '$network',
                },
              },
            },
          },
          {
            $skip: _skip ?? 0,
          },
          {
            $limit: _limit ?? 500,
          },
          {
            $addFields: {
              daoAddress: '$fields.daoAddress',
              network: '$fields.network',
            },
          },
          {
            $project: {
              daoAddress: 1,
              network: 1,
            },
          },
        ]
      },
      onDocument: FetchRates.onDaoDocument,
      onError: (error: any, document: any) => {
        logger.error('Error Dao Metrics Update', llo({ error, document }))
      },
      batchSize: 100,
      concurrency: 10,
    })

    await crawler.crawl()
    logger.verbose('End Dao Metrics Update', llo({}))
  },

  async onDaoDocument(document: any) {
    await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
      id: document.daoAddress,
      params: { address: document.daoAddress, network: document.network },
    })
  },

  async onTestnetDocument(token: Token) {
    try {
      const tokenMetrics = await ProxyWeb3Provider.fetchTokenHolderAndSupply({
        address: token.address,
        network: token.network,
      })

      if (!tokenMetrics?.totalHolders || !tokenMetrics?.totalSupply) {
        return
      }

      if (token.holders === tokenMetrics.totalHolders && token.totalSupply === tokenMetrics.totalSupply) return

      const rawTokenUpdate = {
        holders: tokenMetrics.totalHolders,
        totalSupply: tokenMetrics.totalSupply,
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
      logger.error('Error FetchRates on testnet', llo({ error, address: token.address, network: token.network }))
    }
  },

  async onMainnetDocument(token: Token) {
    try {
      const tokenUpdate = await ProxyWeb3Provider.fetchBasicTokenInfo({
        address: token.address,
        network: token.network,
      })

      const tokenMetrics = await ProxyWeb3Provider.fetchTokenHolderAndSupply({
        address: token.address,
        network: token.network,
      })
      if (!tokenMetrics || !tokenUpdate) return

      const rawTokenUpdate = {
        holders: tokenMetrics.totalHolders,
        totalSupply: tokenMetrics.totalSupply,
        priceUsd: tokenUpdate.priceUsd,
      }

      if (
        token.priceUsd === rawTokenUpdate.priceUsd &&
        token.holders === rawTokenUpdate.holders &&
        token.totalSupply === rawTokenUpdate.totalSupply
      ) {
        return
      }

      if (TokenUtils.shouldSkipFetch(token, rawTokenUpdate)) {
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
      logger.error('Error FetchRates', llo({ error, network: token.network, tokenAddress: token.address }))
    }
  },
}
