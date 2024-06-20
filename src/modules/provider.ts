import { WebSocketProvider } from 'ethers'
import config from '@config'
import logger from '@logger'
import { ConfigState } from '@state/configState'
import { NetworksEnum } from '@types'
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
        const provider: WebSocketProvider | any = new WebSocketProvider(nodeUrl)

        provider.websocket.on('open', async () => {
          logger.info(`WebSocket connected successfully to ${network}`)
          ProviderModule.configState.setConfigItem(network, provider)
          resolve(provider)
        })

        provider.websocket.on('close', () => {
          logger.error(`WebSocket connection closed unexpectedly for ${network}. Attempting to reconnect...`)
          ProviderModule.reconnectToNetwork(network, nodeUrl)
        })

        provider.websocket.on('error', (error: any) => {
          logger.error(
            'WebSocket error',
            llo({
              network,
              error,
            }),
          )
          reject(error)
        })
      } catch (error) {
        logger.error('Failed to create WebSocketProvider', llo({ network, error }))
        reject(error)
      }
    })
  },

  async reconnectToNetwork(network: NetworksEnum, nodeUrl: string, attempt = 0) {
    if (attempt >= config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS) {
      logger.error(`Max reconnect attempts reached for ${network}`)
      return
    }
    const delay = config.NODE_CONFIG.RECONNECT_INTERVAL * Math.pow(2, attempt)
    setTimeout(async () => {
      try {
        logger.info(`Reconnecting to ${network}... Attempt ${attempt + 1}`)
        await ProviderModule.connectToNetwork(network, nodeUrl)
      } catch (error) {
        logger.error(`Reconnection attempt ${attempt + 1} failed for ${network}`, llo({ error }))
        ProviderModule.reconnectToNetwork(network, nodeUrl, attempt + 1)
      }
    }, delay)
  },

  async closeAllNetworks() {
    const networks = Object.values(NetworksEnum)
    networks.map(async network => {
      const provider: WebSocketProvider = ProviderModule.configState.getConfigItem(network)
      if (provider) {
        await provider.destroy()
        logger.info(`WebSocket connection closed for ${network}`)
      }
    })
  },
}

export default ProviderModule
