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

  analyzeIfScamToken: (name: string, symbol: string): boolean => {
    const formattedName = name || ''
    const formattedSymbol = symbol || ''
    const regex =
      /^(?=.*(?:https?:\/\/\S+|www\.[a-z0-9-]+\.[a-z]{2,63}|[a-z0-9-]+\.[a-z]{2,63}))(?=.*(?:claim|rewards?|join|stake|swap|voucher|airdrop|bonus|free|giveaway|visit)).+$/i
    const firstCheck = regex.test(formattedName) || regex.test(formattedSymbol)
    const secondCheck = regex.test(formattedName + formattedSymbol)

    return firstCheck || secondCheck
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
      case NetworksEnum.ethereumSepolia:
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
}

export default TokenUtils
