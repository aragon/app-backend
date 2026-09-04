import { NetworksEnum } from '@src/types/networks'

/**
 * Chain short names the Safe Transaction Service is addressed by, keyed by network.
 *
 * Coverage is deliberately narrower than `NetworksEnum`: this backend supports chains Safe does not
 * (Citrea, Chiliz). A network missing from this map has no Safe service at all, which is a
 * first-class "unsupported" answer - `501 unsupported-chain`, never a 5xx.
 *
 * Kept identical to the app's `safeTxServiceShortNames` so both sides agree on which chains exist.
 */
export const safeTxServiceShortNames: Partial<Record<NetworksEnum, string>> = {
  [NetworksEnum.ethereumMainnet]: 'eth',
  [NetworksEnum.ethereumSepolia]: 'sep',
  [NetworksEnum.polygonMainnet]: 'pol',
  [NetworksEnum.baseMainnet]: 'base',
  [NetworksEnum.arbitrumMainnet]: 'arb1',
  [NetworksEnum.optimismMainnet]: 'oeth',
  [NetworksEnum.avaxMainnet]: 'avax',
  [NetworksEnum.zksyncMainnet]: 'zksync',
  [NetworksEnum.katanaMainnet]: 'katana',
  [NetworksEnum.hemiMainnet]: 'hemi',
  [NetworksEnum.monadMainnet]: 'monad',
}

export const getSafeShortName = (network: NetworksEnum): string | undefined => safeTxServiceShortNames[network]
