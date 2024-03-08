import { type INetworks } from './networks'

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
  SUPPORTED_NETWORKS: INetworks[]
  DEFAULT_CURRENCY: string | null
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

  COINGECKO: {
    URI: string
  }

  DUNE: {
    URI: string
    API_KEY: string
  }

  ARAGON: {
    GATEWAY_URL: string
    GATEWAY_IPFS_API_KEY: string
  }

  SUBGRAPH: {
    SUBGRAPH_ARBITRUM_URI: string
    SUBGRAPH_ARBITRUM_GOERLI_URI: string
    SUBGRAPH_BASE_URI: string
    SUBGRAPH_BASE_GOERLI_URI: string
    SUBGRAPH_ETHEREUM_URI: string
    SUBGRAPH_GOERLI_URI: string
    SUBGRAPH_MUMBAI_URI: string
    SUBGRAPH_POLYGON_URI: string
    SUBGRAPH_SEPOLIA_URI: string
  }

  IPFS: {
    METADATA_FETCH_RETRY: number
    METADATA_FETCH_DELAY: number
  }

  SERVICES: {
    API: {
      NAME: string
      PORT: number
      TIMEOUT: number
      CORS: string[]
    }
    SYNC_DAO: {
      INTERVAL: number
      FETCH_BATCH_SIZE: number
    }
  }
}
