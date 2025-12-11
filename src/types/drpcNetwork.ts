// DRPC Network identifiers
// Reference: https://drpc.org/public-endpoints
export enum DrpcNetwork {
  ETH_MAINNET = 'ethereum', // https://eth.drpc.org
  ETH_SEPOLIA = 'sepolia', // https://sepolia.drpc.org
  POLYGON_MAINNET = 'polygon', // https://polygon.drpc.org
  BASE_MAINNET = 'base', // https://base.drpc.org
  ARB_MAINNET = 'arbitrum', // https://arbitrum.drpc.org
  ZKSYNC_MAINNET = 'zksync', // https://zksync.drpc.org
  ZKSYNC_SEPOLIA = 'zksync-sepolia', // https://zksync-sepolia.drpc.org
  OPT_MAINNET = 'optimism', // https://optimism.drpc.org
  AVAX_MAINNET = 'avalanche', // https://avalanche.drpc.org
  KATANA_MAINNET = 'katana', // https://katana.drpc.org
}

// DRPC load balanced URL format
// https://lb.drpc.org/ogrpc?network={network}&dkey={api_key}
// https://drpc.org/dashboard
export const drpcNetworkToUrl = (network: DrpcNetwork, apiKey: string): string => {
  return `https://lb.drpc.org/ogrpc?network=${network}&dkey=${apiKey}`
}
