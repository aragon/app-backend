import { WebSocketProvider } from 'ethers'
import config from '@config'
import logger from '@logger'
import { ConfigState } from '@state/configState'
import { type NetworksEnum } from '@types'

const logMeta = logger.logMeta.bind(null, { service: 'modules:Provider' })

const ProviderHelper = {
  configState: ConfigState.getInstance(),
  networksMap: {
    MAINNET: 'mainnet',
    SEPOLIA: 'sepolia',
    POLYGON: 'polygon',
    BASE: 'base',
    ARBITRUM: 'arbitrum',
  },

  parseNetwork: (network: string) => {
    return ProviderHelper.networksMap[network]
  },

  async connectToAllNetworks() {
    const networks = config.BLOCKCHAIN_NODES
    await Promise.all(
      Object.entries(networks).map(async ([network, nodeUrl]) => {
        if (nodeUrl) {
          return ProviderHelper.connectToNetwork(ProviderHelper.parseNetwork(network) as NetworksEnum, nodeUrl)
        } else {
          logger.warn(`Node URL for ${network} is not configured.`, logMeta({ network }))
          return Promise.resolve()
        }
      }),
    )
  },

  async connectToNetwork(network: NetworksEnum, nodeUrl: string) {
    return new Promise((resolve, reject) => {
      try {
        const provider = new WebSocketProvider(nodeUrl)

        provider.websocket.onopen = () => {
          logger.info(`WebSocket connected successfully to ${network}`, logMeta({ network }))
          ProviderHelper.configState.setConfigItem(network, provider)
          resolve(provider)
        }
        provider.websocket.onerror = error => {
          logger.error(
            'WebSocket error',
            logMeta({
              network,
              error,
            }),
          )
          reject(error)
        }
      } catch (error) {
        logger.error('Failed to create WebSocketProvider', logMeta({ network, error }))
        reject(error)
      }
    })
  },
}

export default ProviderHelper
