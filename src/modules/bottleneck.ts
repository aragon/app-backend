import Bottleneck from 'bottleneck'
import config from '@config'
import { type NetworksEnum } from '@types'

class BottleneckModule {
  static nodeLimiters: { [key in NetworksEnum]?: Bottleneck } = {}
  static transferLimiters: { [key in NetworksEnum]?: Bottleneck } = {}

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
    if (!this.transferLimiters[network]) {
      this.transferLimiters[network] = new Bottleneck({
        maxConcurrent: config.BOTTLENECK.COINGECKO_MAX_CONCURRENT, // Maximum number of concurrent requests
        minTime: config.BOTTLENECK.COINGECKO_MIN_TIME, // Minimum time (ms) between requests
      })
    }
    return this.transferLimiters[network]
  }
}

export default BottleneckModule
