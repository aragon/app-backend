import { type ITokenType, NetworksEnum } from '@types'
import { PeaqNetworkTokenProvider } from './peaqNetworkProvider'
import { DefaultNetworkTokenProvider } from '@modules/tokenDetail/defaultNetworkProvider'
class TokenDetailProvider {
  static async fetchTokenDetails(
    network: NetworksEnum,
    tokenAddress: string,
    tokenTypeInfo: { type: ITokenType; isGovernance: boolean },
  ) {
    switch (network) {
      case NetworksEnum.peaqMainnet:
        return PeaqNetworkTokenProvider.fetchTokenDetails(tokenTypeInfo, tokenAddress, network)
      default:
        return DefaultNetworkTokenProvider.fetchTokenDetails(tokenTypeInfo, tokenAddress, network)
    }
  }
}

export default TokenDetailProvider
