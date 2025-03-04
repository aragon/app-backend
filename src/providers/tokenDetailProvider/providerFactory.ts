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

  static async fetchContractCreation(tokenAddress: string, network: NetworksEnum) {
    switch (network) {
      case NetworksEnum.peaqMainnet:
        return PeaqNetworkTokenProvider.fetchContractCreation(tokenAddress, network)
      default:
        return DefaultNetworkTokenProvider.fetchContractCreation(tokenAddress, network)
    }
  }

  static async fetchContractSourceCode(contractAddress: string, network: NetworksEnum) {
    switch (network) {
      case NetworksEnum.peaqMainnet:
        return PeaqNetworkTokenProvider.fetchContractSourceCode(contractAddress, network)
      default:
        return DefaultNetworkTokenProvider.fetchContractSourceCode(contractAddress, network)
    }
  }
}

export default TokenDetailProvider
