import utils from '@helpers/utils'
import { type IConfig, NetworksEnum, SupportedEnsNetworksEnum } from '@types'

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
    ENS_DOMAIN: utils.configParser(sourceConfig, 'string', 'ENS_DOMAIN', 'dao.eth'),
    SUPPORTED_ENS_NETWORKS: utils.configParser(
      sourceConfig,
      'array',
      'SUPPORTED_ENS_NETWORKS',
      Object.values(SupportedEnsNetworksEnum),
    ),

    RABBITMQ: {
      URI: utils.configParser(sourceConfig, 'string', 'RABBITMQ_URI', 'amqp://localhost:5672'),
    },

    NODE_CONFIG: {
      MAX_RECONNECT_ATTEMPTS: utils.configParser(sourceConfig, 'number', 'NODE_CONFIG_MAX_RECONNECT_ATTEMPTS', 10),
      RECONNECT_INTERVAL: utils.configParser(sourceConfig, 'number', 'NODE_CONFIG_RECONNECT_INTERVAL', 5000),
    },

    ARAGON_SUPPORTED_BLOCK: {
      ETHEREUM_MAINNET: utils.configParser(sourceConfig, 'number', 'ARAGON_SUPPORTED_BLOCK_ETHEREUM_MAINNET', 16721812),
      ETHEREUM_SEPOLIA: utils.configParser(sourceConfig, 'number', 'ARAGON_SUPPORTED_BLOCK_ETHEREUM_SEPOLIA', 4415294),
      POLYGON_MAINNET: utils.configParser(sourceConfig, 'number', 'ARAGON_SUPPORTED_BLOCK_POLYGON_MAINNET', 40830344),
      BASE_MAINNET: utils.configParser(sourceConfig, 'number', 'ARAGON_SUPPORTED_BLOCK_BASE_MAINNET', 2094724),
      ZKSYNC_SEPOLIA: utils.configParser(sourceConfig, 'number', 'ARAGON_SUPPORTED_BLOCK_ZKSYNC_SEPOLIA', 2441204),
      ZKSYNC_MAINNET: utils.configParser(sourceConfig, 'number', 'ARAGON_SUPPORTED_BLOCK_ZKSYNC_MAINNET', 37460765), // zkSync ERA
      ARBITRUM_MAINNET: utils.configParser(
        sourceConfig,
        'number',
        'ARAGON_SUPPORTED_BLOCK_ARBITRUM_MAINNET',
        145462155,
      ),
    },

    BOTTLENECK: {
      ETHERSCAN_MAX_CONCURRENT: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_ETHERSCAN_MAX_CONCURRENT', 1),
      ETHERSCAN_MIN_TIME: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_ETHERSCAN_MIN_TIME', 2000),
      NODE_MAX_CONCURRENT: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_NODE_MAX_CONCURRENT', 50),
      NODE_MIN_TIME: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_NODE_MIN_TIME', 50),
      NODE_TRANSFER_MAX_CONCURRENT: utils.configParser(
        sourceConfig,
        'number',
        'BOTTLENECK_NODE_TRANSFER_MAX_CONCURRENT',
        4,
      ),
      NODE_TRANSFER_MIN_TIME: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_NODE_TRANSFER_MIN_TIME', 1500),
      COINGECKO_MAX_CONCURRENT: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_COINGECKO_MAX_CONCURRENT', 1),
      COINGECKO_MIN_TIME: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_COINGECKO_MIN_TIME', 2000),
      COVALENT_MAX_CONCURRENT: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_COVALENT_MAX_CONCURRENT', 1),
      COVALENT_MIN_TIME: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_COVALENT_MIN_TIME', 50),
      FOUR_BYTE_MAX_CONCURRENT: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_FOUR_BYTE_MAX_CONCURRENT', 1),
      FOUR_BYTE_MIN_TIME: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_FOUR_BYTE_MIN_TIME', 50),
      ALCHEMY_ENS_MAX_CONCURRENT: utils.configParser(
        sourceConfig,
        'number',
        'BOTTLENECK_ALCHEMY_ENS_MAX_CONCURRENT',
        1,
      ),
      ALCHEMY_ENS_MIN_TIME: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_ALCHEMY_ENS_MIN_TIME', 50),
      ALCHEMY_BALANCE_MAX_CONCURRENT: utils.configParser(
        sourceConfig,
        'number',
        'BOTTLENECK_ALCHEMY_BALANCE_MAX_CONCURRENT',
        1,
      ),
      ALCHEMY_BALANCE_MIN_TIME: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_ALCHEMY_BALANCE_MIN_TIME', 50),
    },

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
      CONNECTION_RETRY: utils.configParser(sourceConfig, 'number', 'MONGO_DB_RETRY_CONNECTION_RETRY', 60),
      CONNECTION_TIMEOUT: utils.configParser(sourceConfig, 'number', 'MONGO_DB_RETRY_CONNECTION_TIMEOUT', 5000),
      CONNECTION_DELAY: utils.configParser(sourceConfig, 'number', 'MONGO_DB_RETRY_CONNECTION_DELAY', 1000),
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
      API_KEY: utils.configParser(sourceConfig, 'string', 'COINGECKO_API_KEY', null),
    },

    FOUR_BYTE: {
      URI: utils.configParser(sourceConfig, 'string', 'FOUR_BYTE_URI', 'https://www.4byte.directory/api/v1'),
    },

    ETHERSCAN: {
      API_KEY: utils.configParser(sourceConfig, 'string', 'ETHERSCAN_API_KEY', null),
    },

    PINATA: {
      JWT: utils.configParser(sourceConfig, 'string', 'PINATA_JWT', null),
      GATEWAY_URI: utils.configParser(
        sourceConfig,
        'string',
        'PINATA_GATEWAY_URI',
        'https://aragon-1.mypinata.cloud/ipfs',
      ),
    },

    CONTRACTS: {
      ENS_REGISTRY: utils.configParser(
        sourceConfig,
        'string',
        'CONTRACTS_ENS_REGISTRY',
        '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e',
      ),
    },

    IPFS: {
      METADATA_FETCH_RETRY: utils.configParser(sourceConfig, 'number', 'IPFS_METADATA_FETCH_RETRY', 2),
      METADATA_FETCH_DELAY: utils.configParser(sourceConfig, 'number', 'IPFS_METADATA_FETCH_DELAY', 500),
      METADATA_FETCH_TIMEOUT: utils.configParser(sourceConfig, 'number', 'IPFS_METADATA_FETCH_TIMEOUT', 10000),
    },

    BLOCKCHAIN_NODES: {
      ETHEREUM_MAINNET: utils.configParser(sourceConfig, 'string', 'BLOCKCHAIN_NODES_ETHEREUM_MAINNET', null),
      ETHEREUM_SEPOLIA: utils.configParser(sourceConfig, 'string', 'BLOCKCHAIN_NODES_ETHEREUM_SEPOLIA', null),
      POLYGON_MAINNET: utils.configParser(sourceConfig, 'string', 'BLOCKCHAIN_NODES_POLYGON_MAINNET', null),
      BASE_MAINNET: utils.configParser(sourceConfig, 'string', 'BLOCKCHAIN_NODES_BASE_MAINNET', null),
      ARBITRUM_MAINNET: utils.configParser(sourceConfig, 'string', 'BLOCKCHAIN_NODES_ARBITRUM_MAINNET', null),
      ZKSYNC_SEPOLIA: utils.configParser(sourceConfig, 'string', 'BLOCKCHAIN_NODES_ZKSYNC_SEPOLIA', null),
      ZKSYNC_MAINNET: utils.configParser(sourceConfig, 'string', 'BLOCKCHAIN_NODES_ZKSYNC_MAINNET', null),
    },

    SERVICES: {
      ARAGON_API: {
        BASE_URL: utils.configParser(sourceConfig, 'string', 'SERVICES_ARAGON_API_BASE_URL', 'http://localhost:3000'),
        NAME: utils.configParser(sourceConfig, 'string', 'SERVICES_ARAGON_API_NAME', 'ARAGON-API'),
        PORT: utils.configParser(sourceConfig, 'number', 'SERVICES_ARAGON_API_PORT', 3000),
        TIMEOUT: utils.configParser(sourceConfig, 'number', 'SERVICES_ARAGON_API_TIMEOUT', 30), // seconds
        CORS: utils.configParser(sourceConfig, 'array', 'SERVICES_ARAGON_API_CORS_ORIGIN', []),
      },

      ARAGON_INDEXER: {
        NAME: utils.configParser(sourceConfig, 'string', 'SERVICES_ARAGON_INDEXER_NAME', 'ARAGON-INDEXER'),
        DAO_INTERVAL: utils.configParser(
          sourceConfig,
          'number',
          'SERVICES_ARAGON_INDEXER_DAO_INTERVAL',
          3 * 60 * 60 * 1000,
        ), // 3 hours
      },

      ARAGON_RATES: {
        NAME: utils.configParser(sourceConfig, 'string', 'SERVICES_ARAGON_RATES_NAME', 'ARAGON-RATES'),
        RATES_INTERVAL: utils.configParser(
          sourceConfig,
          'number',
          'SERVICES_ARAGON_RATES_RATES_INTERVAL',
          6 * 60 * 60 * 1000,
        ), // 6 hours
      },
    },

    CRAWLER_CONFIG: {
      // RATES
      TOKEN_RATES_BATCH_SIZE: utils.configParser(sourceConfig, 'number', 'INDEXER_CONFIG_TOKEN_RATES_BATCH_SIZE', 1000),
      TOKEN_RATES_CONCURRENCY: utils.configParser(sourceConfig, 'number', 'INDEXER_CONFIG_TOKEN_RATES_CONCURRENCY', 1),
    },
    ETHERSCAN_API: {
      ETHEREUM_MAINNET: {
        API_KEY: utils.configParser(sourceConfig, 'string', 'ETHERSCAN_API_ETHEREUM_MAINNET_API_KEY', null),
        API_URL: utils.configParser(
          sourceConfig,
          'string',
          'ETHERSCAN_API_ETHEREUM_MAINNET_API_URL',
          'https://api.etherscan.io/api',
        ),
      },
      ETHEREUM_SEPOLIA: {
        API_KEY: utils.configParser(sourceConfig, 'string', 'ETHERSCAN_API_ETHEREUM_SEPOLIA_API_KEY', null),
        API_URL: utils.configParser(
          sourceConfig,
          'string',
          'ETHERSCAN_API_ETHEREUM_SPOILIA_API_URL',
          'https://api-sepolia.etherscan.io/api',
        ),
      },
      POLYGON_MAINNET: {
        API_KEY: utils.configParser(sourceConfig, 'string', 'ETHERSCAN_API_POLYGON_MAINNET_API_KEY', null),
        API_URL: utils.configParser(
          sourceConfig,
          'string',
          'ETHERSCAN_API_POLYGON_MAINNET_API_URL',
          'https://api.polygonscan.com/api',
        ),
      },
      BASE_MAINNET: {
        API_KEY: utils.configParser(sourceConfig, 'string', 'ETHERSCAN_API_BASE_MAINNET_API_KEY', null),
        API_URL: utils.configParser(
          sourceConfig,
          'string',
          'ETHERSCAN_API_BASE_MAINNET_API_URL',
          'https://api.basescan.org/api',
        ),
      },
      ARBITRUM_MAINNET: {
        API_KEY: utils.configParser(sourceConfig, 'string', 'ETHERSCAN_API_ARBITRUM_MAINNET_API_KEY', null),
        API_URL: utils.configParser(
          sourceConfig,
          'string',
          'ETHERSCAN_API_ARBITRUM_MAINNET_API_URL',
          'https://api.arbiscan.io/api',
        ),
      },
      ZKSYNC_SEPOLIA: {
        API_KEY: utils.configParser(sourceConfig, 'string', 'ETHERSCAN_API_ZKSYNC_SEPOLIA_API_KEY', null),
        API_URL: utils.configParser(
          sourceConfig,
          'string',
          'ETHERSCAN_API_ZKSYNC_SEPOLIA_API_URL',
          'https://block-explorer-api.sepolia.zksync.dev/api',
        ),
      },
      ZKSYNC_MAINNET: {
        API_KEY: utils.configParser(sourceConfig, 'string', 'ETHERSCAN_API_ZKSYNC_MAINNET_API_KEY', null),
        API_URL: utils.configParser(
          sourceConfig,
          'string',
          'ETHERSCAN_API_ZKSYNC_MAINNET_API_URL',
          'https://block-explorer-api.mainnet.zksync.io/api',
        ),
      },
    },
  }
}

export { getConfigObject }
