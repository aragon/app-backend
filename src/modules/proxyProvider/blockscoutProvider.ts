import logger from '@logger'
import { NetworksEnum, ITokenType } from '@types'
import utils from '@helpers/utils'
import { ethers } from 'ethers'
import { ProxyToken } from '@modules/proxyToken'
import TokenUtils from '@helpers/tokenUtils'
import BlockScoutHelper from '@helpers/blockScout'

const llo = logger.logMeta.bind(null, { service: 'provider:BlockScoutProvider' })

const BlockScoutProvider: Pick<any, 'getTokenBalances' | 'fetchBasicTokenInfo'> = {
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

  fetchBasicTokenInfo: async ({ address, network }: { address: string; network: NetworksEnum }) => {
    const tokenInfo = {
      address,
      name: null,
      symbol: null,
      decimals: 0,
      type: ITokenType.unknown,
      logo: null,
      priceUsd: '0',
      totalSupply: '0',
      totalHolders: '0',
    } as any

    if (address === utils.zeroAddress) {
      const nativeTokenMap: Record<string, { name: string; symbol: string }> = {
        [NetworksEnum.cornMainnet]: { name: 'Corn', symbol: 'CORN' },
      }

      const nativeToken = nativeTokenMap[network] || { name: 'Native Token', symbol: 'NATIVE' }
      tokenInfo.name = nativeToken.name
      tokenInfo.symbol = nativeToken.symbol
      tokenInfo.decimals = 18
      tokenInfo.type = ITokenType.native

      return tokenInfo
    }

    try {
      const tokenDetails = await BlockScoutHelper.getTokenFullDetails(address, network)

      if (tokenDetails) {
        tokenInfo.name = tokenDetails.name || null
        tokenInfo.symbol = tokenDetails.symbol || null
        tokenInfo.decimals = tokenDetails.decimals || 0
        tokenInfo.type = tokenDetails.type || ITokenType.unknown
        tokenInfo.logo = tokenDetails.logo || null
        tokenInfo.priceUsd = tokenDetails.priceUsd || '0'
        tokenInfo.totalSupply = tokenDetails.totalSupply || '0'
        tokenInfo.totalHolders = tokenDetails.totalHolders?.toString() || '0'
      }
    } catch (error) {
      logger.warn('BlockScout Provider basic token info failed', llo({ error, address, network }))
    }

    return tokenInfo
  },
}

export default BlockScoutProvider
