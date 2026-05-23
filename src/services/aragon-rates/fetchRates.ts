import config from '@config'
import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import dayjs from '@helpers/dayjs'
import GovernanceVeHelper from '@helpers/governanceVe'
import RabbitMQHelper from '@helpers/rabbitMQ'
import TokenUtils from '@helpers/tokenUtils'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Token from '@models/schema/token'
import DBCrawler from '@models/utils/crawler'
import DbTx from '@modules/dbTx'
import DexQuoterModule from '@modules/dexQuoter'
import { EnumQueueName, ITokenType, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'rates:FetchRates' })

export const FetchRates = {
  batchSize: config.CRAWLER_CONFIG.TOKEN_RATES_BATCH_SIZE,
  concurrency: config.CRAWLER_CONFIG.TOKEN_RATES_CONCURRENCY,

  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start FetchRates', llo({ startTime }))

    // Networks with an on-chain DEX quoter are priced via DEX fallback even when
    // skipFetchRate was set by an earlier CoinGecko-only run.
    const dexNetworks = Object.keys(config.DEX_QUOTERS) as NetworksEnum[]

    const crawlerMainnet = new DBCrawler({
      model: Models.Token,
      onDocument: FetchRates.onMainnetDocument,
      onError: (error: any, document: any) => {
        logger.error('Error FetchRates', llo({ error, document }))
      },
      where: {
        $and: [
          { $or: [{ skipFetchRate: { $ne: true } }, { network: { $in: dexNetworks } }] },
          { isSpam: { $ne: true } },
          { network: { $nin: [NetworksEnum.zksyncSepolia, NetworksEnum.ethereumSepolia] } },
          {
            $or: [
              { nextFetchRateAt: { $exists: false } },
              { nextFetchRateAt: null },
              { nextFetchRateAt: { $lte: new Date() } },
            ],
          },
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
          {
            $or: [{ type: ITokenType.ERC20, isGovernance: true }, { type: ITokenType.escrowAdapter }],
          },
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
      let onChainSupply: bigint
      if (token.type === ITokenType.escrowAdapter) {
        const veSupply = await GovernanceVeHelper.getVePastTotalSupply(token.address, token.network)
        if (veSupply == null) {
          logger.warn(
            'Skipping escrow adapter totalSupply update — getVePastTotalSupply returned null',
            llo({ tokenAddress: token.address, network: token.network }),
          )
          return
        }
        onChainSupply = BigInt(veSupply)
      } else {
        const erc20Supply = await Web3Helper.getTokenTotalSupply(token.address, token.network)
        if (!erc20Supply) return
        onChainSupply = erc20Supply
      }

      if (token.totalSupply === onChainSupply.toString()) return

      const rawTokenUpdate = {
        totalSupply: onChainSupply.toString(),
      }

      await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await token.update(
          {
            ...rawTokenUpdate,
            lastUpdatedAt: dayjs.utc().toDate(),
          },
          { session },
        )
        await DbTx.safeCommit(session)
        logger.verbose(
          'Token rate updated',
          llo({ logId: logDb.id, tokenSymbol: logDb.symbol, tokenType: logDb.type, priceUsd: logDb.priceUsd }),
        )
      })
    } catch (error) {
      logger.error('Error FetchRates on testnet', llo({ error, address: token.address, network: token.network }))
    }
  },

  async getDexPriceUsd(token: Token): Promise<string | null> {
    try {
      const quote = await DexQuoterModule.getRateInNative({
        network: token.network,
        tokenAddress: token.address,
      })
      if (!quote) return null

      const nativeToken = await Models.Token.findOne({
        network: token.network,
        type: ITokenType.native,
      })
      const nativePriceUsd = parseFloat(nativeToken?.priceUsd ?? '0')
      if (!Number.isFinite(nativePriceUsd) || nativePriceUsd <= 0 || !nativeToken?.decimals) {
        return null
      }

      // amountOut is denominated in the wrapped-native asset (e.g. WcBTC on
      // Citrea), which shares decimals with the chain's native asset, so the
      // native Token doc's decimals are the right scale here.
      const priceInNative = Number(quote.amountOut) / 10 ** nativeToken.decimals
      if (!Number.isFinite(priceInNative) || priceInNative <= 0) return null

      return (priceInNative * nativePriceUsd).toString()
    } catch (error) {
      logger.warn('Failed to compute DEX USD price', llo({ error, address: token.address, network: token.network }))
      return null
    }
  },

  async onMainnetDocument(token: Token) {
    try {
      const isNativeToken = token.type === ITokenType.native
      const totalSupply =
        token.type === ITokenType.escrowAdapter
          ? await GovernanceVeHelper.getVePastTotalSupply(token.address, token.network)
          : !isNativeToken && token.hasTotalSupply
            ? await Web3Helper.getTokenTotalSupply(token.address, token.network)
            : null

      // CoinGecko's per-token endpoint requires the network to be in its
      // `networksMap`; for unsupported chains (e.g. Citrea) the ERC-20 call
      // always fails, so skip it and go straight to the DEX. Native tokens use
      // a different CoinGecko path (`/coins/{id}`) that works regardless.
      const hasDexQuoter = !!config.DEX_QUOTERS[token.network]?.length
      const coingeckoCanQueryToken = isNativeToken || !CoinGeckoHelper.isTestNetwork(token.network)

      const coingeckoInfo = coingeckoCanQueryToken
        ? await CoinGeckoHelper.getToken(token.address, token.network)
        : false

      const dexPriceUsd =
        !coingeckoInfo && !isNativeToken && hasDexQuoter ? await FetchRates.getDexPriceUsd(token) : null
      const hasRate = !!coingeckoInfo || dexPriceUsd !== null

      const failCount = (token.fetchRateFailCount || 0) + 1

      const rawTokenUpdate: Partial<Token> = {
        totalSupply: (totalSupply ?? token.totalSupply ?? '0').toString(),
        priceUsd: coingeckoInfo ? coingeckoInfo.priceUsd : (dexPriceUsd ?? token.priceUsd),
        logo: coingeckoInfo ? coingeckoInfo.logo : token.logo,
        fetchRateFailCount: hasRate ? 0 : failCount,
        nextFetchRateAt: hasRate ? null : new Date(Date.now() + TokenUtils.getNextFetchRateDelay(failCount - 1)),
      }

      if (
        token.priceUsd === rawTokenUpdate.priceUsd &&
        token.totalSupply === rawTokenUpdate.totalSupply &&
        token.logo === rawTokenUpdate.logo &&
        (token.fetchRateFailCount ?? 0) === rawTokenUpdate.fetchRateFailCount
      ) {
        await token.update({ lastUpdatedAt: dayjs.utc().toDate() })
        return
      }

      if (TokenUtils.shouldSkipFetch(token, { priceUsd: rawTokenUpdate.priceUsd || '0' })) {
        Object.assign(rawTokenUpdate, {
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
        await DbTx.safeCommit(session)
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
