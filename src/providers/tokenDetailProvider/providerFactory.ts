import { type ITokenProviderInfoArg, NetworksEnum } from '@types'
import { PeaqNetworkTokenProvider } from '@providers/tokenDetailProvider/peaqNetworkProvider'
import { DefaultNetworkTokenProvider } from '@providers/tokenDetailProvider/defaultNetworkProvider'
class TokenDetailProvider {
  static async fetchTokenDetails(network: NetworksEnum, tokenAddress: string, tokenTypeInfo: ITokenProviderInfoArg) {
    switch (network) {
      case NetworksEnum.peaqMainnet:
        return PeaqNetworkTokenProvider.fetchTokenDetails(tokenTypeInfo, tokenAddress, network)
      default:
        return DefaultNetworkTokenProvider.fetchTokenDetails(tokenTypeInfo, tokenAddress, network)
    }
  }
}

export default TokenDetailProvider
