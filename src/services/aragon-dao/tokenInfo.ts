import { type ITokenMetrics, type NetworksEnum } from '@types'
import CovalentHelper from '@helpers/covalent'
import { Models } from '@dbModels'
import logger from '@logger'
import Utils from '@helpers/utils'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'tokenInfo' })

interface PollingOptions {
  intervalMs: number
  timeoutMs: number
}

export const TokenMetrics = {
  async update(tokenAddress: string, network: NetworksEnum): Promise<void> {
    try {
      await DbTx.executeTxFn(async ({ session }) => {
        const token = await Models.Token.findByTokenAddressAndNetwork(tokenAddress, network, { session })

        if (!token) {
          logger.warn('Token not found', llo({ tokenAddress, network }))
          return
        }

        let tokenMetrics: any = null
        try {
          tokenMetrics = await TokenMetrics.pollWithRetry(tokenAddress, network)
        } catch (_) {
          // skip
        }

        if (tokenMetrics) {
          await token.update(
            {
              totalSupply: tokenMetrics.totalSupply,
              holders: tokenMetrics.totalHolders,
            },
            { session },
          )

          await session.commitTransaction()
          await session.endSession()

          logger.verbose('Updated Token Metrics', llo({ logId: token.id }))
        }
      })
    } catch (error) {
      logger.error('Failed to update token metrics', llo({ error, tokenAddress, network }))
    }
  },

  async pollWithRetry(
    tokenAddress: string,
    network: NetworksEnum,
    options: PollingOptions = { intervalMs: 60000, timeoutMs: 600000 }, // interval 1 minute, timeout 10 minutes for safety
  ): Promise<ITokenMetrics | undefined> {
    const { intervalMs, timeoutMs } = options
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      const metrics = await CovalentHelper.getTokenSupplyAndHolders(tokenAddress, network)

      if (TokenMetrics.isValidMetrics(metrics)) {
        return metrics
      }

      await Utils.wait(intervalMs)
    }

    throw new Error(`Token metrics polling timed out after ${timeoutMs}ms`)
  },

  isValidMetrics(metrics: ITokenMetrics): boolean {
    return metrics.totalHolders > 0 && parseFloat(metrics.totalSupply) > 0
  },
}

export default TokenMetrics
