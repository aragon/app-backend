import { WebSocketProvider } from 'ethers'
import config from '@config'
import logger from '@logger'
import { ConfigState } from '@state/configState'
import { type NetworksEnum } from '@types'

const logMeta = logger.logMeta.bind(null, { service: 'modules:Provider' })

const ProviderHelper = {
  configState: ConfigState.getInstance(),
  maxReconnectAttempts: 5,
  reconnectAttempts: {},
  networksMap: {
    MAINNET: 'mainnet',
    GOERLI: 'goerli',
    SEPOLIA: 'sepolia',
    POLYGON: 'polygon',
    MUMBAI: 'mumbai',
    BASE: 'base',
    BASE_GOERLI: 'baseGoerli',
    ARBITRUM: 'arbitrum',
    ARBITRUM_GOERLI: 'arbitrumGoerli',
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
          ProviderHelper.reconnectAttempts[network] = 0
          resolve(provider)
        }

        provider.websocket.onerror = error => {
          logger.error(
            `WebSocket error for ${network}`,
            logMeta({
              network,
              error,
            }),
          )
          ProviderHelper.scheduleReconnect(network, nodeUrl, reject)
        }
      } catch (error) {
        logger.error(
          `Failed to create WebSocketProvider for ${network}.`,
          logMeta({
            network,
            error,
          }),
        )
        ProviderHelper.scheduleReconnect(network, nodeUrl, reject)
      }
    })
  },

  scheduleReconnect(network: NetworksEnum, nodeUrl: string, reject: any) {
    if (ProviderHelper.reconnectAttempts[network] === undefined) {
      ProviderHelper.reconnectAttempts[network] = 0
    }
    if (ProviderHelper.reconnectAttempts[network] < ProviderHelper.maxReconnectAttempts) {
      const delay = Math.min(1000 * 2 ** ProviderHelper.reconnectAttempts[network], 30000) // Max 30s delay
      setTimeout(() => {
        ProviderHelper.reconnectAttempts[network]++
        ProviderHelper.connectToNetwork(network, nodeUrl).then(reject, reject)
      }, delay)
    } else {
      logger.error(`Max reconnection attempts reached for ${network}`, logMeta({ network }))
      reject(new Error(`Max reconnection attempts reached for ${network}`))
    }
  },
}

export default ProviderHelper
