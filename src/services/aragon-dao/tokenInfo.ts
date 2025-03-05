import { type NetworksEnum } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import Utils from '@helpers/utils'
import DbTx from '@modules/dbTx'
import TokenDetailProvider from '@providers/tokenDetailProvider/providerFactory'
import { type SaveOptions } from 'mongoose'

const llo = logger.logMeta.bind(null, { service: 'tokenInfo' })

interface PollingOptions {
  intervalMs: number
  timeoutMs: number
}

export const TokenDetailFetcherWithRetry = {
  async update(tokenAddress: string, network: NetworksEnum): Promise<void> {
    await DbTx.executeTxFn(async ({ session }) => {
      try {
        const pluginAttachedToken = await Models.Plugin.findByTokenAddress(tokenAddress, network, { session })

        if (!pluginAttachedToken) {
          logger.warn('Token not okay for pooling', llo({ tokenAddress, network }))
          return
        }

        let tokenInfo: { tokenDb: any; tokenDetails: any } | undefined = { tokenDb: null, tokenDetails: null }

        try {
          tokenInfo = await TokenDetailFetcherWithRetry.pollWithRetry(tokenAddress, network, session)
        } catch (_) {
          //
        }

        if (tokenInfo?.tokenDb) {
          await tokenInfo.tokenDb.update(
            {
              name: tokenInfo.tokenDetails.name,
              symbol: tokenInfo.tokenDetails.symbol,
              totalSupply: tokenInfo.tokenDetails.totalSupply,
              holders: tokenInfo.tokenDetails.totalHolders,
              decimals: tokenInfo.tokenDetails.decimals,
              priceUsd: tokenInfo.tokenDetails.priceUsd,
            },
            { session },
          )

          await session.commitTransaction()
          await session.endSession()

          logger.verbose('Updated Token Metrics', llo({ logId: tokenInfo?.tokenDb.id }))
        }
      } catch (error) {
        logger.error('Error updating token metrics', llo({ tokenAddress, network, error }))
      }
    })
  },

  async pollWithRetry(
    tokenAddress: string,
    network: NetworksEnum,
    session: SaveOptions,
    options: PollingOptions = { intervalMs: 15000, timeoutMs: 300000 }, // interval 15 minute, timeout 5 minutes for safety
  ): Promise<{ tokenDb: any; tokenDetails: any } | undefined> {
    const { intervalMs, timeoutMs } = options
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      const tokenDb = await Models.Token.findOne({ address: tokenAddress, network }, null, { session })
      if (tokenDb) {
        const tokenDetails = await TokenDetailProvider.fetchBasicTokenInfo(tokenDb)
        if (TokenDetailFetcherWithRetry.hasValidInfo(tokenDetails)) {
          return {
            tokenDb,
            tokenDetails,
          }
        }
      }

      await Utils.wait(intervalMs)
    }

    throw new Error(`Token metrics polling timed out after ${timeoutMs}ms`)
  },

  hasValidInfo(tokenDetails: any): boolean {
    return !!(tokenDetails.name && tokenDetails.symbol && tokenDetails.totalSupply && tokenDetails.totalHolders)
  },
}

export default TokenDetailFetcherWithRetry
