import { type HexAddress, type IAccountBalancesProvider, type NetworksEnum } from '@types'
import SubscanApi from '@helpers/subscanApi'
import { ethers } from 'ethers'

export const SubscanProvider: IAccountBalancesProvider = {
  getAccountBalances: async (address: HexAddress, network: NetworksEnum) => {
    const tokens = await SubscanApi.getAccountBalance(address, network)
    return tokens.map((token: any) => ({
      tokenBalance: ethers.formatUnits(token.tokenBalance, token.decimals),
      contractAddress: ethers.getAddress(token.contractAddress),
    }))
  },
}
