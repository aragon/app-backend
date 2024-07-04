import { WebSocketProvider } from 'ethers'
import config from '@config'
import logger from '@logger'
import { ConfigState } from '@state/configState'
import { NetworksEnum } from '@types'
import { assert } from '@errors'

const llo = logger.logMeta.bind(null, { service: 'modules:Provider' })

interface Provider extends WebSocketProvider {
  websocket: WebSocket
  pingInterval?: NodeJS.Timeout
  pongTimeout?: NodeJS.Timeout
}

const ProviderModule = {
  configState: ConfigState.getInstance(),
  networksMap: {
    [NetworksEnum.ethereumMainnet]: 'ETHEREUM_MAINNET',
    [NetworksEnum.ethereumSepolia]: 'ETHEREUM_SEPOLIA',
    [NetworksEnum.polygonMainnet]: 'POLYGON_MAINNET',
    [NetworksEnum.baseMainnet]: 'BASE_MAINNET',
    [NetworksEnum.arbitrumMainnet]: 'ARBITRUM_MAINNET',
    [NetworksEnum.zksyncSepolia]: 'ZKSYNC_SEPOLIA',
    [NetworksEnum.zksyncMainnet]: 'ZKSYNC_MAINNET',
  } as const,

  parseNetwork: (network: string): NetworksEnum => {
    const parsedNetwork = Object.entries(ProviderModule.networksMap).find(([, value]) => value === network)?.[0] as
      | NetworksEnum
      | undefined
    if (!parsedNetwork) {
      throw new Error(`Invalid network: ${network}`)
    }
    return parsedNetwork
  },

  async connectToAllNetworks(): Promise<void> {
    const networks = config.BLOCKCHAIN_NODES
    const connectionPromises = Object.entries(networks).map(async ([network, nodeUrl]) => {
      try {
        assert(!!nodeUrl && nodeUrl.length > 0, `Node URL for ${network} is not configured`)
        return await ProviderModule.connectToNetwork(ProviderModule.parseNetwork(network), nodeUrl!)
      } catch (error) {
        logger.error(`Failed to connect to ${network}`, llo({ error }))
        throw error
      }
    })

    try {
      await Promise.all(connectionPromises)
    } catch (error) {
      logger.error('Failed to connect to one or more networks', llo({ error }))
    }
  },

  async connectToNetwork(network: NetworksEnum, nodeUrl: string): Promise<Provider> {
    return new Promise((resolve, reject) => {
      let provider: Provider
      try {
        provider = new WebSocketProvider(nodeUrl) as Provider
      } catch (error) {
        logger.error('Failed to create WebSocketProvider', llo({ network, error }))
        reject(error)
        return
      }

      const cleanup = () => {
        provider.websocket.removeEventListener('open', handleOpen)
        provider.websocket.removeEventListener('close', handleClose)
        provider.websocket.removeEventListener('error', handleError)
        provider.websocket.removeEventListener('message', handleMessage)
        if (provider.pingInterval) clearInterval(provider.pingInterval)
        if (provider.pongTimeout) clearTimeout(provider.pongTimeout)
      }

      const startHeartbeat = () => {
        provider.pingInterval = setInterval(() => {
          if (provider.websocket.readyState === WebSocket.OPEN) {
            provider.websocket.send('ping')
            provider.pongTimeout = setTimeout(() => {
              logger.warn(`No pong received from ${network}, closing connection`)
              provider.websocket.close()
            }, 3000) // Wait 3 seconds for pong before closing
          }
        }, 5000) // Send ping every 5 seconds
      }

      const handleOpen = () => {
        logger.info(`WebSocket connected successfully to ${network}`)
        ProviderModule.configState.setConfigItem(network, provider)
        startHeartbeat()
        resolve(provider)
      }

      const handleClose = (event: CloseEvent) => {
        logger.error(`WebSocket connection closed for ${network}`, llo({ code: event.code, reason: event.reason }))
        cleanup()
        ProviderModule.reconnectToNetwork(network, nodeUrl)
      }

      const handleError = (error: Event) => {
        logger.error('WebSocket error', llo({ network, error }))
        cleanup()
        reject(error)
      }

      const handleMessage = (event: MessageEvent) => {
        if (event.data === 'pong') {
          if (provider.pongTimeout) clearTimeout(provider.pongTimeout)
        }
      }

      provider.websocket.addEventListener('open', handleOpen)
      provider.websocket.addEventListener('close', handleClose)
      provider.websocket.addEventListener('error', handleError)
      provider.websocket.addEventListener('message', handleMessage)
    })
  },

  async reconnectToNetwork(network: NetworksEnum, nodeUrl: string, attempt = 0): Promise<void> {
    const maxAttempts = config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS
    const baseInterval = config.NODE_CONFIG.RECONNECT_INTERVAL
    const maxDelay = 30000 // 30 seconds maximum delay

    if (attempt >= maxAttempts) {
      logger.error(`Max reconnect attempts reached for ${network}`)
      return
    }

    const delay = Math.min(baseInterval * Math.pow(2, attempt), maxDelay)
    await new Promise(resolve => setTimeout(resolve, delay))

    try {
      logger.info(`Reconnecting to ${network}... Attempt ${attempt + 1}`)
      await ProviderModule.connectToNetwork(network, nodeUrl)
    } catch (error) {
      logger.error(`Reconnection attempt ${attempt + 1} failed for ${network}`, llo({ error }))
      await ProviderModule.reconnectToNetwork(network, nodeUrl, attempt + 1)
    }
  },

  async closeAllNetworks(): Promise<void> {
    const networks = Object.values(NetworksEnum)
    const closePromises = networks.map(async network => {
      const provider: Provider | undefined = ProviderModule.configState.getConfigItem(network)
      if (provider) {
        try {
          if (provider.pingInterval) clearInterval(provider.pingInterval)
          if (provider.pongTimeout) clearTimeout(provider.pongTimeout)
          await provider.destroy()
          logger.info(`WebSocket connection closed for ${network}`)
        } catch (error) {
          logger.error(`Error closing WebSocket connection for ${network}`, llo({ error }))
        }
      }
    })

    await Promise.all(closePromises)
  },
}

export default ProviderModule
