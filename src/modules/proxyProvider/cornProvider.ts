import { type IWeb3Provider } from '@types'
import BlockScoutProvider from '@modules/proxyProvider/blockscoutProvider'
import RouteScanHelper from '@helpers/routeScanHelper'

const CornProvider: Pick<
  IWeb3Provider,
  | 'getTokenCounters'
  | 'fetchAddressTxns'
  | 'getTokenBalances'
  | 'fetchBasicTokenInfo'
  | 'fetchContractSourceCode'
  | 'fetchContractCreation'
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

  getTokenCounters: async ({ address, network }) => {
    return {
      holders: await RouteScanHelper.fetchTokenHoldersCount({ address, network }),
      transfers: 0,
    }
  },
}

export default CornProvider
