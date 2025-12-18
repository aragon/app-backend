import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import ProxyUtils from '@modules/proxyProvider/utils'
import { IBlockScoutAddressType } from '@src/types/blockScout'
import { type IWeb3Provider } from '@types'

const RoutescanProvider: Pick<
  IWeb3Provider,
  'getTokenBalances' | 'fetchContractCreation' | 'fetchContractSourceCode' | 'searchDetailsOfContract'
> = {
  getTokenBalances: async ({ address, network }) => {
    const tokensBalance = await evmExplorerClient.getTokenBalances(EvmExplorerEnum.ROUTESCAN, address, network)
    return ProxyUtils.enrichTokenBalances(tokensBalance, network)
  },

  fetchContractCreation: async ({ address, network }) => {
    return evmExplorerClient.fetchContractCreation(EvmExplorerEnum.ROUTESCAN, address, network)
  },

  fetchContractSourceCode: async ({ address, network }) => {
    return evmExplorerClient.fetchContractSourceCode(EvmExplorerEnum.ROUTESCAN, address, network)
  },

  searchDetailsOfContract: async ({ address, network }) => {
    const contractInfo = await RoutescanProvider.fetchContractSourceCode({ address, network })

    if (!contractInfo || contractInfo.length === 0) {
      return {
        type: IBlockScoutAddressType.ADDRESS,
        name: null,
      }
    }

    return {
      type: IBlockScoutAddressType.ADDRESS,
      name: contractInfo[0].ContractName,
    }
  },
}

export default RoutescanProvider
