import { type IWeb3Provider } from '@types'
import BlockScoutProvider from '@modules/proxyProvider/blockscoutProvider'
import RouteScanHelper from '@helpers/routeScanHelper'

const CornProvider: Pick<
  IWeb3Provider,
  'fetchAddressTxns' | 'getTokenBalances' | 'fetchBasicTokenInfo' | 'fetchContractSourceCode' | 'fetchContractCreation'
> = {
  getTokenBalances: async ({ address, network }) => {
    return BlockScoutProvider.getTokenBalances({ address, network })
  },

  fetchAddressTxns: async ({ address, network }) => {
    return BlockScoutProvider.fetchAddressTxns({ address, network })
  },

  fetchBasicTokenInfo: async ({ address, network }) => {
    return BlockScoutProvider.fetchBasicTokenInfo({ address, network })
  },

  fetchContractSourceCode: async ({ address, network }) => {
    return RouteScanHelper.fetchContractSourceCode({ address, network })
  },

  fetchContractCreation: async ({ address, network }) => {
    return RouteScanHelper.fetchContractCreation({ address, network })
  },
}

export default CornProvider
