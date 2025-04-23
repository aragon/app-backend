// import { NetworksEnum, IWeb3ProxyMethod, type IWeb3Provider } from '@types'
// import Web3Provider from '@modules/proxyProvider/web3Provider'
// import PeaqProvider from '@modules/proxyProvider/peaqProvider'
//
// export class ProxyWeb3Provider {
//   private static getProvider(network: NetworksEnum) {
//     switch (network) {
//       case NetworksEnum.peaqMainnet:
//         return PeaqProvider
//       default:
//         return Web3Provider
//     }
//   }
//
//   private static getDefaultProvider() {
//     return Web3Provider
//   }
//
//   private static forward<K extends keyof IWeb3Provider>(method: K) {
//     return async ({ network, ...args }: { network: NetworksEnum; [key: string]: any }) => {
//       const provider = this.getProvider(network)
//       const fallback = this.getDefaultProvider()
//       const fn = provider?.[method as any] ?? fallback?.[method]
//
//       if (typeof fn !== 'function') {
//         throw new Error(`Method "${method}" not implemented for provider or fallback`)
//       }
//
//       return fn({ ...args, network } as any)
//     }
//   }
//
//   static async getNativeBalance({ address, network }) {
//     return this.forward(IWeb3ProxyMethod.getNativeBalance)({ address, network })
//   }
//
//   static async getTokenBalances({ address, network }) {
//     return this.forward(IWeb3ProxyMethod.getTokenBalances)({ address, network })
//   }
//
//   static async fetchTokenDetails({ address, type, isGovernance, network }) {
//     return this.forward(IWeb3ProxyMethod.fetchTokenDetails)({ address, type, isGovernance, network })
//   }
//
//   static async fetchContractCreation({ address, network }) {
//     return this.forward(IWeb3ProxyMethod.fetchContractCreation)({ address, network })
//   }
//
//   static async fetchContractSourceCode({ address, network }) {
//     return this.forward(IWeb3ProxyMethod.fetchContractSourceCode)({ address, network })
//   }
//
//   static async fetchBasicTokenInfo({ address, isGovernance, network }) {
//     return this.forward(IWeb3ProxyMethod.fetchBasicTokenInfo)({ address, isGovernance, network })
//   }
// }
