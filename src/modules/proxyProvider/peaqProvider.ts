import SubscanApi from '@helpers/subscanApi'
import { ITokenType, type IWeb3Provider } from '@types'
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
}

export default PeaqProvider
