import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import { IContractAddressType, type IWeb3Provider } from '@types'

const RoutescanProvider: Pick<
  IWeb3Provider,
  'fetchContractCreation' | 'fetchContractSourceCode' | 'searchDetailsOfContract'
> = {
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
        type: IContractAddressType.ADDRESS,
        name: null,
      }
    }

    return {
      type: IContractAddressType.ADDRESS,
      name: contractInfo[0].ContractName,
    }
  },
}

export default RoutescanProvider
