import { type IWeb3Provider, type IWeb3TokenBalance } from '@types'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'
import utils from '@helpers/utils'
import { ProxyToken } from '@modules/proxyToken'
import Web3Utils from '@helpers/web3Utils'
import EtherscanHelper from '@helpers/etherscan'

const KatanaProvider: Pick<IWeb3Provider, 'getTokenBalances'> = {
  getTokenBalances: async ({ address, network }) => {
    const tokensBalance = await evmExplorerClient.getTokenBalances(EvmExplorerEnum.ETHERSCAN, address, network)

    return (
      await Promise.all(
        tokensBalance.map(async (tokenBalance: IWeb3TokenBalance) => {
          if (tokenBalance.contractAddress === EtherscanHelper.nativeTokens[network]) {
            tokenBalance.contractAddress = utils.zeroAddress
          }
          const token = await ProxyToken.saveAndGetToken(tokenBalance.contractAddress, network)
          if (!token) return null

          return {
            contractAddress: Web3Utils.parseAddress(tokenBalance.contractAddress) || tokenBalance.contractAddress,
            tokenBalance: tokenBalance.tokenBalance,
            originalBalance: tokenBalance.originalBalance,
            priceUsd: tokenBalance.priceUsd,
          }
        }),
      )
    ).filter(Boolean) as IWeb3TokenBalance[]
  },
}

export default KatanaProvider
