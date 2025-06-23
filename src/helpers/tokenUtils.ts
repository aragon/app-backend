import { type HexAddress, ITokenType, NetworksEnum, ITransactionCategory } from '@types'
import Web3Helper from '@helpers/web3'
import { Models } from '@dbModels'
import logger from '@logger'
import type Token from '@models/schema/token'
import CovalentHelper from '@helpers/covalent'
import ProxyProvider from '@modules/proxyProvider'

const llo = logger.logMeta.bind(null, { service: 'helpers:tokenUtils' })

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
      CovalentHelper.skipTestNetworks.includes(token.network!)) &&
    tokenRate.priceUsd === '0',

  analyzeIfScamToken: (name: string, symbol: string) => {
    const formattedName = (name || '').toLowerCase()
    const formattedSymbol = (symbol || '').toLowerCase()

    const suspiciousKeywords = [
      'claim',
      'reward',
      'rewards',
      'join',
      'stake',
      'swap',
      'voucher',
      'airdrop',
      'bonus',
      'free',
      'giveaway',
      'visit',
      'casino',
      'mystery',
      'box',
      'earn',
      'official',
      'link',
      'ads',
      'promotion',
      'prize',
      'win',
      'lucky',
      'gift',
      'drop',
      'farming',
      'mining',
    ]

    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const keywordPattern = suspiciousKeywords.map(escapeRegExp).join('|')
    const keywordRegex = new RegExp(`\\b(${keywordPattern})\\b`, 'i')

    const urlRegex = /(?:https?:\/\/|www\.)[^\s]+|[a-z0-9-]+\.[a-z]{2,63}(?:\/[^\s]*)?/i

    const redFlags = [
      /[▷►▶→]/,
      /[^\x00-\x7F]/,
      /\$[A-Z]+\s+.*\./,
      /use.*official.*link/i,
      /trust.*wallet.*mystery/i,
      /ads:\s*/i,
      /!\s*ads/i,
    ]

    const hasUrl = urlRegex.test(formattedName) || urlRegex.test(formattedSymbol)
    const hasKeywords = keywordRegex.test(formattedName) || keywordRegex.test(formattedSymbol)
    const hasRedFlags = redFlags.some(pattern => pattern.test(formattedName) || pattern.test(formattedSymbol))

    return hasUrl || hasKeywords || hasRedFlags
  },

  isTokenSyncable: async (tokenAddress: HexAddress, network: NetworksEnum): Promise<boolean> => {
    try {
      const dbToken = await Models.Token.findOne({ address: tokenAddress, network })
      if (dbToken) return true
      const tokenInfo = await ProxyProvider.fetchBasicTokenInfo({
        address: tokenAddress,
        network,
      })
      if (tokenInfo && tokenInfo.type !== ITokenType.unknown) {
        return !TokenUtils.analyzeIfScamToken(tokenInfo.name! || '', tokenInfo.symbol! || '')
      }
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
  getCategories: (network: NetworksEnum) => {
    const category = [
      ITransactionCategory.ERC20,
      ITransactionCategory.ERC721,
      ITransactionCategory.ERC1155,
      ITransactionCategory.Internal,
      ITransactionCategory.External,
    ]

    switch (network) {
      case NetworksEnum.baseMainnet:
      case NetworksEnum.zksyncSepolia:
      case NetworksEnum.arbitrumMainnet:
      case NetworksEnum.zksyncMainnet:
      case NetworksEnum.optimismMainnet:
        return category.filter(cat => cat !== ITransactionCategory.Internal)
      default:
        return category
    }
  },

  supportsInternalTransactions: (network: NetworksEnum): boolean => {
    const categories = TokenUtils.getCategories(network)
    return categories.includes(ITransactionCategory.Internal)
  },
}

export default TokenUtils
