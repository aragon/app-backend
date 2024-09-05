import { type IWebSocketProvider, NetworksEnum, type IProviderProxy } from '@types'
import { WebSocketProvider } from 'ethers'
import config from '@config'
import logger from '@logger'
import { assert } from '@errors'
import { createProviderProxy } from '@modules/proxyProvider'
import Utils from '@helpers/utils'
import EventEmitter from 'events'

const llo = logger.logMeta.bind(null, { service: 'modules:Provider' })

const providerEventEmitter = new EventEmitter()

const ProviderModule = {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  providerProxies: {} as Record<string, IProviderProxy>,

  eventEmitter: providerEventEmitter,
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
          logger.warn(`Node URL for ${network} is not configured.`, llo({ network }))
          return Promise.resolve()
        }
      }),
    )
  },

  async connectToNetwork(network: NetworksEnum, nodeUrl: string) {
    return new Promise((resolve, reject) => {
      try {
        const provider = new WebSocketProvider(nodeUrl) as IWebSocketProvider

        if (!ProviderModule.providerProxies[network]) {
          ProviderModule.providerProxies[network] = {
            provider: createProviderProxy(provider),
            reconnectAttempts: 0,
          }
        } else {
          ProviderModule.providerProxies[network].provider.updateProvider(provider)
        }
        ProviderModule.attachEventListeners(provider, network, nodeUrl, resolve, reject)
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
      ProviderModule.providerProxies[network].reconnectAttempts = 0
      logger.info(`WebSocket connected to ${network}`)
      ProviderModule.eventEmitter.emit('connected', network)
      if (resolve) resolve(provider)
    }

    const handleClose = async () => {
      const attempts = ProviderModule.providerProxies[network].reconnectAttempts + 1
      ProviderModule.providerProxies[network].reconnectAttempts = attempts
      logger.error(`WebSocket connection closed for ${network}. Attempting to reconnect...`, llo({ network, attempts }))
      await ProviderModule.reconnectToNetwork(network, nodeUrl, attempts, reject)
    }

    const handleError = async (error: any) => {
      logger.error('WebSocket error', llo({ network, error }))
    }

    provider.websocket.addEventListener('open', handleOpen)
    provider.websocket.addEventListener('close', handleClose)
    provider.websocket.addEventListener('error', handleError)
  },

  async reconnectToNetwork(network: NetworksEnum, nodeUrl: string, attempt = 0, reject: any): Promise<void> {
    if (attempt >= config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS) {
      logger.error('Max reconnect attempts reached', llo({ network, attempt }))
      return reject(new Error(`Max reconnect attempts reached for ${network}`))
    }
    const delay = config.NODE_CONFIG.RECONNECT_INTERVAL * Math.pow(2, attempt)
    await Utils.wait(delay)

    logger.info(`Reconnecting to ${network}... Attempt ${attempt + 1}`, llo({ network, attempt: attempt + 1 }))
    await ProviderModule.connectToNetwork(network, nodeUrl)
  },

  async closeAllNetworks() {
    const networks = Object.values(NetworksEnum)
    networks.map(async network => {
      const provider = ProviderModule.providerProxies[network].provider
      if (provider) {
        await provider.destroy()
        logger.info('WebSocket connection closed', llo({ network }))
      }
    })
  },

  getProvider(network: NetworksEnum): IWebSocketProvider | undefined {
    return ProviderModule.providerProxies[network]?.provider
  },
}

export default ProviderModule
