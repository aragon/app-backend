import config from '@config'
import utils from '@helpers/utils'
import ProviderModule from '@modules/provider'
import { type ISupportedNetwork, NetworksEnum } from '@types'

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

  getWorkerNetworks(): ISupportedNetwork[] {
    const all = NetworkHelper.supportedNetworks()
    const workerId = process.env.WORKER_ID
    const workerFilter = process.env.WORKER_NETWORKS
    if (!workerId || !workerFilter) return all
    const allowed = new Set(
      workerFilter
        .split(',')
        .map(n => n.trim())
        .filter(Boolean),
    )
    return all.filter(n => allowed.has(n.networkName))
  },
  getAverageBlockTime(network: NetworksEnum): number {
    const networkConfig = config.NODES[utils.networkToAragon(network)]
    return networkConfig.INTERVAL_BLOCK_TIME
  },
}
