import BlockScoutHelper from '@helpers/blockScout'
import TokenUtils from '@helpers/tokenUtils'
import utils from '@helpers/utils'
import logger from '@logger'
import { ProxyToken } from '@modules/proxyToken'
import { type NetworksEnum } from '@types'
import { ethers } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'provider:BlockScoutProvider' })

const BlockScoutProvider: Pick<any, 'getTokenBalances'> = {
  getTokenBalances: async ({ address, network }: { address: string; network: NetworksEnum }) => {
    try {
      const tokenBalances = await BlockScoutHelper.getTokenBalances(address, network)

      const parsedBalances = await Promise.all(
        tokenBalances.map(async (tokenBalance: any) => {
          if (tokenBalance.tokenBalance === utils.emptyData) return null

          const token = await ProxyToken.saveAndGetToken(tokenBalance.contractAddress, network)
          if (!token) return null

          if (TokenUtils.analyzeIfScamToken(token?.name || '', token?.symbol || '')) {
            return null
          }

          return {
            contractAddress: ethers.getAddress(tokenBalance.contractAddress),
            tokenBalance: ethers.formatUnits(tokenBalance.tokenBalance, token.decimals),
            originalBalance: tokenBalance.tokenBalance,
          }
        }),
      )

      return parsedBalances.filter(Boolean)
    } catch (error) {
      logger.error('Error in getTokenBalances', llo({ error, address, network }))
      return []
    }
  },
}

export default BlockScoutProvider
