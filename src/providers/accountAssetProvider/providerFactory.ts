import { type IProviderAsset, NetworksEnum } from '@types'

import { SubscanProvider } from '@providers/accountAssetProvider/subscanProvider'

import { AlchemyProvider } from '@providers/accountAssetProvider/alchemyProvider'

class AccountAssetProvider {
  public static async getAccountBalances(address: string, network: NetworksEnum): Promise<IProviderAsset[]> {
    switch (network) {
      case NetworksEnum.peaqMainnet:
        return SubscanProvider.getAccountBalances(address, network)
      default:
        return AlchemyProvider.getAccountBalances(address, network)
    }
  }
}

export default AccountAssetProvider
