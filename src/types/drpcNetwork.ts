// DRPC Network identifiers
// Reference: https://drpc.org/public-endpoints
export enum DrpcNetwork {
  ETH_MAINNET = 'ethereum', // https://eth.drpc.org
  ETH_SEPOLIA = 'sepolia', // https://sepolia.drpc.org
  ETH_HOODI = 'hoodi', // https://hoodi.drpc.org
  POLYGON_MAINNET = 'polygon', // https://polygon.drpc.org
  POLYGON_AMOY = 'polygon-amoy', // https://polygon-amoy.drpc.org
  BASE_MAINNET = 'base', // https://base.drpc.org
  BASE_SEPOLIA = 'base-sepolia', // https://base-sepolia.drpc.org
  ARB_MAINNET = 'arbitrum', // https://arbitrum.drpc.org
  ZKSYNC_MAINNET = 'zksync', // https://zksync.drpc.org
  OPT_MAINNET = 'optimism', // https://optimism.drpc.org
  AVAX_MAINNET = 'avalanche', // https://avalanche.drpc.org
  KATANA_MAINNET = 'katana', // https://katana.drpc.org
  HEMI_MAINNET = 'hemi', // https://hemi.drpc.org
  MONAD_MAINNET = 'monad', // https://monad-mainnet.drpc.org
  ROBINHOOD_MAINNET = 'robinhood', // https://robinhood.drpc.org
  BNB_MAINNET = 'bsc', // https://bsc.drpc.org
  BNB_TESTNET = 'bsc-testnet', // https://bsc-testnet.drpc.org
}

// DRPC load balanced URL format
// https://lb.drpc.live/{network}/{api_key}
// https://drpc.org/dashboard
export const drpcNetworkToUrl = (network: DrpcNetwork, apiKey: string): string => {
  return `https://lb.drpc.live/${network}/${apiKey}`
}
