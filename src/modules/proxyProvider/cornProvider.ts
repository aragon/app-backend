import { type IWeb3Provider } from '@types'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'

const CornProvider: Pick<IWeb3Provider, 'getTokenBalances' | 'fetchContractSourceCode' | 'fetchContractCreation'> = {
  getTokenBalances: async ({ address, network }) => {
    return evmExplorerClient.getTokenBalances(EvmExplorerEnum.ROUTESCAN, address, network)
  },

  fetchContractSourceCode: async ({ address, network }) => {
    return evmExplorerClient.fetchContractSourceCode(EvmExplorerEnum.ROUTESCAN, address, network)
  },

  fetchContractCreation: async ({ address, network }) => {
    return evmExplorerClient.fetchContractCreation(EvmExplorerEnum.ROUTESCAN, address, network)
  },
}

export default CornProvider
