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

interface ContractEventFilter {
  address: string
  blockNumber: number
  deploymentTx: string
}

interface ContractEvent {
  AddresslistVotingSetup: ContractEventFilter
  AddresslistVotingSetupImplementation: ContractEventFilter
  AdminSetup: ContractEventFilter
  AdminSetupImplementation: ContractEventFilter
  DAOBase: ContractEventFilter
  DAOFactory: ContractEventFilter
  DAORegistryProxy: ContractEventFilter
  DAORegistryImplementation: ContractEventFilter
  DAOENSSubdomainRegistrarProxy: ContractEventFilter
  DAOENSSubdomainRegistrarImplementation: ContractEventFilter
  GovernanceERC20: ContractEventFilter
  GovernanceWrappedERC20: ContractEventFilter
  MultisigSetup: ContractEventFilter
  MultisigSetupImplementation: ContractEventFilter
  PluginRepoBase: ContractEventFilter
  PluginRepoFactory: ContractEventFilter
  PluginRepoRegistryProxy: ContractEventFilter
  PluginRepoRegistryImplementation: ContractEventFilter
  PluginSetupProcessor: ContractEventFilter
  PluginENSSubdomainRegistrarProxy: ContractEventFilter
  PluginENSSubdomainRegistrarImplementation: ContractEventFilter
  TokenVotingSetup: ContractEventFilter
  TokenVotingSetupImplementation: ContractEventFilter
  AddresslistVotingRepoProxy: ContractEventFilter
  AddresslistVotingRepoImplementation: ContractEventFilter
  AdminRepoProxy: ContractEventFilter
  AdminRepoImplementation: ContractEventFilter
  ManagementDAOProxy: ContractEventFilter
  ManagementDAOImplementation: ContractEventFilter
  MultisigRepoProxy: ContractEventFilter
  MultisigRepoImplementation: ContractEventFilter
  TokenVotingRepoProxy: ContractEventFilter
  TokenVotingRepoImplementation: ContractEventFilter
}

export interface IConfig {
  APP_NAME: string
  ENVIRONMENT: IEnumEnvironment
  NODE_ENV: IEnumNodeEnv
  TIMEZONE: string
  REMOTE_EXECUTION: boolean
  PROXY: string | null
  ENS_DOMAIN: string
  SUPPORTED_NETWORKS: INetworks[]
  DEFAULT_CURRENCY: string
  BOTTLENECK: {
    NODE_MAX_CONCURRENT: number
    NODE_MIN_TIME: number
    NODE_TRANSFER_MAX_CONCURRENT: number
    NODE_TRANSFER_MIN_TIME: number
    COINGECKO_MAX_CONCURRENT: number
    COINGECKO_MIN_TIME: number
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

  SUBGRAPH: {
    SUBGRAPH_ARBITRUM_URI: string
    SUBGRAPH_BASE_URI: string
    SUBGRAPH_ETHEREUM_URI: string
    SUBGRAPH_POLYGON_URI: string
    SUBGRAPH_SEPOLIA_URI: string
  }

  IPFS: {
    METADATA_FETCH_RETRY: number
    METADATA_FETCH_DELAY: number
    METADATA_FETCH_TIMEOUT: number
  }

  BLOCKCHAIN_NODES: {
    MAINNET: string | null
    SEPOLIA: string | null
    POLYGON: string | null
    BASE: string | null
    ARBITRUM: string | null
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

  ARAGON_CONTRACTS: {
    ARBITRUM: {
      'v1.3.0': ContractEvent
    }
    BASE: {
      'v1.3.0': ContractEvent
    }
    MAINNET: {
      'v1.0.0': ContractEvent
      'v1.3.0': ContractEvent
    }
    POLYGON: {
      'v1.0.0': ContractEvent
      'v1.3.0': ContractEvent
    }
    SEPOLIA: {
      'v1.3.0': ContractEvent
    }
  }
}
