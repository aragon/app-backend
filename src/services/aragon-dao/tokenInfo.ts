import { type ITokenMetrics, type NetworksEnum } from '@types'
import CovalentHelper from '@helpers/covalent'
import { Models } from '@dbModels'
import DbOperations from '@models/utils/dbOperations'
import logger from '@logger'
const llo = logger.logMeta.bind(null, { service: 'tokenInfo' })
export const TokenInfo = {
  fetchMetrics: async (tokenAddress: string, network: NetworksEnum) => {
    try {
      const tokenMetrics = await TokenInfo._retryAndFetch(tokenAddress, network)
      const token = await Models.Token.findByTokenAddressAndNetwork(tokenAddress, network)

      if (token) {
        await DbOperations.updateDocument(
          token,
          {
            totalSupply: tokenMetrics.totalSupply,
            holders: tokenMetrics.totalHolders,
          },
          { logId: token.id },
          'Token Metrics Updated',
          llo,
        )
      }
    } catch (_error) {}
  },

  _retryAndFetch: async (tokenAddress: string, network: NetworksEnum, interval = 15000, timeout = 120000) => {
    return new Promise<ITokenMetrics>((resolve, reject) => {
      let elapsedTime = 0

      const intervalId = setInterval(async () => {
        try {
          const tokenMetrics = await CovalentHelper.getTokenSupplyAndHolders(tokenAddress, network)

          const totalSupplyNum = parseFloat(tokenMetrics.totalSupply || '0')
          if (totalSupplyNum > 0 && (tokenMetrics.totalHolders || 0) > 0) {
            clearInterval(intervalId)
            return resolve(tokenMetrics)
          }
        } catch (error) {
          clearInterval(intervalId)
          return reject(error)
        }

        elapsedTime += interval
        if (elapsedTime >= timeout) {
          clearInterval(intervalId)
          return reject(new Error('Polling timed out'))
        }
      }, interval)
    })
  },
}
