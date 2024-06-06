import type BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Network from '@models/schema/network'
import DbTx from '@modules/dbTx'
import type DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import { type HexAddress, ITokenType, type NetworksEnum } from '@types'
import TokenDetector from '@helpers/tokenDetector'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Token from '@models/schema/token'

const llo = logger.logMeta.bind(null, { service: 'models:utils:indexer' })

export const UtilsIndexer = {
  saveSync: async (crawler: BlockchainLogCrawler, networkDb: Network, property: string) => {
    if (crawler.crawlResult.nbError === 0 && crawler.crawlResult?.latestBlockNumber > 0) {
      await DbTx.executeTxFn(async ({ session }) => {
        await networkDb.update(
          {
            [property]: crawler.crawlResult.latestBlockNumber,
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
      })
    }
  },

  saveAggregationSync: async (crawler: DBCrawler, aggregatorDb: Network, property: string) => {
    if (crawler?.crawlResult?.nbError === 0 && crawler?.crawlResult?.lastCreatedAt) {
      await DbTx.executeTxFn(async ({ session }) => {
        await aggregatorDb.update(
          {
            [property]: crawler.crawlResult.lastCreatedAt,
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
      })
    }
  },

  saveAndGetToken: async (tokenAddress: HexAddress, network: NetworksEnum): Promise<null | Token> => {
    const existingToken = await Models.Token.findExistingLog(tokenAddress, network)

    if (existingToken) {
      return existingToken
    }

    const tokenTypeInfo = await TokenDetector.detectTokenType(tokenAddress, network)

    if (tokenTypeInfo?.type !== ITokenType.unknown) {
      const tokenInfo = await Web3Helper.getTokenInfo(tokenAddress, network)

      // Note: we could fetch the rates while sync but this will slow down the sync process due to the coinGecko rate limit
      // const rate = await RateModule.fetchRate(tokenAddress, network)

      return await DbTx.executeTxFn(
        async ({ session }) => {
          const rawToken = {
            address: tokenAddress,
            type: tokenTypeInfo?.type,
            implementationAddress: tokenTypeInfo?.implementationAddress,
            network,
            name: tokenInfo.name,
            decimals: tokenInfo.decimals,
            symbol: tokenInfo.symbol,
            totalSupply: tokenInfo.totalSupply,
            // ...rate,
          }
          const logDb = await Models.Token.create(rawToken, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New Token', llo({ logId: logDb.id }))
          return logDb
        },
        { stopRetry: true },
      )
    }

    return null
  },
}
