import { type ITokenMetrics, type NetworksEnum } from '@types'
import CovalentHelper from '@helpers/covalent'
import { Models } from '@dbModels'
import DbOperations from '@models/utils/dbOperations'
import logger from '@logger'
import type Token from '@models/schema/token'
import Utils from '@helpers/utils'

const logMeta = logger.logMeta.bind(null, { service: 'tokenInfo' })

interface PollingOptions {
  intervalMs: number
  timeoutMs: number
}

export const TokenMetrics = {
  async update(tokenAddress: string, network: NetworksEnum): Promise<void> {
    try {
      const token = await Models.Token.findByTokenAddressAndNetwork(tokenAddress, network)

      if (!token) {
        logger.error('Token not found', { tokenAddress, network, ...logMeta() })
        return
      }

      if (TokenMetrics.hasValidMetrics(token)) {
        logger.warn('Token already has valid metrics', { tokenId: token.id, ...logMeta() })
        return
      }

      const tokenMetrics = await TokenMetrics.pollWithRetry(token, network)

      if (tokenMetrics) {
        await DbOperations.updateDocument(
          token,
          {
            totalSupply: tokenMetrics.totalSupply,
            holders: tokenMetrics.totalHolders,
          },
          { logId: token.id },
          'Token Metrics Updated',
          logMeta,
        )
      }
    } catch (error) {
      logger.error('Failed to update token metrics', { error, tokenAddress, network, ...logMeta() })
    }
  },

  async pollWithRetry(
    tokenAddress: string,
    network: NetworksEnum,
    options: PollingOptions = { intervalMs: 15000, timeoutMs: 600000 },
  ): Promise<ITokenMetrics | undefined> {
    const { intervalMs, timeoutMs } = options
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      try {
        const metrics = await CovalentHelper.getTokenSupplyAndHolders(tokenAddress, network)

        if (TokenMetrics.isValidMetrics(metrics)) {
          return metrics
        }
      } catch (error) {
        logger.error('Failed to fetch token metrics', { error, ...logMeta() })
        throw error
      }

      await Utils.wait(intervalMs)
    }

    throw new Error(`Token metrics polling timed out after ${timeoutMs}ms`)
  },

  hasValidMetrics(token: Token): boolean {
    return parseFloat(token.totalSupply) > 0 && token.holders > 0
  },

  isValidMetrics(metrics: ITokenMetrics): boolean {
    return metrics.totalHolders > 0 && parseFloat(metrics.totalSupply) > 0
  },
}

export default TokenMetrics
