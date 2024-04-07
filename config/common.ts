import utils from '@helpers/utils'
import { type IConfig, NetworksEnum } from '@types'

const getConfigObject = (sourceConfig: Record<string, any>): IConfig => {
  return {
    APP_NAME: utils.configParser(sourceConfig, 'string', 'APP_NAME', 'Aragon Backend'),
    ENVIRONMENT: utils.configParser(sourceConfig, 'string', 'ENVIRONMENT', 'local'),
    NODE_ENV: utils.configParser(sourceConfig, 'string', 'NODE_ENV', 'development'),
    TIMEZONE: utils.configParser(sourceConfig, 'string', 'TIMEZONE', 'Europe/London'),
    REMOTE_EXECUTION: utils.configParser(sourceConfig, 'bool', 'REMOTE_EXECUTION', false),
    PROXY: utils.configParser(sourceConfig, 'string', 'PROXY', null),
    SUPPORTED_NETWORKS: utils.configParser(sourceConfig, 'array', 'SUPPORTED_NETWORKS', Object.values(NetworksEnum)),
    DEFAULT_CURRENCY: utils.configParser(sourceConfig, 'string', 'DEFAULT_CURRENCY', 'USD'),

    MONGO_DB: {
      NAME: utils.configParser(sourceConfig, 'string', 'MONGO_DB_NAME', 'db-aragon'),
      URI: utils.configParser(
        sourceConfig,
        'string',
        'MONGO_DB_URI',
        'mongodb://localhost:27017,localhost:27018,localhost:27019?replicaSet=rs&retryWrites=true',
      ),
      DEBUGGER: utils.configParser(sourceConfig, 'bool', 'MONGO_DB_DEBUGGER', false),
      RETRY_CONCURRENT_INTERVAL: utils.configParser(sourceConfig, 'number', 'MONGO_DB_RETRY_CONCURRENT_INTERVAL', 50),
      RETRY_CONCURRENT_TIME: utils.configParser(sourceConfig, 'number', 'MONGO_DB_RETRY_CONCURRENT_TIME', 100),
    },

    LOG: {
      LEVEL: utils.configParser(sourceConfig, 'string', 'LOG_LEVEL', 'verbose'),
      SENTRY_DSN: utils.configParser(sourceConfig, 'string', 'LOG_SENTRY_DSN', null),
      LOGZIO_KEY: utils.configParser(sourceConfig, 'string', 'LOG_LOGZIO_KEY', null),
      LOGZIO_HOST: utils.configParser(sourceConfig, 'string', 'LOG_LOGZIO_HOST', null),
      LOGZIO_SERVER_NAME: utils.configParser(sourceConfig, 'string', 'LOGZIO_SERVER_NAME', 'aragon-api'),
    },

    COVALENT: {
      URI: utils.configParser(sourceConfig, 'string', 'COVALENT_URI', 'https://api.covalenthq.com/v1'),
      API_KEY: utils.configParser(sourceConfig, 'string', 'COVALENT_API_KEY', null),
    },

    COINGECKO: {
      URI: utils.configParser(sourceConfig, 'string', 'COINGECKO_URI', 'https://api.coingecko.com/api/v3'),
    },

    DUNE: {
      URI: utils.configParser(sourceConfig, 'string', 'DUNE_URI', 'https://api.dune.com/api/v1'),
      API_KEY: utils.configParser(sourceConfig, 'string', 'DUNE_API_KEY', null),
    },

    PINATA: {
      JWT: utils.configParser(sourceConfig, 'string', 'PINATA_JWT', null),
    },

    SUBGRAPH: {
      SUBGRAPH_ARBITRUM_URI: utils.configParser(
        sourceConfig,
        'string',
        'SUBGRAPH_ARBITRUM_URI',
        'https://subgraph.satsuma-prod.com/qHR2wGfc5RLi6/aragon/osx-arbitrum/version/v1.4.0/api',
      ),
      SUBGRAPH_BASE_URI: utils.configParser(
        sourceConfig,
        'string',
        'SUBGRAPH_BASE_URI',
        'https://subgraph.satsuma-prod.com/qHR2wGfc5RLi6/aragon/osx-baseMainnet/version/v1.4.0/api',
      ),
      SUBGRAPH_ETHEREUM_URI: utils.configParser(
        sourceConfig,
        'string',
        'SUBGRAPH_ETHEREUM_URI',
        'https://subgraph.satsuma-prod.com/qHR2wGfc5RLi6/aragon/osx-mainnet/version/v1.4.0/api',
      ),
      SUBGRAPH_POLYGON_URI: utils.configParser(
        sourceConfig,
        'string',
        'SUBGRAPH_POLYGON_URI',
        'https://subgraph.satsuma-prod.com/qHR2wGfc5RLi6/aragon/osx-polygon/version/v1.4.0/api',
      ),
      SUBGRAPH_SEPOLIA_URI: utils.configParser(
        sourceConfig,
        'string',
        'SUBGRAPH_SEPOLIA_URI',
        'https://subgraph.satsuma-prod.com/qHR2wGfc5RLi6/aragon/osx-sepolia/version/v1.4.0/api',
      ),
    },

    IPFS: {
      METADATA_FETCH_RETRY: utils.configParser(sourceConfig, 'number', 'IPFS_METADATA_FETCH_RETRY', 5),
      METADATA_FETCH_DELAY: utils.configParser(sourceConfig, 'number', 'IPFS_METADATA_FETCH_DELAY', 5000),
    },

    BLOCKCHAIN_NODES: {
      MAINNET: utils.configParser(sourceConfig, 'string', 'BLOCKCHAIN_NODES_MAINNET', null),
      SEPOLIA: utils.configParser(sourceConfig, 'string', 'BLOCKCHAIN_NODES_SEPOLIA', null),
      POLYGON: utils.configParser(sourceConfig, 'string', 'BLOCKCHAIN_NODES_POLYGON', null),
      BASE: utils.configParser(sourceConfig, 'string', 'BLOCKCHAIN_NODES_BASE', null),
      ARBITRUM: utils.configParser(sourceConfig, 'string', 'BLOCKCHAIN_NODES_ARBITRUM', null),
    },

    SERVICES: {
      API: {
        BASE_URL: utils.configParser(sourceConfig, 'string', 'SERVICES_API_BASE_URL', 'http://localhost:3000'),
        NAME: utils.configParser(sourceConfig, 'string', 'SERVICES_API_NAME', 'API'),
        PORT: utils.configParser(sourceConfig, 'number', 'SERVICES_API_PORT', 3000),
        TIMEOUT: utils.configParser(sourceConfig, 'number', 'SERVICES_API_TIMEOUT', 30), // seconds
        CORS: utils.configParser(sourceConfig, 'array', 'SERVICES_API_CORS_ORIGIN', []),
      },

      SYNC_DATA: {
        DAO_INTERVAL: utils.configParser(sourceConfig, 'number', 'SERVICES_SYNC_DATA_DAO_INTERVAL', 3 * 60 * 60 * 1000), // 3 hours
        DAO_FETCH_BATCH_SIZE: utils.configParser(
          sourceConfig,
          'number',
          'SERVICES_SYNC_DATA_DAO_FETCH_BATCH_SIZE',
          2000,
        ),
        TOKEN_INTERVAL: utils.configParser(
          sourceConfig,
          'number',
          'SERVICES_SYNC_DATA_TOKEN_INTERVAL',
          24 * 60 * 60 * 1000,
        ), // 24 hours
        TOKEN_FETCH_BATCH_SIZE: utils.configParser(
          sourceConfig,
          'number',
          'SERVICES_SYNC_DATA_TOKEN_FETCH_BATCH_SIZE',
          500,
        ),
      },
    },
  }
}

export { getConfigObject }
