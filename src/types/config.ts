import { type HexAddress, type NetworksEnum, type SupportedEnsNetworksEnum } from './networks'

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

interface ITokenData {
  address: HexAddress
  network: NetworksEnum
}

export interface IRawNodeConfig {
  ALCHEMY_API_KEY: string
  ARAGON_RPC: string
  DRPC_API_KEY?: string
  FROM_BLOCK: number
  OFFSET_TO_BLOCK: number
  POOLING_INTERVAL: number
  CONFIRMATION_BLOCKS: number
  INTERVAL_BLOCK_TIME: number
  MAX_BLOCK_RANGE: number
}

export interface IConfig {
  APP_NAME: string
  ENVIRONMENT: IEnumEnvironment
  NODE_ENV: IEnumNodeEnv
  TIMEZONE: string
  REMOTE_EXECUTION: boolean
  PROXY: string | null
  ENS_DOMAIN: string
  CONFIRMATION_BLOCKS: number
  ETHERSCAN_API: {
    BASE_URI: string
    API_KEY: string
  }
  ROUTESCAN_API: {
    BASE_URI: string
  }
  ANKR_CONFIG: {
    API_URL: string
    API_KEY: string
  }
  ALCHEMY_PRICE_API: {
    URI: string
    API_KEY: string
  }
  CHILIZ_API_URL: string
  ZKSYNC_BLOCK_EXPLORER_API: {
    MAINNET_BASE_URI: string
    SEPOLIA_BASE_URI: string
  }
  BLOCKSCOUT_EXPLORER_API: {
    CITREA_MAINNET_BASE_URI: string
    HEMI_MAINNET_BASE_URI: string
  }
  BATCH_REQUEST: {
    DEFAULT_SIZE: number
    MAX_RETRIES: number
    BASE_BACKOFF_MS: number
    MAX_BACKOFF_MS: number
  }
  NODES: {
    ETHEREUM_MAINNET: IRawNodeConfig
    ETHEREUM_SEPOLIA: IRawNodeConfig
    POLYGON_MAINNET: IRawNodeConfig
    BASE_MAINNET: IRawNodeConfig
    ARBITRUM_MAINNET: IRawNodeConfig
    ZKSYNC_MAINNET: IRawNodeConfig
    OPTIMISM_MAINNET: IRawNodeConfig
    CHILIZ_MAINNET?: IRawNodeConfig
    AVAX_MAINNET?: IRawNodeConfig
    KATANA_MAINNET?: IRawNodeConfig
    CITREA_MAINNET?: IRawNodeConfig
    HEMI_MAINNET?: IRawNodeConfig
    MONAD_MAINNET?: IRawNodeConfig
  }
  SUPPORTED_ENS_NETWORKS: SupportedEnsNetworksEnum[]
  SUPPORTED_NETWORKS: NetworksEnum[]
  WHITELIST_TOKENS: ITokenData[]
  DEFAULT_CURRENCY: string
  RABBITMQ: {
    URI: string
    TIMEOUT: number
    DEFAULT_CONCURRENCY: number
    RECONNECT_TIME_SECONDS: number
    HEARTBEAT_INTERVAL_SECONDS: number
    MAX_QUEUE_SIZE: number
    THROTTLE_RETRY_DELAY: number
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
    FOUR_BYTE_MAX_CONCURRENT: number
    FOUR_BYTE_MIN_TIME: number
    ALCHEMY_ENS_MAX_CONCURRENT: number
    ALCHEMY_ENS_MIN_TIME: number
    ALCHEMY_BATCH_REQUEST_MAX_CONCURRENT: number
    ALCHEMY_BATCH_REQUEST_MIN_TIME: number
    ALCHEMY_BALANCE_MAX_CONCURRENT: number
    ALCHEMY_BALANCE_MIN_TIME: number
    ROUTESCAN_MAX_CONCURRENT: number
    ROUTESCAN_MIN_TIME: number
    CHILIZ_MAX_CONCURRENT: number
    CHILIZ_MIN_TIME: number
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
    SYNC_MODELS: boolean
  }
  LOG: {
    LEVEL: string
    SENTRY_DSN: string
    LOGZIO_HOST: string
    LOGZIO_SERVER_NAME: string
    LOGZIO_KEY: string
  }

  COINGECKO: {
    URI: string
    API_KEY: string
    DEAD_TOKEN_VOLUME_THRESHOLD: number
  }

  FOUR_BYTE: {
    URI: string
  }

  PINATA: {
    JWT: string
    GATEWAY_URI: string
  }

  TENDERLY: {
    API_URL: string
    PROJECT: string
    USER: string
    ACCESS_KEY: string
    MAX_CONCURRENT: number
    MIN_TIME: number
    SHARING_BASE_URL: string
    RE_SIMULATION_TIME: number
  }

  CROSS_CHAIN_GAS: {
    MAX_CONCURRENT: number
    MIN_TIME: number
    HIGH_WATER: number
    BUDGET_GLOBAL_PER_HOUR: number
    BUDGET_PER_CONTROLLER_PER_HOUR: number
    CACHE_TTL: number
    STALE_WINDOW: number
  }

  TELEGRAM: {
    BOT_TOKEN: string
    FRAUD_CHAT_ID: string
  }

  FRAUD_SCAN: {
    ALERT_MIN_SCORE: number
    APP_BASE_URL: string
    ALERT_MAX_ATTEMPTS: number
    ALERT_RETRY_DELAY_MS: number
  }

  CONTRACTS: {
    ENS_REGISTRY: string
  }

  IPFS: {
    METADATA_FETCH_RETRY: number
    METADATA_FETCH_DELAY: number
    METADATA_FETCH_TIMEOUT: number
    METADATA_FETCH_TOTAL_TIMEOUT: number
    METADATA_REFETCH_MAX_RETRY: number
    METADATA_REFETCH_INTERVAL_MS: number
    PUBLIC_GATEWAY_URI: string
    DWEB_GATEWAY_URI: string
    PINATA_PUBLIC_GATEWAY_URI: string
  }

  RETRY_REQUEST: {
    COUNT: number
  }

  BLOCKCHAIN_LOG_CRAWLER: {
    ONE_BLOCK_PER_TIME_MIN_THRESHOLD: number
    DEFAULT_BATCH_SIZE: number
    ERROR_BATCH_SIZE: string[]
    BLOCK_LOW_RANGE: number
    BLOCK_MEDIUM_RANGE: number
    BLOCK_HIGH_RANGE: number
    ADAPTIVE: {
      INITIAL_BATCH_DAYS: number
      MIN_BATCH_DAYS: number
      MAX_BATCH_DAYS: number
      REDUCTION_FACTOR: number
      GROWTH_FACTOR: number
      SUCCESS_THRESHOLD_FOR_GROWTH: number
      DENSITY_THRESHOLDS: {
        VERY_HIGH: number
        HIGH: number
        MEDIUM: number
        LOW: number
      }
    }
  }

  SERVICES: {
    ARAGON_DAO: {
      TOKEN_FETCH_INTERVAL: number
      EXECUTION_DECODE_DELAY_MS: number
    }
    ARAGON_API: {
      BASE_URL: string
      NAME: string
      PORT: number
      TIMEOUT: number
      DECODE_ACTION_BATCH_LIMIT: number
      TOTAL_SUPPLY_TTL: number
    }
    ARAGON_ADMIN_API: {
      BASE_URL: string
      NAME: string
      PORT: number
      TIMEOUT: number
      JWT_KEY: string
      JWT_SECRET: string
    }
    ARAGON_INDEXER: {
      NAME: string
      DAO_INTERVAL: number
      PLUGIN_INTERVAL: number
      SYNC_ALL: boolean
    }
    ARAGON_RATES: {
      NAME: string
      RATES_INTERVAL: number
      REFRESH_SPAM_TOKENS_INTERVAL: number
      SPAM_SCORE_THRESHOLD: number
      CMS_SPAM_TOKENS_URL: string
    }
  }

  CRAWLER_CONFIG: {
    TOKEN_RATES_BATCH_SIZE: number
    TOKEN_RATES_CONCURRENCY: number
    TOKEN_HOLDERS_THRESHOLD: number
  }

  FILE_UPLOADS: {
    MAX_FILE_SIZE_MB: number
  }

  REWARDS: {
    ALLOW_RETROACTIVE_REWARDS: boolean
    ALLOW_EARLY_REWARD_GENERATION: boolean
    GOVERNANCE_REWARD_START_BLOCKS: {
      ETHEREUM_MAINNET: string[]
    }
  }
}
