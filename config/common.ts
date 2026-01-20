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
    SUPPORTED_ENS_NETWORKS: utils.configParser(
      sourceConfig,
      'array',
      'SUPPORTED_ENS_NETWORKS',
      Object.values(SupportedEnsNetworksEnum),
    ),
    FILE_UPLOADS: {
      MAX_FILE_SIZE_MB: utils.configParser(sourceConfig, 'number', 'FILE_UPLOADS_MAX_FILE_SIZE_MB', 100 * 1024 * 1024),
    },
    RABBITMQ: {
      URI: utils.configParser(sourceConfig, 'string', 'RABBITMQ_URI', 'amqp://guest:guest@rabbitmq:5672'),
      TIMEOUT: utils.configParser(sourceConfig, 'number', 'RABBITMQ_TIMEOUT', 60000),
      DEFAULT_CONCURRENCY: utils.configParser(sourceConfig, 'number', 'RABBITMQ_DEFAULT_CONCURRENCY', 25),
      RECONNECT_TIME_SECONDS: utils.configParser(sourceConfig, 'number', 'RABBITMQ_RECONNECT_TIME_SECONDS', 5),
      HEARTBEAT_INTERVAL_SECONDS: utils.configParser(sourceConfig, 'number', 'RABBITMQ_HEARTBEAT_INTERVAL_SECONDS', 30),
      MAX_QUEUE_SIZE: utils.configParser(sourceConfig, 'number', 'RABBITMQ_MAX_QUEUE_SIZE', 50),
      THROTTLE_RETRY_DELAY: utils.configParser(sourceConfig, 'number', 'RABBITMQ_THROTTLE_RETRY_DELAY', 3000),
    },

    NODE_CONFIG: {
      MAX_RECONNECT_ATTEMPTS: utils.configParser(sourceConfig, 'number', 'NODE_CONFIG_MAX_RECONNECT_ATTEMPTS', 10),
      RECONNECT_INTERVAL: utils.configParser(sourceConfig, 'number', 'NODE_CONFIG_RECONNECT_INTERVAL', 100),
    },

    BATCH_REQUEST: {
      DEFAULT_SIZE: utils.configParser(sourceConfig, 'number', 'BATCH_REQUEST_DEFAULT_SIZE', 500),
      MAX_RETRIES: utils.configParser(sourceConfig, 'number', 'BATCH_REQUEST_MAX_RETRIES', 3),
      BASE_BACKOFF_MS: utils.configParser(sourceConfig, 'number', 'BATCH_REQUEST_BASE_BACKOFF_MS', 500),
      MAX_BACKOFF_MS: utils.configParser(sourceConfig, 'number', 'BATCH_REQUEST_MAX_BACKOFF_MS', 5000),
    },
    ANKR_CONFIG: {
      API_URL: utils.configParser(sourceConfig, 'string', 'ANKR_API_URL', 'https://rpc.ankr.com'),
      API_KEY: utils.configParser(sourceConfig, 'string', 'ANKR_API_KEY', null),
    },
    CHILIZ_API_URL: utils.configParser(sourceConfig, 'string', 'CHILIZ_API_URL', 'https://scan.chiliz.com'),

    CONFIRMATION_BLOCKS: utils.configParser(sourceConfig, 'number', 'CONFIRMATION_BLOCKS', 3),
    WHITELIST_TOKENS: utils.configParser(sourceConfig, 'array', 'WHITELIST_TOKENS', [
      { address: '0x1b6ec227ceBeC25118270efbb4b67642fc29965E', network: NetworksEnum.ethereumMainnet },
    ]),

    BLOCKCHAIN_LOG_CRAWLER: {
      ONE_BLOCK_PER_TIME_MIN_THRESHOLD: utils.configParser(
        sourceConfig,
        'number',
        'BLOCKCHAIN_LOG_CRAWLER_ONE_BLOCK_PER_TIME_MIN_THRESHOLD',
        5,
      ),
      DEFAULT_BATCH_SIZE: utils.configParser(sourceConfig, 'number', 'BLOCKCHAIN_LOG_CRAWLER_DEFAULT_BATCH_SIZE', 30),
      ERROR_BATCH_SIZE: utils.configParser(sourceConfig, 'array', 'BLOCKCHAIN_LOG_CRAWLER_ERROR_BATCH_SIZE', [
        'The query timed out',
        'timeout',
        'retry',
        'invalid JSON',
        'not valid JSON',
        'eth_getLogs is limited',
        'Response size is larger than 150MB limit',
        'Log response size exceeded',
        'Consider reducing your block range',
        'Query returned more than 1000000 results',
        'Cannot create a string longer',
        'Response is too big',
        'too large',
        'Request failed with timeout',
        'query exceeds max results',
        'request timed out',
        'Please retry',
      ]),
      BLOCK_LOW_RANGE: utils.configParser(sourceConfig, 'number', 'BLOCKCHAIN_LOG_CRAWLER_BLOCK_LOW_RANGE', 15),
      BLOCK_MEDIUM_RANGE: utils.configParser(sourceConfig, 'number', 'BLOCKCHAIN_LOG_CRAWLER_BLOCK_MEDIUM_RANGE', 40),
      BLOCK_HIGH_RANGE: utils.configParser(sourceConfig, 'number', 'BLOCKCHAIN_LOG_CRAWLER_BLOCK_HIGH_RANGE', 70),
      // Adaptive batch size configuration
      ADAPTIVE: {
        INITIAL_BATCH_DAYS: utils.configParser(
          sourceConfig,
          'number',
          'BLOCKCHAIN_LOG_CRAWLER_ADAPTIVE_INITIAL_BATCH_DAYS',
          60, // 60 days for all networks
        ),
        MIN_BATCH_DAYS: utils.configParser(
          sourceConfig,
          'number',
          'BLOCKCHAIN_LOG_CRAWLER_ADAPTIVE_MIN_BATCH_DAYS',
          0.05, // 1.2 hours minimum
        ),
        MAX_BATCH_DAYS: utils.configParser(
          sourceConfig,
          'number',
          'BLOCKCHAIN_LOG_CRAWLER_ADAPTIVE_MAX_BATCH_DAYS',
          365, // 1 year maximum
        ),
        REDUCTION_FACTOR: utils.configParser(
          sourceConfig,
          'number',
          'BLOCKCHAIN_LOG_CRAWLER_ADAPTIVE_REDUCTION_FACTOR',
          2, // Divide by 2 on error - faster recovery
        ),
        GROWTH_FACTOR: utils.configParser(
          sourceConfig,
          'number',
          'BLOCKCHAIN_LOG_CRAWLER_ADAPTIVE_GROWTH_FACTOR',
          1.5, // Multiply by 1.5 on consecutive successes - more conservative growth
        ),
        SUCCESS_THRESHOLD_FOR_GROWTH: utils.configParser(
          sourceConfig,
          'number',
          'BLOCKCHAIN_LOG_CRAWLER_ADAPTIVE_SUCCESS_THRESHOLD',
          3, // Grow after 3 consecutive successes - more stable
        ),
        DENSITY_THRESHOLDS: {
          VERY_HIGH: utils.configParser(
            sourceConfig,
            'number',
            'BLOCKCHAIN_LOG_CRAWLER_ADAPTIVE_DENSITY_VERY_HIGH',
            50, // > 50 events/block
          ),
          HIGH: utils.configParser(
            sourceConfig,
            'number',
            'BLOCKCHAIN_LOG_CRAWLER_ADAPTIVE_DENSITY_HIGH',
            10, // > 10 events/block
          ),
          MEDIUM: utils.configParser(
            sourceConfig,
            'number',
            'BLOCKCHAIN_LOG_CRAWLER_ADAPTIVE_DENSITY_MEDIUM',
            2, // > 2 events/block
          ),
          LOW: utils.configParser(
            sourceConfig,
            'number',
            'BLOCKCHAIN_LOG_CRAWLER_ADAPTIVE_DENSITY_LOW',
            0.5, // < 0.5 events/block
          ),
        },
      },
    },

    ETHERSCAN_API: {
      BASE_URI: utils.configParser(sourceConfig, 'string', 'ETHERSCAN_API_BASE_URL', 'https://api.etherscan.io/v2/api'),
      API_KEY: utils.configParser(sourceConfig, 'string', 'ETHERSCAN_API_KEY', null),
    },
    ROUTESCAN_API: {
      BASE_URI: utils.configParser(
        sourceConfig,
        'string',
        'ROUTESCAN_API_BASE_URL',
        'https://api.routescan.io/v2/network/mainnet/evm',
      ),
    },
    ZKSYNC_BLOCK_EXPLORER_API: {
      MAINNET_BASE_URI: utils.configParser(
        sourceConfig,
        'string',
        'ZKSYNC_BLOCK_EXPLORER_MAINNET_BASE_URI',
        'https://block-explorer-api.mainnet.zksync.io/api',
      ),
      SEPOLIA_BASE_URI: utils.configParser(
        sourceConfig,
        'string',
        'ZKSYNC_BLOCK_EXPLORER_SEPOLIA_BASE_URI',
        'https://block-explorer-api.sepolia.zksync.dev/api',
      ),
    },

    ALCHEMY_PRICE_API: {
      URI: utils.configParser(sourceConfig, 'string', 'ALCHEMY_PRICE_API_URI', 'https://api.g.alchemy.com/prices/v1'),
      API_KEY: utils.configParser(sourceConfig, 'string', 'ALCHEMY_PRICE_API_KEY', null),
    },

    NODES: {
      ETHEREUM_MAINNET: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ETHEREUM_MAINNET_ALCHEMY_API_KEY', null),
        DRPC_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ETHEREUM_MAINNET_DRPC_API_KEY', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_ETHEREUM_MAINNET_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_ETHEREUM_MAINNET_FROM_BLOCK', 16721812),
        OFFSET_TO_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_ETHEREUM_MAINNET_OFFSET_TO_BLOCK', 0),
        POOLING_INTERVAL: utils.configParser(
          sourceConfig,
          'number',
          'NODES_ETHEREUM_MAINNET_POOLING_INTERVAL',
          7 * 1000,
        ), // 5 seconds
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
      },
      ETHEREUM_SEPOLIA: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ETHEREUM_SEPOLIA_ALCHEMY_API_KEY', null),
        DRPC_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ETHEREUM_SEPOLIA_DRPC_API_KEY', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_ETHEREUM_SEPOLIA_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_ETHEREUM_SEPOLIA_FROM_BLOCK', 4415294),
        OFFSET_TO_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_ETHEREUM_SEPOLIA_OFFSET_TO_BLOCK', 0),
        POOLING_INTERVAL: utils.configParser(
          sourceConfig,
          'number',
          'NODES_ETHEREUM_SEPOLIA_POOLING_INTERVAL',
          7 * 1000,
        ), // 5 seconds
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
      },
      POLYGON_MAINNET: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_POLYGON_MAINNET_ALCHEMY_API_KEY', null),
        DRPC_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_POLYGON_MAINNET_DRPC_API_KEY', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_POLYGON_MAINNET_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_POLYGON_MAINNET_FROM_BLOCK', 40830344),
        OFFSET_TO_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_POLYGON_MAINNET_OFFSET_TO_BLOCK', 2),
        POOLING_INTERVAL: utils.configParser(
          sourceConfig,
          'number',
          'NODES_POLYGON_MAINNET_POOLING_INTERVAL',
          5 * 1000,
        ), // 5 seconds
        CONFIRMATION_BLOCKS: utils.configParser(sourceConfig, 'number', 'NODES_POLYGON_MAINNET_CONFIRMATION_BLOCKS', 1),
        INTERVAL_BLOCK_TIME: utils.configParser(sourceConfig, 'number', 'NODES_POLYGON_MAINNET_INTERVAL_BLOCK_TIME', 2),
      },
      BASE_MAINNET: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_BASE_MAINNET_ALCHEMY_API_KEY', null),
        DRPC_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_BASE_MAINNET_DRPC_API_KEY', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_BASE_MAINNET_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_BASE_MAINNET_FROM_BLOCK', 2094724),
        OFFSET_TO_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_BASE_MAINNET_OFFSET_TO_BLOCK', 4),
        POOLING_INTERVAL: utils.configParser(sourceConfig, 'number', 'NODES_BASE_MAINNET_POOLING_INTERVAL', 5 * 1000), // 5 seconds
        CONFIRMATION_BLOCKS: utils.configParser(sourceConfig, 'number', 'NODES_BASE_MAINNET_CONFIRMATION_BLOCKS', 1),
        INTERVAL_BLOCK_TIME: utils.configParser(sourceConfig, 'number', 'NODES_BASE_MAINNET_INTERVAL_BLOCK_TIME', 12),
      },
      ARBITRUM_MAINNET: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ARBITRUM_MAINNET_ALCHEMY_API_KEY', null),
        DRPC_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ARBITRUM_MAINNET_DRPC_API_KEY', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_ARBITRUM_MAINNET_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_ARBITRUM_MAINNET_FROM_BLOCK', 2441204),
        OFFSET_TO_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_ARBITRUM_MAINNET_OFFSET_TO_BLOCK', 4),
        POOLING_INTERVAL: utils.configParser(
          sourceConfig,
          'number',
          'NODES_ARBITRUM_MAINNET_POOLING_INTERVAL',
          5 * 1000,
        ), // 5 seconds
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
      },
      ZKSYNC_SEPOLIA: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ZKSYNC_SEPOLIA_ALCHEMY_API_KEY', null),
        DRPC_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ZKSYNC_SEPOLIA_DRPC_API_KEY', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_ZKSYNC_SEPOLIA_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_ZKSYNC_SEPOLIA_FROM_BLOCK', 37460765), // zkSync ERA
        OFFSET_TO_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_ZKSYNC_SEPOLIA_OFFSET_TO_BLOCK', 2),
        POOLING_INTERVAL: utils.configParser(sourceConfig, 'number', 'NODES_ZKSYNC_SEPOLIA_POOLING_INTERVAL', 5 * 1000), // 5 seconds
        CONFIRMATION_BLOCKS: utils.configParser(sourceConfig, 'number', 'NODES_ZKSYNC_SEPOLIA_CONFIRMATION_BLOCKS', 1),
        INTERVAL_BLOCK_TIME: utils.configParser(sourceConfig, 'number', 'NODES_ZKSYNC_SEPOLIA_INTERVAL_BLOCK_TIME', 3),
      },
      ZKSYNC_MAINNET: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ZKSYNC_MAINNET_ALCHEMY_API_KEY', null),
        DRPC_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_ZKSYNC_MAINNET_DRPC_API_KEY', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_ZKSYNC_MAINNET_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_ZKSYNC_MAINNET_FROM_BLOCK', 145462155),
        OFFSET_TO_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_ZKSYNC_MAINNET_OFFSET_TO_BLOCK', 2),
        POOLING_INTERVAL: utils.configParser(sourceConfig, 'number', 'NODES_ZKSYNC_MAINNET_POOLING_INTERVAL', 5 * 1000), // 5 seconds
        CONFIRMATION_BLOCKS: utils.configParser(sourceConfig, 'number', 'NODES_ZKSYNC_MAINNET_CONFIRMATION_BLOCKS', 1),
        INTERVAL_BLOCK_TIME: utils.configParser(sourceConfig, 'number', 'NODES_ZKSYNC_MAINNET_INTERVAL_BLOCK_TIME', 5),
      },
      PEAQ_MAINNET: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_PEAQ_MAINNET_ALCHEMY_API_KEY', null),
        DRPC_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_PEAQ_MAINNET_DRPC_API_KEY', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_PEAQ_MAINNET_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_PEAQ_MAINNET_FROM_BLOCK', 4032399),
        OFFSET_TO_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_PEAQ_MAINNET_OFFSET_TO_BLOCK', 4),
        POOLING_INTERVAL: utils.configParser(sourceConfig, 'number', 'NODES_PEAQ_MAINNET_POOLING_INTERVAL', 5 * 1000), // 5 seconds
        CONFIRMATION_BLOCKS: utils.configParser(sourceConfig, 'number', 'NODES_PEAQ_MAINNET_CONFIRMATION_BLOCKS', 1),
        INTERVAL_BLOCK_TIME: utils.configParser(sourceConfig, 'number', 'NODES_PEAQ_MAINNET_INTERVAL_BLOCK_TIME', 10),
        SUBSCAN_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_PEAQ_MAINNET_SUBSCAN_API_KEY', null),
        SUBSCAN_API_URL: utils.configParser(
          sourceConfig,
          'string',
          'NODES_PEAQ_MAINNET_SUBSCAN_API_URL',
          'https://peaq.api.subscan.io/',
        ),
      },
      OPTIMISM_MAINNET: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_OPTIMISM_MAINNET_ALCHEMY_API_KEY', null),
        DRPC_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_OPTIMISM_MAINNET_DRPC_API_KEY', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_OPTIMISM_MAINNET_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_OPTIMISM_MAINNET_FROM_BLOCK', 135600980),
        OFFSET_TO_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_OPTIMISM_MAINNET_OFFSET_TO_BLOCK', 4),
        POOLING_INTERVAL: utils.configParser(
          sourceConfig,
          'number',
          'NODES_OPTIMISM_MAINNET_POOLING_INTERVAL',
          5 * 1000,
        ), // 5 seconds
        CONFIRMATION_BLOCKS: utils.configParser(
          sourceConfig,
          'number',
          'NODES_OPTIMISM_MAINNET_CONFIRMATION_BLOCKS',
          1,
        ),
        INTERVAL_BLOCK_TIME: utils.configParser(
          sourceConfig,
          'number',
          'NODES_OPTIMISM_MAINNET_INTERVAL_BLOCK_TIME',
          5,
        ),
      },
      CHILIZ_MAINNET: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_CHILIZ_MAINNET_ALCHEMY_API_KEY', null),
        DRPC_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_CHILIZ_MAINNET_DRPC_API_KEY', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_CHILIZ_MAINNET_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_CHILIZ_MAINNET_FROM_BLOCK', 23759200),
        OFFSET_TO_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_CHILIZ_MAINNET_OFFSET_TO_BLOCK', 0),
        POOLING_INTERVAL: utils.configParser(sourceConfig, 'number', 'NODES_CHILIZ_MAINNET_POOLING_INTERVAL', 3 * 1000), // 5 seconds
        CONFIRMATION_BLOCKS: utils.configParser(sourceConfig, 'number', 'NODES_CHILIZ_MAINNET_CONFIRMATION_BLOCKS', 1),
        INTERVAL_BLOCK_TIME: utils.configParser(sourceConfig, 'number', 'NODES_CHILIZ_MAINNET_INTERVAL_BLOCK_TIME', 5),
      },
      CORN_MAINNET: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_CORN_MAINNET_ALCHEMY_API_KEY', null),
        DRPC_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_CORN_MAINNET_DRPC_API_KEY', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_CORN_MAINNET_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_CORN_MAINNET_FROM_BLOCK', 562229),
        OFFSET_TO_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_CORN_MAINNET_OFFSET_TO_BLOCK', 0),
        POOLING_INTERVAL: utils.configParser(sourceConfig, 'number', 'NODES_CORN_MAINNET_POOLING_INTERVAL', 10 * 1000),
        CONFIRMATION_BLOCKS: utils.configParser(sourceConfig, 'number', 'NODES_CORN_MAINNET_CONFIRMATION_BLOCKS', 1),
        INTERVAL_BLOCK_TIME: utils.configParser(sourceConfig, 'number', 'NODES_CORN_MAINNET_INTERVAL_BLOCK_TIME', 19),
      },
      AVAX_MAINNET: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_AVAX_MAINNET_ALCHEMY_API_KEY', null),
        DRPC_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_AVAX_MAINNET_DRPC_API_KEY', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_AVAX_MAINNET_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_AVAX_MAINNET_FROM_BLOCK', 66967621),
        OFFSET_TO_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_AVAX_MAINNET_OFFSET_TO_BLOCK', 3),
        POOLING_INTERVAL: utils.configParser(sourceConfig, 'number', 'NODES_AVAX_MAINNET_POOLING_INTERVAL', 3 * 1000),
        CONFIRMATION_BLOCKS: utils.configParser(sourceConfig, 'number', 'NODES_AVAX_MAINNET_CONFIRMATION_BLOCKS', 2),
        INTERVAL_BLOCK_TIME: utils.configParser(sourceConfig, 'number', 'NODES_AVAX_MAINNET_INTERVAL_BLOCK_TIME', 1),
      },
      KATANA_MAINNET: {
        ALCHEMY_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_KATANA_MAINNET_ALCHEMY_API_KEY', null),
        DRPC_API_KEY: utils.configParser(sourceConfig, 'string', 'NODES_KATANA_MAINNET_DRPC_API_KEY', null),
        ARAGON_RPC: utils.configParser(sourceConfig, 'string', 'NODES_KATANA_MAINNET_ARAGON_RPC', null),
        FROM_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_KATANA_MAINNET_FROM_BLOCK', 15080181),
        OFFSET_TO_BLOCK: utils.configParser(sourceConfig, 'number', 'NODES_KATANA_MAINNET_OFFSET_TO_BLOCK', 2),
        POOLING_INTERVAL: utils.configParser(sourceConfig, 'number', 'NODES_KATANA_MAINNET_POOLING_INTERVAL', 2 * 1000),
        CONFIRMATION_BLOCKS: utils.configParser(sourceConfig, 'number', 'NODES_KATANA_MAINNET_CONFIRMATION_BLOCKS', 1),
        INTERVAL_BLOCK_TIME: utils.configParser(sourceConfig, 'number', 'NODES_KATANA_MAINNET_INTERVAL_BLOCK_TIME', 1),
      },
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
        100,
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
      CHILIZ_MAX_CONCURRENT: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_CHILIZ_MAX_CONCURRENT', 1),
      CHILIZ_MIN_TIME: utils.configParser(sourceConfig, 'number', 'BOTTLENECK_CHILIZ_MIN_TIME', 5000),
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
      SYNC_MODELS: utils.configParser(sourceConfig, 'bool', 'MONGO_DB_SYNC_MODELS', false),
    },

    LOG: {
      LEVEL: utils.configParser(sourceConfig, 'string', 'LOG_LEVEL', 'verbose'),
      SENTRY_DSN: utils.configParser(sourceConfig, 'string', 'LOG_SENTRY_DSN', null),
      LOGZIO_KEY: utils.configParser(sourceConfig, 'string', 'LOG_LOGZIO_KEY', null),
      LOGZIO_HOST: utils.configParser(sourceConfig, 'string', 'LOG_LOGZIO_HOST', null),
      LOGZIO_SERVER_NAME: utils.configParser(sourceConfig, 'string', 'LOGZIO_SERVER_NAME', 'aragon-api'),
    },

    COINGECKO: {
      URI: utils.configParser(sourceConfig, 'string', 'COINGECKO_URI', 'https://api.coingecko.com/api/v3'),
      API_KEY: utils.configParser(sourceConfig, 'string', 'COINGECKO_API_KEY', null),
      DEAD_TOKEN_VOLUME_THRESHOLD: utils.configParser(
        sourceConfig,
        'number',
        'COINGECKO_DEAD_TOKEN_VOLUME_THRESHOLD',
        10,
      ),
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

    TENDERLY: {
      API_URL: utils.configParser(sourceConfig, 'string', 'TENDERLY_API_URL', 'https://api.tenderly.co/api/v1'),
      PROJECT: utils.configParser(sourceConfig, 'string', 'TENDERLY_PROJECT', null),
      USER: utils.configParser(sourceConfig, 'string', 'TENDERLY_USER', null),
      ACCESS_KEY: utils.configParser(sourceConfig, 'string', 'TENDERLY_ACCESS_KEY', null),
      MAX_CONCURRENT: utils.configParser(sourceConfig, 'number', 'TENDERLY_MAX_CONCURRENT', 1),
      MIN_TIME: utils.configParser(sourceConfig, 'number', 'TENDERLY_MIN_TIME', 3000),
      SHARING_BASE_URL: utils.configParser(sourceConfig, 'string', 'TENDERLY_SHARING_BASE_URL', 'https://www.tdly.co'),
      RE_SIMULATION_TIME: utils.configParser(sourceConfig, 'number', 'TENDERLY_RE_SIMULATION_TIME', 1000 * 60 * 10),
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
      ARAGON_DAO: {
        TOKEN_FETCH_INTERVAL: utils.configParser(
          sourceConfig,
          'number',
          'SERVICES_ARAGON_DAO_TOKEN_FETCH_INTERVAL',
          1000 * 15, // 30 seconds
        ),
      },
      ARAGON_API: {
        NAME: utils.configParser(sourceConfig, 'string', 'SERVICES_ARAGON_API_NAME', 'ARAGON-API'),
        BASE_URL: utils.configParser(sourceConfig, 'string', 'SERVICES_ARAGON_API_BASE_URL', 'http://localhost:3000'),
        PORT: utils.configParser(sourceConfig, 'number', 'SERVICES_ARAGON_API_PORT', 3000),
        TIMEOUT: utils.configParser(sourceConfig, 'number', 'SERVICES_ARAGON_API_TIMEOUT', 30), // seconds
      },

      ARAGON_ADMIN_API: {
        NAME: utils.configParser(sourceConfig, 'string', 'SERVICES_ARAGON_ADMIN_API_NAME', 'ARAGON-ADMIN-API'),
        BASE_URL: utils.configParser(
          sourceConfig,
          'string',
          'SERVICES_ARAGON_ADMIN_API_BASE_URL',
          'http://localhost:3001',
        ),
        PORT: utils.configParser(sourceConfig, 'number', 'SERVICES_ARAGON_ADMIN_API_PORT', 3001),
        TIMEOUT: utils.configParser(sourceConfig, 'number', 'SERVICES_ARAGON_ADMIN_API_TIMEOUT', 30), // 30 seconds
        JWT_KEY: utils.configParser(sourceConfig, 'string', 'SERVICES_ARAGON_ADMIN_API_JWT_KEY', 'JWT'),
        JWT_SECRET: utils.configParser(
          sourceConfig,
          'string',
          'SERVICES_ARAGON_ADMIN_API_JWT_SECRET',
          'xMfW0oMoc/vI9FNbnQS1rQVjkHWjrJCirKveuZu7bGg=', // used for testing
        ),
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
        REFRESH_SPAM_TOKENS_INTERVAL: utils.configParser(
          sourceConfig,
          'number',
          'SERVICES_ARAGON_RATES_REFRESH_SPAM_TOKENS_INTERVAL',
          24 * 60 * 60 * 1000,
        ), // 24 hours
        SPAM_SCORE_THRESHOLD: utils.configParser(
          sourceConfig,
          'number',
          'SERVICES_ARAGON_RATES_SPAM_SCORE_THRESHOLD',
          5,
        ),
        CMS_SPAM_TOKENS_URL: utils.configParser(
          sourceConfig,
          'string',
          'SERVICES_ARAGON_RATES_CMS_SPAM_TOKENS_URL',
          'https://raw.githubusercontent.com/aragon/app-cms/refs/heads/main/spam-tokens.json',
        ),
      },
    },

    CRAWLER_CONFIG: {
      // RATES
      TOKEN_RATES_BATCH_SIZE: utils.configParser(sourceConfig, 'number', 'INDEXER_CONFIG_TOKEN_RATES_BATCH_SIZE', 1000),
      TOKEN_RATES_CONCURRENCY: utils.configParser(sourceConfig, 'number', 'INDEXER_CONFIG_TOKEN_RATES_CONCURRENCY', 1),
      TOKEN_HOLDERS_THRESHOLD: utils.configParser(
        sourceConfig,
        'number',
        'INDEXER_CONFIG_TOKEN_HOLDERS_THRESHOLD',
        2000,
      ),
    },
  }
}

export { getConfigObject }
