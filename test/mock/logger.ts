const LoggerMock = {
  config: {
    MONGO_DB: { URI: 'mongodb://fake-mongo-user:fake-mongo%40password@db.example/test' },
    RABBITMQ: { URI: 'amqp://fake-rabbit-user:fake-rabbit-password@mq.example/vhost' },
    NODES: {
      ONE: {
        ALCHEMY_API_KEY: 'fake-api-long',
        DRPC_API_KEY: 'fake-drpc-key',
        ARAGON_RPC: 'https://rpc.example/fake-rpc-key',
      },
      TWO: { ALCHEMY_API_KEY: '', DRPC_API_KEY: null, ARAGON_RPC: undefined },
    },
    ALCHEMY_PRICE_API: { API_KEY: 'fake-price-key' },
    ANKR_CONFIG: { API_KEY: 'fake-ankr-key' },
    ETHERSCAN_API: { API_KEY: 'fake-explorer-key' },
    COINGECKO: { API_KEY: 'fake-api' },
    SAFE_API: { API_KEY: 'fake-safe-key' },
    TENDERLY: { ACCESS_KEY: 'fake-tenderly-key' },
    PINATA: { JWT: 'fake-pinata-"jwt"\\key' },
    SERVICES: {
      ARAGON_TELEGRAM: { BOT_TOKEN: 'fake-bot:token', USER_HASH_SECRET: 'fake-user-hash' },
      ARAGON_ADMIN_API: { JWT_SECRET: 'fake-admin-secret' },
    },
    LOG: { LOGZIO_KEY: 'fake-logzio-key' },
  },
  domainFields: {
    token: 'ordinary-token',
    key: 'ordinary-key',
    tokenAddress: '0xabc',
    tokenId: '123',
    tokenSymbol: 'TEST',
    keyId: '456',
    publicKey: 'ordinary-public-key',
  },
}

export default LoggerMock
