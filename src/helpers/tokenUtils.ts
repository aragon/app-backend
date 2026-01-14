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

  getScamScore: (name: string, symbol: string): number => {
    const formattedName = (name || '').toLowerCase()
    const formattedSymbol = (symbol || '').toLowerCase()
    const combined = `${formattedName} ${formattedSymbol}`

    let score = 0

    // High-risk keywords (scam-specific) - 2 points each
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

    // Low-risk keywords (can be legit) - 1 point each
    const lowRiskKeywords = ['claim', 'reward', 'rewards', 'join', 'gift', 'win', 'box', 'official', 'link']

    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const highRiskPattern = highRiskKeywords.map(escapeRegExp).join('|')
    const highRiskRegex = new RegExp(`\\b(${highRiskPattern})\\b`, 'i')

    const lowRiskPattern = lowRiskKeywords.map(escapeRegExp).join('|')
    const lowRiskRegex = new RegExp(`\\b(${lowRiskPattern})\\b`, 'i')

    // URL in name/symbol - 3 points (strong scam indicator)
    const urlRegex = /(?:https?:\/\/|www\.)[^\s]+/i
    if (urlRegex.test(combined)) {
      score += 3
    }

    // High-risk keywords - 2 points
    if (highRiskRegex.test(combined)) {
      score += 2
    }

    // Low-risk keywords - 1 point
    if (lowRiskRegex.test(combined)) {
      score += 1
    }

    // Red flags - 2 points each
    const redFlags = [
      /[▷►▶→]/, // promotional arrows
      /\$[A-Z]+\s+.*\./, // $TOKEN visit site pattern
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

  analyzeIfScamToken: (name: string, symbol: string) => {
    return TokenUtils.getScamScore(name, symbol) >= 3
  },

  determineIfScam: (
    name: string,
    symbol: string,
    coinGeckoInfo: { priceUsd?: string; name?: string; symbol?: string } | null,
  ): boolean => {
    const score = TokenUtils.getScamScore(name, symbol)

    // High score = definite scam, no fallback needed
    if (score >= 5) {
      return true
    }

    // No suspicious signals = not scam
    if (score === 0) {
      return false
    }

    // Borderline (score 1-4): check CoinGecko validation
    // If CoinGecko has valid data (price > 0 or recognized name/symbol), likely legit
    const hasCoinGeckoData =
      coinGeckoInfo &&
      ((coinGeckoInfo.priceUsd && parseFloat(coinGeckoInfo.priceUsd) > 0) ||
        (coinGeckoInfo.name && coinGeckoInfo.name.length > 0))

    if (hasCoinGeckoData) {
      return false // CoinGecko recognizes it, not scam
    }

    // No CoinGecko data + suspicious score = scam
    return score >= 2
  },

  shouldMarkAsScam: (params: {
    name: string
    symbol: string
    tokenType: ITokenType
    isGovernance: boolean
    isTestnet: boolean
    coinGeckoInfo: { priceUsd?: string; name?: string; symbol?: string } | null
  }): boolean => {
    const { name, symbol, tokenType, isGovernance, isTestnet, coinGeckoInfo } = params

    if (isTestnet) {
      return false
    }

    if (tokenType === ITokenType.escrowAdapter || isGovernance || tokenType === ITokenType.native) {
      return false
    }

    return TokenUtils.determineIfScam(name, symbol, coinGeckoInfo)
  },

  isTokenSyncable: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
    prefetchedTokenInfo?: ITokenBasicInfo,
  ): Promise<boolean> => {
    try {
      const dbToken = await Models.Token.findOne({ address: tokenAddress, network })
      if (dbToken) return true

      // Use prefetched tokenInfo if provided
      if (prefetchedTokenInfo && prefetchedTokenInfo.type !== ITokenType.unknown) {
        return !TokenUtils.analyzeIfScamToken(prefetchedTokenInfo.name || '', prefetchedTokenInfo.symbol || '')
      }

      // Fallback to on-chain data
      const web3TokenDetails = await Web3Helper.getTokenNameAndSymbol(tokenAddress, network)
      if (web3TokenDetails.name && web3TokenDetails.symbol) {
        return !TokenUtils.analyzeIfScamToken(web3TokenDetails.name, web3TokenDetails.symbol)
      }
      return false
    } catch (e) {
      logger.error('Error checking if token is syncable', llo({ tokenAddress, network, error: e }))
      return false
    }
  },
}

export default TokenUtils
