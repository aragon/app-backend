import Bottleneck from 'bottleneck'
import config from '@config'
import { type NetworksEnum } from '@types'

class BottleneckModule {
  static limiters: { [key in NetworksEnum]?: Bottleneck } = {}

  static getLimiter(network: NetworksEnum) {
    if (!this.limiters[network]) {
      this.limiters[network] = new Bottleneck({
        maxConcurrent: config.BOTTLENECK.MAX_CONCURRENT, // Maximum number of concurrent requests
        minTime: config.BOTTLENECK.MIN_TIME, // Minimum time (ms) between requests
      })
    }
    return this.limiters[network]
  }
}

export default BottleneckModule
