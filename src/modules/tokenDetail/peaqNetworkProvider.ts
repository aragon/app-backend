import SubscanApi from '@helpers/subscanApi'
import { type ITokenDetailsProvider, type ITokenType, type NetworksEnum } from '@types'
import utils from '@helpers/utils'

export const PeaqNetworkTokenProvider: ITokenDetailsProvider = {
  async fetchTokenDetails(
    _tokenTypeInfo: { type: ITokenType; isGovernance: boolean },
    tokenAddress: string,
    network: NetworksEnum,
  ) {
    const tokenInfo =
      tokenAddress === utils.zeroAddress
        ? await SubscanApi.getNativeTokenInfo(network)
        : await SubscanApi.getTokenFullDetails(tokenAddress, network)

    return {
      tokenRate: tokenInfo,
      tokenMetrics: {
        totalHolders: tokenInfo.totalHolders,
        totalSupply: tokenInfo.totalSupply,
      },
    }
  },
}
