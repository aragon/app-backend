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
}
