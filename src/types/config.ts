import { type NetworksEnum, type SupportedEnsNetworksEnum } from './networks'

export enum IEnumEnvironment {
  production = 'production',
  staging = 'staging',
  development = 'development',
  local = 'local',
}

export enum IEnumNodeEnv {
  development = 'development',
  production = 'production',
}

export interface IConfig {
  APP_NAME: string
  ENVIRONMENT: IEnumEnvironment
  NODE_ENV: IEnumNodeEnv
  TIMEZONE: string
  REMOTE_EXECUTION: boolean
  PROXY: string | null
  ENS_DOMAIN: string
  ARAGON_SUPPORTED_BLOCK: {
    ETHEREUM_MAINNET: number
    ETHEREUM_SEPOLIA: number
    POLYGON_MAINNET: number
    BASE_MAINNET: number
    ARBITRUM_MAINNET: number
    ZKSYNC_SEPOLIA: number
  }
  SUPPORTED_ENS_NETWORKS: SupportedEnsNetworksEnum[]
  SUPPORTED_NETWORKS: NetworksEnum[]
  DEFAULT_CURRENCY: string
  NODE_CONFIG: {
    MAX_RECONNECT_ATTEMPTS: number
    RECONNECT_INTERVAL: number
  }
  BOTTLENECK: {
    NODE_MAX_CONCURRENT: number
    NODE_MIN_TIME: number
    NODE_TRANSFER_MAX_CONCURRENT: number
    NODE_TRANSFER_MIN_TIME: number
    COINGECKO_MAX_CONCURRENT: number
    COINGECKO_MIN_TIME: number
    COVALENT_MAX_CONCURRENT: number
    COVALENT_MIN_TIME: number
  }
  MONGO_DB: {
    NAME: string
    URI: string
    DEBUGGER: boolean
    RETRY_CONCURRENT_INTERVAL: number
    RETRY_CONCURRENT_TIME: number
  }
  LOG: {
    LEVEL: string
    SENTRY_DSN: string
    LOGZIO_HOST: string
    LOGZIO_SERVER_NAME: string
    LOGZIO_KEY: string
  }

  COVALENT: {
    URI: string
    API_KEY: string
  }

  ETHERSCAN: {
    API_KEY: string
  }

  COINGECKO: {
    URI: string
    API_KEY: string
  }

  PINATA: {
    JWT: string
    GATEWAY_URI: string
  }

  CONTRACTS: {
    ENS_REGISTRY: string
  }

  IPFS: {
    METADATA_FETCH_RETRY: number
    METADATA_FETCH_DELAY: number
    METADATA_FETCH_TIMEOUT: number
  }

  BLOCKCHAIN_NODES: {
    ETHEREUM_MAINNET: string | null
    ETHEREUM_SEPOLIA: string | null
    POLYGON_MAINNET: string | null
    BASE_MAINNET: string | null
    ARBITRUM_MAINNET: string | null
    ZKSYNC_SEPOLIA: string | null
  }

  SERVICES: {
    ARAGON_API: {
      BASE_URL: string
      NAME: string
      PORT: number
      TIMEOUT: number
      CORS: string[]
    }
    ARAGON_INDEXER: {
      TOKEN_INTERVAL: number
      TOKEN_FETCH_BATCH_SIZE: number
      DAO_INTERVAL: number
      DAO_FETCH_BATCH_SIZE: number
    }
    ARAGON_RATES: {
      RATES_INTERVAL: number
    }
  }
}
