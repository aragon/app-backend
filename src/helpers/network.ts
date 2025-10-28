import { type ISupportedNetwork, NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
import config from '@config'
import utils from '@helpers/utils'

export const NetworkHelper = {
  supportedNetworks(): ISupportedNetwork[] {
    const networks = Object.values(NetworksEnum)

    const result = networks.reduce((acc: any, networkName) => {
      const provider = ProviderModule.getAnyRpcProvider(networkName)
      if (provider) {
        const rawNetwork = {
          networkName,
          provider,
        }
        acc.push(rawNetwork)
      }

      return acc
    }, [])

    return result as ISupportedNetwork[]
  },
  getAverageBlockTime(network: NetworksEnum): number {
    const networkConfig = config.NODES[utils.networkToAragon(network)]
    return networkConfig.INTERVAL_BLOCK_TIME
  },
}
