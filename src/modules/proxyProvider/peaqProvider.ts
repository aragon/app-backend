import SubscanApi from '@helpers/subscanApi'
import { type ISubScanTokenInfo, type ITokenMetrics, ITokenType, type IWeb3Provider } from '@types'
import utils from '@helpers/utils'
import { ethers } from 'ethers'
import dayjs from 'dayjs'

const PeaqProvider: Omit<IWeb3Provider, 'getNativeBalance'> = {
  getTokenBalances: async ({ address, network }) => {
    const tokens = await SubscanApi.getAccountBalance(address, network)
    return tokens.map((token: any) => ({
      tokenBalance: ethers.formatUnits(token.tokenBalance, token.decimals),
      contractAddress: ethers.getAddress(token.contractAddress),
    }))
  },

  async fetchContractCreation({ address, network }) {
    const contractInfo = await SubscanApi.fetchContractCreation(address, network)
    if (contractInfo) {
      return contractInfo
    }

    return { blockNumber: 0, transactionHash: null, address }
  },

  async fetchContractSourceCode({ address, network }) {
    return SubscanApi.getContractSourceCode(address, network)
  },

  async fetchBasicTokenInfo({ address, network }): Promise<Partial<ISubScanTokenInfo>> {
    return address === utils.zeroAddress
      ? await SubscanApi.getNativeTokenInfo(network)
      : await SubscanApi.getTokenFullDetails(address, network)
  },

  async fetchTokenHolderAndSupply({ address, network }): Promise<ITokenMetrics> {
    const tokenInfo = await SubscanApi.getTokenFullDetails(address, network)
    return {
      totalHolders: tokenInfo.totalHolders,
      totalSupply: tokenInfo.totalSupply,
    }
  },

  fetchTokenPrice: async ({ address, network, pastDays }: any): Promise<any> => {
    if (address === utils.zeroAddress) {
      const price = await SubscanApi.getCurrentPrice(network, pastDays || 30)
      return {
        priceUsd: price || '0',
      }
    }

    const tokenInfo = await SubscanApi.getTokenFullDetails(address, network)
    return {
      priceUsd: tokenInfo.priceUsd || '0',
    }
  },

  searchDetailsOfContract: async ({ address, network }) => {
    const sourceCode = await SubscanApi.getContractSourceCode(address, network)
    if (Array.isArray(sourceCode) && sourceCode.length === 1) {
      return {
        name: sourceCode[0]?.ContractName || null,
      }
    }
    const fallbackDetails = await SubscanApi.getTokenFullDetails(address, network)
    if (fallbackDetails) {
      return {
        name: fallbackDetails.name || '',
        type: 'token',
      }
    }

    return {
      name: null,
      type: ITokenType.unknown,
    }
  },

  fetchHistoricalTokenPrice: async ({ address, network, date }: any) => {
    if (address === utils.zeroAddress) {
      const pastDays = date ? Math.round(dayjs.utc().diff(dayjs.utc(date), 'days')) : 30
      const price = await SubscanApi.getCurrentPrice(network, pastDays)
      return price || '0'
    }

    const tokenInfo = await SubscanApi.getTokenFullDetails(address, network)
    return tokenInfo.priceUsd || '0'
  },

  getTokenCounters: async ({ address, network }) => {
    return await SubscanApi.getTokenCounters(address, network)
  },
}

export default PeaqProvider
