import { type NetworksEnum, type SupportedEnsNetworksEnum } from './networks'
import { type IEnumIndexerService } from '@src/types/services'

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

export interface IEtherScanConfig {
  API_KEY: string
  API_URL: string
}

export interface IEventConfig {
  event: string
  handler: (event: any, info: any) => Promise<any>
  enableHistorical?: boolean
  enableRealtime?: boolean
}

export interface IIndexerConfig {
  name: IEnumIndexerService
  abi: any[]
  listen: IEventConfig[]
  enabled?: boolean
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
  RABBITMQ: {
    URI: string
  }
  NODE_CONFIG: {
    MAX_RECONNECT_ATTEMPTS: number
    RECONNECT_INTERVAL: number
  }
  BOTTLENECK: {
    ETHERSCAN_MAX_CONCURRENT: number
    ETHERSCAN_MIN_TIME: number
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
    ARAGON_TRANSACTIONS: {
      CONFIRMATION_DELAY: number
    }
  }

  CRAWLER_CONFIG: {
    TOKEN_RATES_BATCH_SIZE: number
    TOKEN_RATES_CONCURRENCY: number
  }

  ETHERSCAN_API: {
    ETHEREUM_MAINNET: IEtherScanConfig
    ETHEREUM_SEPOLIA: IEtherScanConfig
    POLYGON_MAINNET: IEtherScanConfig
    BASE_MAINNET: IEtherScanConfig
    ARBITRUM_MAINNET: IEtherScanConfig
    ZKSYNC_SEPOLIA: IEtherScanConfig
    ZKSYNC_MAINNET: IEtherScanConfig
  }
}
