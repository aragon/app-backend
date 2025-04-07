import { NetworksEnum, IWeb3ProxyMethod, type IWeb3Provider } from '@types'
import Web3Provider from '@modules/proxyProvider/web3Provider'
import PeaqProvider from '@modules/proxyProvider/peaqProvider'

const ProxyWeb3Provider: IWeb3Provider & { forward: any; getProvider: any; getDefaultProvider: any } = {
  getProvider(network: NetworksEnum) {
    switch (network) {
      case NetworksEnum.peaqMainnet:
        return PeaqProvider
      default:
        return Web3Provider
    }
  },

  getDefaultProvider() {
    return Web3Provider
  },

  forward<K extends keyof IWeb3ProxyMethod>(method: K | any) {
    return async ({ network, ...args }: { network: NetworksEnum; [key: string]: any }) => {
      const provider = ProxyWeb3Provider.getProvider(network)
      const fallback = ProxyWeb3Provider.getDefaultProvider()
      const fn = provider?.[method] ?? fallback?.[method]

      if (typeof fn !== 'function') {
        throw new Error(`Method "${method}" not implemented for provider or fallback`)
      }

      return fn({ ...args, network } as any)
    }
  },

  getNativeBalance: async function (params) {
    return ProxyWeb3Provider.forward(IWeb3ProxyMethod.getNativeBalance)(params)
  },
  getTokenBalances: async function (params) {
    return ProxyWeb3Provider.forward(IWeb3ProxyMethod.getTokenBalances)(params)
  },
  fetchContractCreation: async function (params) {
    return ProxyWeb3Provider.forward(IWeb3ProxyMethod.fetchContractCreation)(params)
  },
  fetchContractSourceCode: async function (params) {
    return ProxyWeb3Provider.forward(IWeb3ProxyMethod.fetchContractSourceCode)(params)
  },
  fetchBasicTokenInfo: async function (params) {
    return ProxyWeb3Provider.forward(IWeb3ProxyMethod.fetchBasicTokenInfo)(params)
  },
}

export default ProxyWeb3Provider
