import { type IWeb3Provider, type IWeb3TokenBalance, NetworksEnum } from '@types'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'
import utils from '@helpers/utils'
import { ProxyToken } from '@modules/proxyToken'
import Web3Utils from '@helpers/web3Utils'
import EtherscanHelper from '@helpers/etherscan'
import { Models } from '@dbModels'

const KatanaProvider: Pick<IWeb3Provider, 'getTokenBalances' | 'fetchBasicTokenInfo'> = {
  getTokenBalances: async ({ address, network }) => {
    const tokensBalance = await evmExplorerClient.getTokenBalances(EvmExplorerEnum.ETHERSCAN, address, network)

    return (
      await Promise.all(
        tokensBalance.map(async (tokenBalance: IWeb3TokenBalance) => {
          const contractAddress =
            tokenBalance.contractAddress === EtherscanHelper.nativeTokens[network]
              ? utils.zeroAddress
              : tokenBalance.contractAddress
          const token = await ProxyToken.saveAndGetToken(contractAddress, network)
          if (!token) return null

          return {
            contractAddress: Web3Utils.parseAddress(contractAddress) || contractAddress,
            tokenBalance: tokenBalance.tokenBalance,
            originalBalance: tokenBalance.originalBalance,
            priceUsd: tokenBalance.priceUsd,
          }
        }),
      )
    ).filter(Boolean) as IWeb3TokenBalance[]
  },

  fetchBasicTokenInfo: async ({ address, network }) => {
    if (address === utils.zeroAddress) {
      const token = await Models.Token.findOne({ address, network: NetworksEnum.ethereumMainnet })
      return {
        name: token?.name,
        symbol: token?.symbol,
        decimals: token?.decimals,
        priceUsd: token?.priceUsd,
      }
    } else {
      return await evmExplorerClient.fetchTokenInfo(EvmExplorerEnum.ETHERSCAN, address, network)
    }
  },
}

export default KatanaProvider
