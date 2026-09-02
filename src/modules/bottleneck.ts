import config from '@config'
import { type NetworksEnum } from '@types'
import Bottleneck from 'bottleneck'

class BottleneckModule {
  static nodeLimiters: { [key in NetworksEnum]?: Bottleneck } = {}
  static transferLimiters: { [key in NetworksEnum]?: Bottleneck } = {}
  static coinGeckoLimiters: { [key in NetworksEnum]?: Bottleneck } = {}
  static fourBytesLimiters: { [key in NetworksEnum]?: Bottleneck } = {}
  static alchemyENSLimiters: { [key in NetworksEnum]?: Bottleneck } = {}
  static alchemyBalanceLimiters: { [key in NetworksEnum]?: Bottleneck } = {}
  static alchemyBathRequestLimiters: { [key in NetworksEnum]?: Bottleneck } = {}
  static etherScanLimiters: { [key in NetworksEnum]?: Bottleneck } = {}
  static routeScanLimiters: { [key in NetworksEnum]?: Bottleneck } = {}
  static chilizLimiters: { [key in NetworksEnum]?: Bottleneck } = {}
  static duneLimiters: { [key in NetworksEnum]?: Bottleneck } = {}
  static tenderlyLimiter: Bottleneck | null = null
  static crossChainGasLimiter: Bottleneck | null = null
  static telegramSearchLimiter: Bottleneck | null = null

  static getNodeLimiter(network: NetworksEnum) {
    if (!this.nodeLimiters[network]) {
      this.nodeLimiters[network] = new Bottleneck({
        maxConcurrent: config.BOTTLENECK.NODE_MAX_CONCURRENT, // Maximum number of concurrent requests
        minTime: config.BOTTLENECK.NODE_MIN_TIME, // Minimum time (ms) between requests
      })
    }
    return this.nodeLimiters[network]
  }

  static getNodeTransferLimiter(network: NetworksEnum) {
    if (!this.transferLimiters[network]) {
      this.transferLimiters[network] = new Bottleneck({
        maxConcurrent: config.BOTTLENECK.NODE_TRANSFER_MAX_CONCURRENT, // Maximum number of concurrent requests
        minTime: config.BOTTLENECK.NODE_TRANSFER_MIN_TIME, // Minimum time (ms) between requests
      })
    }
    return this.transferLimiters[network]
  }

  static getCoinGeckoLimiter(network: NetworksEnum) {
    if (!this.coinGeckoLimiters[network]) {
      this.coinGeckoLimiters[network] = new Bottleneck({
        maxConcurrent: config.BOTTLENECK.COINGECKO_MAX_CONCURRENT, // Maximum number of concurrent requests
        minTime: config.BOTTLENECK.COINGECKO_MIN_TIME, // Minimum time (ms) between requests
      })
    }
    return this.coinGeckoLimiters[network]
  }

  static get4ByteLimiter(network: NetworksEnum) {
    if (!this.fourBytesLimiters[network]) {
      this.fourBytesLimiters[network] = new Bottleneck({
        maxConcurrent: config.BOTTLENECK.FOUR_BYTE_MAX_CONCURRENT, // Maximum number of concurrent requests
        minTime: config.BOTTLENECK.FOUR_BYTE_MIN_TIME, // Minimum time (ms) between requests
      })
    }
    return this.fourBytesLimiters[network]
  }

  static getAlchemyENSLimiter(network: NetworksEnum) {
    if (!this.alchemyENSLimiters[network]) {
      this.alchemyENSLimiters[network] = new Bottleneck({
        maxConcurrent: config.BOTTLENECK.ALCHEMY_ENS_MAX_CONCURRENT, // Maximum number of concurrent requests
        minTime: config.BOTTLENECK.ALCHEMY_ENS_MIN_TIME, // Minimum time (ms) between requests
      })
    }
    return this.alchemyENSLimiters[network]
  }

  static getAlchemyBalanceLimiter(network: NetworksEnum) {
    if (!this.alchemyBalanceLimiters[network]) {
      this.alchemyBalanceLimiters[network] = new Bottleneck({
        maxConcurrent: config.BOTTLENECK.ALCHEMY_BALANCE_MAX_CONCURRENT, // Maximum number of concurrent requests
        minTime: config.BOTTLENECK.ALCHEMY_BALANCE_MIN_TIME, // Minimum time (ms) between requests
      })
    }
    return this.alchemyBalanceLimiters[network]
  }

  static getAlchemyBatchRequest(network: NetworksEnum) {
    if (!this.alchemyBathRequestLimiters[network]) {
      this.alchemyBathRequestLimiters[network] = new Bottleneck({
        maxConcurrent: config.BOTTLENECK.ALCHEMY_BATCH_REQUEST_MAX_CONCURRENT, // Maximum number of concurrent requests
        minTime: config.BOTTLENECK.ALCHEMY_BATCH_REQUEST_MIN_TIME, // Minimum time (ms) between requests
      })
    }
    return this.alchemyBathRequestLimiters[network]
  }

  static getEtherScanLimiter(network: NetworksEnum) {
    if (!this.etherScanLimiters[network]) {
      this.etherScanLimiters[network] = new Bottleneck({
        maxConcurrent: config.BOTTLENECK.ETHERSCAN_MAX_CONCURRENT, // Maximum number of concurrent requests
        minTime: config.BOTTLENECK.ETHERSCAN_MIN_TIME, // Minimum time (ms) between requests
      })
    }
    return this.etherScanLimiters[network]
  }

  static getRouteScanLimiter(network: NetworksEnum) {
    if (!this.routeScanLimiters[network]) {
      this.routeScanLimiters[network] = new Bottleneck({
        maxConcurrent: config.BOTTLENECK.ROUTESCAN_MAX_CONCURRENT,
        minTime: config.BOTTLENECK.ROUTESCAN_MIN_TIME,
      })
    }
    return this.routeScanLimiters[network]
  }

  static getChilizLimiter(network: NetworksEnum) {
    if (!this.chilizLimiters[network]) {
      this.chilizLimiters[network] = new Bottleneck({
        maxConcurrent: config.BOTTLENECK.NODE_MAX_CONCURRENT, // Maximum number of concurrent requests
        minTime: config.BOTTLENECK.NODE_MIN_TIME, // Minimum time (ms) between requests
      })
    }
    return this.chilizLimiters[network]
  }

  static getDuneLimiter(network: NetworksEnum) {
    if (!this.duneLimiters[network]) {
      this.duneLimiters[network] = new Bottleneck({
        maxConcurrent: 1, // Dune API has strict rate limits, process one at a time
        minTime: 1000, // 1 second between requests to avoid 429 errors
      })
    }
    return this.duneLimiters[network]
  }

  static getTenderlyLimiter() {
    if (!this.tenderlyLimiter) {
      this.tenderlyLimiter = new Bottleneck({
        maxConcurrent: config.TENDERLY.MAX_CONCURRENT,
        minTime: config.TENDERLY.MIN_TIME,
      })
    }
    return this.tenderlyLimiter
  }

  static getCrossChainGasLimiter() {
    if (!this.crossChainGasLimiter) {
      this.crossChainGasLimiter = new Bottleneck({
        maxConcurrent: config.CROSS_CHAIN_GAS.MAX_CONCURRENT,
        minTime: config.CROSS_CHAIN_GAS.MIN_TIME,
        // After this queue depth we reject instead of waiting. The API gives up after
        // `RABBITMQ.TIMEOUT`, so a job behind a longer queue would run, pay Tenderly, and reply to
        // nobody.
        highWater: config.CROSS_CHAIN_GAS.HIGH_WATER,
        strategy: Bottleneck.strategy.OVERFLOW,
      })
    }
    return this.crossChainGasLimiter
  }

  /** The bot's name search is an unindexed regex scan over Dao; past `highWater` new searches are rejected. */
  static getTelegramSearchLimiter() {
    if (!this.telegramSearchLimiter) {
      this.telegramSearchLimiter = new Bottleneck({
        maxConcurrent: config.BOTTLENECK.TELEGRAM_SEARCH_MAX_CONCURRENT,
        minTime: config.BOTTLENECK.TELEGRAM_SEARCH_MIN_TIME,
        highWater: config.BOTTLENECK.TELEGRAM_SEARCH_HIGH_WATER,
        strategy: Bottleneck.strategy.OVERFLOW,
      })
    }
    return this.telegramSearchLimiter
  }
}

export default BottleneckModule
