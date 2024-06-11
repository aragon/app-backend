import { ConfigState } from '@state/configState'
import { type ISupportedNetwork, NetworksEnum } from '@types'

export const NetworkHelper = {
  supportedNetworks(): ISupportedNetwork[] {
    const networks = Object.values(NetworksEnum)

    const result = networks.reduce((acc: any, networkName) => {
      const provider = ConfigState.getInstance().getConfigItem(networkName)

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
}
