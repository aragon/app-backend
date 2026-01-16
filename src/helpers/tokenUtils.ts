import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Token from '@models/schema/token'
import { type HexAddress, ITokenType, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helpers:tokenUtils' })

interface ITokenBasicInfo {
  name?: string
  symbol?: string
  type?: ITokenType
}

const TokenUtils = {
  firstValid: <T>(...values: (T | null | undefined | '0' | 0)[]): T | null => {
    for (const v of values) {
      if (v !== null && v !== undefined && v !== '0' && v !== 0) {
        return v
      }
    }
    return null
  },

  shouldSkipFetch: (token: Partial<Token>, tokenRate: { priceUsd: string }): boolean =>
    (!token.symbol ||
      token.isGovernance ||
      token.type === ITokenType.unknown ||
      CoinGeckoHelper.isTestNetwork(token.network!)) &&
    tokenRate.priceUsd === '0',

  getSpamScore: (name: string, symbol: string, logo?: string | null): number => {
    const formattedName = (name || '').toLowerCase()
    const formattedSymbol = (symbol || '').toLowerCase()
    const combined = `${formattedName} ${formattedSymbol}`

    let score = 0

    if (!logo) {
      score += 1
    }

    const highRiskKeywords = [
      'airdrop',
      'giveaway',
      'casino',
      'mystery',
      'voucher',
      'visit',
      'ads',
      'promotion',
      'prize',
      'lucky',
      'bonus',
      'free',
    ]

    const lowRiskKeywords = ['claim', 'reward', 'rewards', 'join', 'gift', 'win', 'box', 'official', 'link']

    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const highRiskPattern = highRiskKeywords.map(escapeRegExp).join('|')
    const highRiskRegex = new RegExp(`\\b(${highRiskPattern})\\b`, 'i')

    const lowRiskPattern = lowRiskKeywords.map(escapeRegExp).join('|')
    const lowRiskRegex = new RegExp(`\\b(${lowRiskPattern})\\b`, 'i')

    const urlRegex = /(?:https?:\/\/|www\.)[^\s]+/i
    if (urlRegex.test(combined)) {
      score += 3
    }

    if (highRiskRegex.test(combined)) {
      score += 2
    }

    if (lowRiskRegex.test(combined)) {
      score += 1
    }

    const redFlags = [
      /[▷►▶→]/,
      /\$[A-Z]+\s+.*\./,
      /use.*official.*link/i,
      /trust.*wallet.*mystery/i,
      /ads:\s*/i,
      /!\s*ads/i,
    ]

    for (const pattern of redFlags) {
      if (pattern.test(combined)) {
        score += 2
      }
    }

    return score
  },

  analyzeIfSpamToken: (name: string, symbol: string, logo?: string | null) => {
    return TokenUtils.getSpamScore(name, symbol, logo) >= 3
  },

  shouldMarkAsSpam: (params: {
    name: string
    symbol: string
    logo: string | null
    tokenType: ITokenType
    isGovernance: boolean
    isTestnet: boolean
    coinGeckoInfo: { priceUsd?: string; name?: string; symbol?: string } | null
  }): { spamScore: number; isSpam: boolean } => {
    const { name, symbol, logo, tokenType, isGovernance, isTestnet, coinGeckoInfo } = params

    const spamScore = TokenUtils.getSpamScore(name, symbol, logo)

    if (isTestnet) {
      return { spamScore, isSpam: false }
    }

    if (tokenType === ITokenType.escrowAdapter || isGovernance || tokenType === ITokenType.native) {
      return { spamScore, isSpam: false }
    }

    if (spamScore >= 5) {
      return { spamScore, isSpam: true }
    }

    if (spamScore === 0) {
      return { spamScore, isSpam: false }
    }

    const hasCoinGeckoData =
      coinGeckoInfo &&
      ((coinGeckoInfo.priceUsd && parseFloat(coinGeckoInfo.priceUsd) > 0) ||
        (coinGeckoInfo.name && coinGeckoInfo.name.length > 0))

    if (hasCoinGeckoData) {
      return { spamScore, isSpam: false }
    }

    return { spamScore, isSpam: spamScore >= 2 }
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
