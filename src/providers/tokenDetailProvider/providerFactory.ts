import { type ITokenProviderInfo, type ITokenProviderInfoArg, NetworksEnum } from '@types'
import { PeaqNetworkTokenProvider } from '@providers/tokenDetailProvider/peaqNetworkProvider'
import { DefaultNetworkTokenProvider } from '@providers/tokenDetailProvider/defaultNetworkProvider'
import type Token from '@models/schema/token'

class TokenDetailProvider {
  static async fetchTokenDetails(
    network: NetworksEnum,
    tokenAddress: string,
    tokenTypeInfo: ITokenProviderInfoArg,
  ): Promise<ITokenProviderInfo> {
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

  static async fetchBasicTokenInfo(tokenDb: Token) {
    switch (tokenDb.network) {
      case NetworksEnum.peaqMainnet:
        return PeaqNetworkTokenProvider.fetchBasicTokenInfo(tokenDb)
      default:
        return DefaultNetworkTokenProvider.fetchBasicTokenInfo(tokenDb)
    }
  }
}

export default TokenDetailProvider
