import { type IWebSocketProvider, NetworksEnum } from '@types'
import config from '@config'
import logger from '@logger'
import { ConfigState } from '@state/configState'
import { WebSocketProvider } from 'ethers'
import { assert } from '@errors'

const llo = logger.logMeta.bind(null, { service: 'modules:Provider' })

const ProviderModule = {
  configState: ConfigState.getInstance(),
  networksMap: {
    ETHEREUM_MAINNET: NetworksEnum.ethereumMainnet,
    ETHEREUM_SEPOLIA: NetworksEnum.ethereumSepolia,
    POLYGON_MAINNET: NetworksEnum.polygonMainnet,
    BASE_MAINNET: NetworksEnum.baseMainnet,
    ARBITRUM_MAINNET: NetworksEnum.arbitrumMainnet,
    ZKSYNC_SEPOLIA: NetworksEnum.zksyncSepolia,
    ZKSYNC_MAINNET: NetworksEnum.zksyncMainnet,
  },

  parseNetwork: (network: string) => {
    return ProviderModule.networksMap[network]
  },

  async connectToAllNetworks() {
    const networks = config.BLOCKCHAIN_NODES
    await Promise.all(
      Object.entries(networks).map(async ([network, nodeUrl]) => {
        try {
          assert(!!nodeUrl && nodeUrl.length > 0, 'Node URL is not configured')
          return ProviderModule.connectToNetwork(ProviderModule.parseNetwork(network) as NetworksEnum, nodeUrl!)
        } catch (error) {
          logger.warn(`Node URL for ${network} is not configured.`)
          return Promise.resolve()
        }
      }),
    )
  },

  async connectToNetwork(network: NetworksEnum, nodeUrl: string) {
    return new Promise((resolve, reject) => {
      try {
        const provider: IWebSocketProvider = new WebSocketProvider(nodeUrl)
        ProviderModule.attachEventListeners(provider, network, nodeUrl, resolve, reject) // it resolve inside
      } catch (error) {
        logger.error('Failed to create WebSocketProvider', llo({ network, error }))
        reject(error)
      }
    })
  },

  attachEventListeners(
    provider: IWebSocketProvider,
    network: NetworksEnum,
    nodeUrl: string,
    resolve?: any,
    reject?: any,
  ) {
    const handleOpen = async () => {
      logger.info(`WebSocket connected successfully to ${network}`)
      ProviderModule.configState.setConfigItem(network, provider)
      provider.websocket.removeEventListener('open', handleOpen)
      if (resolve) resolve(provider)
    }

    const handleClose = () => {
      logger.error(`WebSocket connection closed unexpectedly for ${network}. Attempting to reconnect...`)
      provider.websocket.removeEventListener('close', handleClose)
      ProviderModule.reconnectToNetwork(network, nodeUrl)
    }

    const handleError = (error: any) => {
      logger.error('WebSocket error', llo({ network, error }))
      provider.websocket.removeEventListener('error', handleError)
      if (reject) reject(error)
    }

    provider.websocket.addEventListener('open', handleOpen)
    provider.websocket.addEventListener('close', handleClose)
    provider.websocket.addEventListener('error', handleError)
  },

  async reconnectToNetwork(network: NetworksEnum, nodeUrl: string, attempt = 0): Promise<void> {
    if (attempt >= config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS) {
      logger.error(`Max reconnect attempts reached for ${network}`)
      return
      // throw new Error(`Max reconnect attempts reached for ${network}`);
    }
    const delay = config.NODE_CONFIG.RECONNECT_INTERVAL * Math.pow(2, attempt)
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        try {
          logger.info(`Reconnecting to ${network}... Attempt ${attempt + 1}`)
          await ProviderModule.connectToNetwork(network, nodeUrl)
          resolve()
        } catch (error) {
          logger.error(`Reconnection attempt ${attempt + 1} failed for ${network}`, llo({ error }))
          await ProviderModule.reconnectToNetwork(network, nodeUrl, attempt + 1)
            .then(resolve)
            .catch(reject)
        }
      }, delay)
    })
  },

  async closeAllNetworks() {
    const networks = Object.values(NetworksEnum)
    networks.map(async network => {
      const provider: IWebSocketProvider = ProviderModule.configState.getConfigItem(network)
      if (provider) {
        await provider.destroy()
        logger.info(`WebSocket connection closed for ${network}`)
      }
    })
  },
}

export default ProviderModule
