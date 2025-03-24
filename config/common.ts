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
    SUPPORTED_NETWORKS: utils.configParser(sourceConfig, 'array', 'SUPPORTED_NETWORKS', []),
    DEFAULT_CURRENCY: utils.configParser(sourceConfig, 'string', 'DEFAULT_CURRENCY', 'USD'),
    ENS_DOMAIN: utils.configParser(sourceConfig, 'string', 'ENS_DOMAIN', 'dao.eth'),
    CUSTOM_INSTALL: utils.configParser(sourceConfig, 'bool', 'CUSTOM_INSTALL', false),
    SUPPORTED_ENS_NETWORKS: utils.configParser(
      sourceConfig,
      'array',
      'SUPPORTED_ENS_NETWORKS',
      Object.values(SupportedEnsNetworksEnum),
    ),

    RABBITMQ: {
      URI: utils.configParser(sourceConfig, 'string', 'RABBITMQ_URI', 'amqp://localhost:5672'),
      TIMEOUT: utils.configParser(sourceConfig, 'number', 'RABBITMQ_TIMEOUT', 30000),
      DEFAULT_CONCURRENCY: utils.configParser(sourceConfig, 'number', 'RABBITMQ_DEFAULT_CONCURRENCY', 25),
      RECONNECT_TIME: utils.configParser(sourceConfig, 'number', 'RABBITMQ_RECONNECT_TIME', 1000),
      CLEAN_QUEUE: utils.configParser(sourceConfig, 'bool', 'RABBITMQ_CLEAN_QUEUE', false),
    },

    NODE_CONFIG: {
      MAX_RECONNECT_ATTEMPTS: utils.configParser(sourceConfig, 'number', 'NODE_CONFIG_MAX_RECONNECT_ATTEMPTS', 10),
      RECONNECT_INTERVAL: utils.configParser(sourceConfig, 'number', 'NODE_CONFIG_RECONNECT_INTERVAL', 100),
    },

    CONFIRMATION_BLOCKS: utils.configParser(sourceConfig, 'number', 'CONFIRMATION_BLOCKS', 3),
    WHITELIST_TOKENS: utils.configParser(sourceConfig, 'array', 'WHITELIST_TOKENS', [
      { address: '0x1b6ec227ceBeC25118270efbb4b67642fc29965E', network: NetworksEnum.ethereumMainnet },
    ]),

    NODES: {
      ETHEREUM_MAINNET: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ETHEREUM_MAINNET_ALCHEMY_API_KEY', null),
        ARAGON_WS: utils.configParser(sourceConfig, 'string', 'NODES_ETHEREUM_MAINNET_ARAGON_WS', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_ETHEREUM_MAINNET_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_ETHEREUM_MAINNET_FROM_BLOCK', 16721812),
        CONFIRMATION_BLOCKS: utils.configParser(
          sourceConfig,
          'number',
          'NODES_ETHEREUM_MAINNET_CONFIRMATION_BLOCKS',
          1,
        ),
        INTERVAL_BLOCK_TIME: utils.configParser(
          sourceConfig,
          'number',
          'NODES_ETHEREUM_MAINNET_INTERVAL_BLOCK_TIME',
          14,
        ),
        ETHERSCAN_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ETHEREUM_MAINNET_ETHERSCAN_API_KEY', null),
        ETHERSCAN_API_URL: utils.configParser(
          sourceConfig,
          'string',
          'NODES_ETHEREUM_MAINNET_ETHERSCAN_API_URL',
          'https://api.etherscan.io/api',
        ),
        BLOCKSCOUT_API_URL: utils.configParser(
          sourceConfig,
          'string',
          'NODES_ETHEREUM_MAINNET_BLOCKSCOUT_API_URL',
          'https://eth.blockscout.com/api/',
        ),
        BLOCKSCOUT_API_KEY: utils.configParser(
          sourceConfig,
          'string',
          'NODES_ETHEREUM_MAINNET_BLOCKSCOUT_API_KEY',
          null,
        ),
      },
      ETHEREUM_SEPOLIA: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ETHEREUM_SEPOLIA_ALCHEMY_API_KEY', null),
        ARAGON_WS: utils.configParser(sourceConfig, 'string', 'NODES_ETHEREUM_SEPOLIA_ARAGON_WS', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_ETHEREUM_SEPOLIA_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_ETHEREUM_SEPOLIA_FROM_BLOCK', 4415294),
        CONFIRMATION_BLOCKS: utils.configParser(
          sourceConfig,
          'number',
          'NODES_ETHEREUM_SEPOLIA_CONFIRMATION_BLOCKS',
          1,
        ),
        INTERVAL_BLOCK_TIME: utils.configParser(
          sourceConfig,
          'number',
          'NODES_ETHEREUM_SEPOLIA_INTERVAL_BLOCK_TIME',
          14,
        ),
        ETHERSCAN_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ETHEREUM_SEPOLIA_ETHERSCAN_API_KEY', null),
        ETHERSCAN_API_URL: utils.configParser(
          sourceConfig,
          'string',
          'NODES_ETHEREUM_SEPOLIA_ETHERSCAN_API_URL',
          'https://api-sepolia.etherscan.io/api',
        ),
        BLOCKSCOUT_API_URL: utils.configParser(
          sourceConfig,
          'string',
          'NODES_ETHEREUM_SEPOLIA_BLOCKSCOUT_API_URL',
          'https://eth-sepolia.blockscout.com/api/',
        ),
        BLOCKSCOUT_API_KEY: utils.configParser(
          sourceConfig,
          'string',
          'NODES_ETHEREUM_SEPOLIA_BLOCKSCOUT_API_KEY',
          null,
        ),
      },
      POLYGON_MAINNET: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_POLYGON_MAINNET_ALCHEMY_API_KEY', null),
        ARAGON_WS: utils.configParser(sourceConfig, 'string', 'NODES_POLYGON_MAINNET_ARAGON_WS', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_POLYGON_MAINNET_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_POLYGON_MAINNET_FROM_BLOCK', 40830344),
        CONFIRMATION_BLOCKS: utils.configParser(sourceConfig, 'number', 'NODES_POLYGON_MAINNET_CONFIRMATION_BLOCKS', 1),
        INTERVAL_BLOCK_TIME: utils.configParser(sourceConfig, 'number', 'NODES_POLYGON_MAINNET_INTERVAL_BLOCK_TIME', 2),
        ETHERSCAN_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_POLYGON_MAINNET_ETHERSCAN_API_KEY', null),
        ETHERSCAN_API_URL: utils.configParser(
          sourceConfig,
          'string',
          'NODES_POLYGON_MAINNET_ETHERSCAN_API_URL',
          'https://api.polygonscan.com/api',
        ),
        BLOCKSCOUT_API_URL: utils.configParser(
          sourceConfig,
          'string',
          'NODES_POLYGON_MAINNET_BLOCKSCOUT_API_URL',
          'https://polygon.blockscout.com/api/',
        ),
        BLOCKSCOUT_API_KEY: utils.configParser(
          sourceConfig,
          'string',
          'NODES_POLYGON_MAINNET_BLOCKSCOUT_API_KEY',
          null,
        ),
      },
      BASE_MAINNET: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_BASE_MAINNET_ALCHEMY_API_KEY', null),
        ARAGON_WS: utils.configParser(sourceConfig, 'string', 'NODES_BASE_MAINNET_ARAGON_WS', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_BASE_MAINNET_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_BASE_MAINNET_FROM_BLOCK', 2094724),
        CONFIRMATION_BLOCKS: utils.configParser(sourceConfig, 'number', 'NODES_BASE_MAINNET_CONFIRMATION_BLOCKS', 1),
        INTERVAL_BLOCK_TIME: utils.configParser(sourceConfig, 'number', 'NODES_BASE_MAINNET_INTERVAL_BLOCK_TIME', 12),
        ETHERSCAN_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_BASE_MAINNET_ETHERSCAN_API_KEY', null),
        ETHERSCAN_API_URL: utils.configParser(
          sourceConfig,
          'string',
          'NODES_BASE_MAINNET_ETHERSCAN_API_URL',
          'https://api.basescan.org/api',
        ),
        BLOCKSCOUT_API_URL: utils.configParser(
          sourceConfig,
          'string',
          'NODES_BASE_MAINNET_BLOCKSCOUT_API_URL',
          'https://base.blockscout.com/api/',
        ),
        BLOCKSCOUT_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_BASE_MAINNET_BLOCKSCOUT_API_KEY', null),
      },
      ARBITRUM_MAINNET: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ARBITRUM_MAINNET_ALCHEMY_API_KEY', null),
        ARAGON_WS: utils.configParser(sourceConfig, 'string', 'NODES_ARBITRUM_MAINNET_ARAGON_WS', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_ARBITRUM_MAINNET_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_ARBITRUM_MAINNET_FROM_BLOCK', 2441204),
        CONFIRMATION_BLOCKS: utils.configParser(
          sourceConfig,
          'number',
          'NODES_ARBITRUM_MAINNET_CONFIRMATION_BLOCKS',
          1,
        ),
        INTERVAL_BLOCK_TIME: utils.configParser(
          sourceConfig,
          'number',
          'NODES_ARBITRUM_MAINNET_INTERVAL_BLOCK_TIME',
          2,
        ),
        ETHERSCAN_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ARBITRUM_MAINNET_ETHERSCAN_API_KEY', null),
        ETHERSCAN_API_URL: utils.configParser(
          sourceConfig,
          'string',
          'NODES_ARBITRUM_MAINNET_ETHERSCAN_API_URL',
          'https://api.arbiscan.io/api',
        ),
        BLOCKSCOUT_API_URL: utils.configParser(
          sourceConfig,
          'string',
          'NODES_ARBITRUM_MAINNET_BLOCKSCOUT_API_URL',
          'https://arbitrum.blockscout.com/api/',
        ),
        BLOCKSCOUT_API_KEY: utils.configParser(
          sourceConfig,
          'string',
          'NODES_ARBITRUM_MAINNET_BLOCKSCOUT_API_KEY',
          null,
        ),
      },
      ZKSYNC_SEPOLIA: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ZKSYNC_SEPOLIA_ALCHEMY_API_KEY', null),
        ARAGON_WS: utils.configParser(sourceConfig, 'string', 'NODES_ZKSYNC_SEPOLIA_ARAGON_WS', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_ZKSYNC_SEPOLIA_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_ZKSYNC_SEPOLIA_FROM_BLOCK', 37460765), // zkSync ERA
        CONFIRMATION_BLOCKS: utils.configParser(sourceConfig, 'number', 'NODES_ZKSYNC_SEPOLIA_CONFIRMATION_BLOCKS', 1),
        INTERVAL_BLOCK_TIME: utils.configParser(sourceConfig, 'number', 'NODES_ZKSYNC_SEPOLIA_INTERVAL_BLOCK_TIME', 3),
        ETHERSCAN_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ZKSYNC_SEPOLIA_ETHERSCAN_API_KEY', null),
        ETHERSCAN_API_URL: utils.configParser(
          sourceConfig,
          'string',
          'NODES_ZKSYNC_SEPOLIA_ETHERSCAN_API_URL',
          'https://block-explorer-api.sepolia.zksync.dev/api',
        ),
        BLOCKSCOUT_API_URL: utils.configParser(
          sourceConfig,
          'string',
          'NODES_ZKSYNC_SEPOLIA_BLOCKSCOUT_API_URL',
          'https://zksync-sepolia.blockscout.com/api/',
        ),
        BLOCKSCOUT_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ZKSYNC_SEPOLIA_BLOCKSCOUT_API_KEY', null),
      },
      ZKSYNC_MAINNET: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ZKSYNC_MAINNET_ALCHEMY_API_KEY', null),
        ARAGON_WS: utils.configParser(sourceConfig, 'string', 'NODES_ZKSYNC_MAINNET_ARAGON_WS', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_ZKSYNC_MAINNET_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_ZKSYNC_MAINNET_FROM_BLOCK', 145462155),
        CONFIRMATION_BLOCKS: utils.configParser(sourceConfig, 'number', 'NODES_ZKSYNC_MAINNET_CONFIRMATION_BLOCKS', 1),
        INTERVAL_BLOCK_TIME: utils.configParser(sourceConfig, 'number', 'NODES_ZKSYNC_MAINNET_INTERVAL_BLOCK_TIME', 5),
        ETHERSCAN_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ZKSYNC_MAINNET_ETHERSCAN_API_KEY', null),
        ETHERSCAN_API_URL: utils.configParser(
          sourceConfig,
          'string',
          'NODES_ZKSYNC_MAINNET_ETHERSCAN_API_URL',
          'https://block-explorer-api.mainnet.zksync.io/api',
        ),
        BLOCKSCOUT_API_URL: utils.configParser(
          sourceConfig,
          'string',
          'NODES_ZKSYNC_MAINNET_BLOCKSCOUT_API_URL',
          'https://zksync.blockscout.com/api/',
        ),
        BLOCKSCOUT_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ZKSYNC_MAINNET_BLOCKSCOUT_API_KEY', null),
      },
    },

    BOTTLENECK: {
      BLOCKSCOUT_API_MAX_CONCURRENT: utils.configParser(
        sourceConfig,
        'number',
        'BOTTLENECK_BLOCKSCOUT_API_MAX_CONCURRENT',
        1,
      ),
      BLOCKSCOUT_API_MIN_TIME: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_BLOCKSCOUT_API_MIN_TIME', 2000),
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
        'BOTTLENECK_ALCHEMY_API_KEY_ENS_MAX_CONCURRENT',
        1,
      ),
      ALCHEMY_ENS_MIN_TIME: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_ALCHEMY_API_KEY_ENS_MIN_TIME', 50),
      ALCHEMY_BALANCE_MAX_CONCURRENT: utils.configParser(
        sourceConfig,
        'number',
        'BOTTLENECK_ALCHEMY_API_KEY_BALANCE_MAX_CONCURRENT',
        1,
      ),
      ALCHEMY_BALANCE_MIN_TIME: utils.configParser(
        sourceConfig,
        'number',
        'BOTTLENECK_ALCHEMY_API_KEY_BALANCE_MIN_TIME',
        50,
      ),
      ALCHEMY_BATCH_REQUEST_MAX_CONCURRENT: utils.configParser(
        sourceConfig,
        'number',
        'BOTTLENECK_ALCHEMY_API_KEY_BATCH_REQUEST_MAX_CONCURRENT',
        10,
      ),
      ALCHEMY_BATCH_REQUEST_MIN_TIME: utils.configParser(
        sourceConfig,
        'number',
        'BOTTLENECK_ALCHEMY_API_KEY_BATCH_REQUEST_MIN_TIME',
        100,
      ),
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

    RETRY_REQUEST: {
      COUNT: utils.configParser(sourceConfig, 'number', 'RETRY_REQUEST_COUNT', 5),
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
        PLUGIN_INTERVAL: utils.configParser(
          sourceConfig,
          'number',
          'SERVICES_ARAGON_INDEXER_PLUGIN_INTERVAL',
          6 * 60 * 60 * 1000,
        ), // 6 hours
        SYNC_ALL: utils.configParser(sourceConfig, 'bool', 'SERVICES_ARAGON_INDEXER_SYNC_ALL', false),
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

      ARAGON_SYNC: {
        NAME: utils.configParser(sourceConfig, 'string', 'SERVICES_ARAGON_SYNC_NAME', 'ARAGON-SYNC'),
        SYNC_INTERVAL: utils.configParser(sourceConfig, 'number', 'SERVICES_ARAGON_SYNC_SYNC_INTERVAL', 10 * 60 * 1000), // 10 minutes
      },
    },

    CRAWLER_CONFIG: {
      // RATES
      TOKEN_RATES_BATCH_SIZE: utils.configParser(sourceConfig, 'number', 'INDEXER_CONFIG_TOKEN_RATES_BATCH_SIZE', 1000),
      TOKEN_RATES_CONCURRENCY: utils.configParser(sourceConfig, 'number', 'INDEXER_CONFIG_TOKEN_RATES_CONCURRENCY', 1),
    },
  }
}

export { getConfigObject }
