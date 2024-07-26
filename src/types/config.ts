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
    ZKSYNC_MAINNET: number
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
    FOUR_BYTE_MAX_CONCURRENT: number
    FOUR_BYTE_MIN_TIME: number
    ALCHEMY_ENS_MAX_CONCURRENT: number
    ALCHEMY_ENS_MIN_TIME: number
    ALCHEMY_BALANCE_MAX_CONCURRENT: number
    ALCHEMY_BALANCE_MIN_TIME: number
  }
  MONGO_DB: {
    NAME: string
    URI: string
    DEBUGGER: boolean
    RETRY_CONCURRENT_INTERVAL: number
    RETRY_CONCURRENT_TIME: number
    CONNECTION_RETRY: number
    CONNECTION_TIMEOUT: number
    CONNECTION_DELAY: number
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

  FOUR_BYTE: {
    URI: string
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
    ZKSYNC_MAINNET: string | null
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
      NAME: string
      DAO_INTERVAL: number
    }
    ARAGON_RATES: {
      NAME: string
      RATES_INTERVAL: number
    }
  }

  CRAWLER_CONFIG: {
    DA0_BATCH_SIZE: number
    DAO_CONCURRENCY: number
    DA0_PLUGIN_BATCH_SIZE: number
    DAO_PLUGIN_CONCURRENCY: number
    DA0_SETTING_BATCH_SIZE: number
    DAO_SETTING_CONCURRENCY: number
    MEMBER_BATCH_SIZE: number
    MEMBER_CONCURRENCY: number
    MEMBER_DELEGATE_BATCH_SIZE: number
    MEMBER_DELEGATE_CONCURRENCY: number
    PROPOSAL_BATCH_SIZE: number
    PROPOSAL_CONCURRENCY: number
    VOTE_BATCH_SIZE: number
    VOTE_CONCURRENCY: number
    TOKEN_RATES_BATCH_SIZE: number
    TOKEN_RATES_CONCURRENCY: number
    DAO_TVL_BATCH_SIZE: number
    DAO_TVL_CONCURRENCY: number
    DAO_ASSETS_BATCH_SIZE: number
    DAO_ASSETS_CONCURRENCY: number
    DAO_TRANSACTIONS_BATCH_SIZE: number
    DAO_TRANSACTIONS_CONCURRENCY: number
  }
}
