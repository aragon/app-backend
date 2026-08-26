import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import TokenSpam from '@helpers/tokenSpam'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import type Token from '@models/schema/token'
import { type HexAddress, ITokenType, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helpers:tokenUtils' })

interface ITokenBasicInfo {
  name?: string
  symbol?: string
  type?: ITokenType
}

const TokenUtils = {
  nativeErc20Aliases: {
    [NetworksEnum.zksyncMainnet]: '0x000000000000000000000000000000000000800A',
  } as Partial<Record<NetworksEnum, HexAddress>>,

  isNativeTokenAlias: (tokenAddress: HexAddress, network: NetworksEnum): boolean => {
    const alias = TokenUtils.nativeErc20Aliases[network]
    return !!alias && (Web3Utils.parseAddress(tokenAddress) || tokenAddress) === alias
  },

  firstValid: <T>(...values: (T | null | undefined | '0' | 0)[]): T | null => {
    for (const v of values) {
      if (v !== null && v !== undefined && v !== '0' && v !== 0) {
        return v
      }
    }
    return null
  },

  shouldSkipFetch: (token: Partial<Token>, tokenRate: { priceUsd: string }): boolean => {
    return (
      (!token.symbol || token.type === ITokenType.unknown || CoinGeckoHelper.isTestNetwork(token.network!)) &&
      tokenRate.priceUsd === '0'
    )
  },

  getNextFetchRateDelay: (failCount: number): number => {
    const schedule = [
      24 * 60 * 60 * 1000,
      3 * 24 * 60 * 60 * 1000,
      7 * 24 * 60 * 60 * 1000,
      14 * 24 * 60 * 60 * 1000,
      30 * 24 * 60 * 60 * 1000,
    ]
    return schedule[Math.min(failCount, schedule.length - 1)]
  },

  analyzeIfSpamToken: (name: string, symbol: string, logo?: string | null) => {
    return TokenSpam.score(name, symbol, logo).spamScore >= TokenSpam.SYNCABLE_THRESHOLD
  },

  isTokenSyncable: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
    prefetchedTokenInfo?: ITokenBasicInfo,
  ): Promise<boolean> => {
    try {
      const dbToken = await Models.Token.findOne({ address: tokenAddress, network })
      if (dbToken) return !dbToken.isSpam

      if (prefetchedTokenInfo && prefetchedTokenInfo.type !== ITokenType.unknown) {
        return !TokenUtils.analyzeIfSpamToken(prefetchedTokenInfo.name || '', prefetchedTokenInfo.symbol || '')
      }

      const web3TokenDetails = await Web3Helper.getTokenNameAndSymbol(tokenAddress, network)
      if (web3TokenDetails.name && web3TokenDetails.symbol) {
        return !TokenUtils.analyzeIfSpamToken(web3TokenDetails.name, web3TokenDetails.symbol)
      }
      return false
    } catch (e) {
      logger.error('Error checking if token is syncable', llo({ tokenAddress, network, error: e }))
      return false
    }
  },
}

export default TokenUtils
