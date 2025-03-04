import SubscanApi from '@helpers/subscanApi'
import { type ITokenDetailsProvider, type ITokenProviderInfoArg, type NetworksEnum } from '@types'
import utils from '@helpers/utils'

export const PeaqNetworkTokenProvider: ITokenDetailsProvider = {
  async fetchTokenDetails(_tokenTypeInfo: ITokenProviderInfoArg, tokenAddress: string, network: NetworksEnum) {
    const tokenInfo =
      tokenAddress === utils.zeroAddress
        ? await SubscanApi.getNativeTokenInfo(network)
        : await SubscanApi.getTokenFullDetails(tokenAddress, network)

    return {
      tokenDetails: tokenInfo,
      tokenMetrics: {
        totalHolders: tokenInfo.totalHolders,
        totalSupply: tokenInfo.totalSupply,
      },
    }
  },

  async fetchContractCreation(tokenAddress: string, network: NetworksEnum) {
    const contractInfo = await SubscanApi.fetchContractCreation(tokenAddress, network)
    if (contractInfo) {
      return contractInfo
    }

    return { blockNumber: 0, transactionHash: null, address: tokenAddress }
  },

  async fetchContractSourceCode(contractAddress: string, network: NetworksEnum) {
    return SubscanApi.getContractSourceCode(contractAddress, network)
  },
}
