import { type IProviderProxy, type IWebSocketProvider, IWebSocketStatus, NetworksEnum } from '@types'
import { WebSocketProvider } from 'ethers'
import config from '@config'
import logger from '@logger'
import { assert } from '@errors'
import Utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'modules:Provider' })

const ProviderModule = {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  providerProxies: {} as Record<string, IProviderProxy>,
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
          return await ProviderModule.connectToNetwork(ProviderModule.parseNetwork(network) as NetworksEnum, nodeUrl!)
        } catch (error) {
          logger.warn(`Node URL for ${network} is not configured.`, llo({ network }))
          return Promise.resolve()
        }
      }),
    )
  },

  async connectToNetwork(network: NetworksEnum, nodeUrl: string) {
    try {
      const provider = new WebSocketProvider(nodeUrl) as IWebSocketProvider
      ProviderModule.providerProxies[network] = {
        provider,
        reconnectAttempts: 0,
        subscriptions: [],
      }
      provider.websocket.addEventListener('open', () => {
        logger.info(`WebSocket connected to ${network}`)
        ProviderModule.providerProxies[network].reconnectAttempts = 0
      })
      provider.websocket.addEventListener('error', (error: any) =>
        logger.info('WebSocket error', llo({ network, error })),
      )
      provider.websocket.addEventListener('close', () => {
        const attempts = ProviderModule.providerProxies[network].reconnectAttempts + 1
        ProviderModule.providerProxies[network].reconnectAttempts = attempts
        logger.error(
          `WebSocket connection closed for ${network}. Attempting to reconnect...`,
          llo({ network, attempts }),
        )
        ProviderModule.reconnectToNetwork(network, nodeUrl, attempts)
      })
      ProviderModule.resubscribeEvents(network)
    } catch (error) {
      logger.error('Failed to create WebSocketProvider', llo({ network, error }))
      throw error
    }
  },

  getProvider(network: NetworksEnum) {
    const provider = ProviderModule.providerProxies[network]?.provider
    if (!provider) {
      return
    }

    return new Proxy(provider, {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver)

        if (typeof value === 'function') {
          // if (!ProviderModule.isConnectionOpen(network)) {
          //   await ProviderModule.waitForConnection(network)
          // }
          return value.bind(provider)
        }
        return value
      },
    })
  },

  subscribeToEvent(network: NetworksEnum, filter: any, listener: any) {
    ProviderModule.providerProxies[network].subscriptions.push({ filter, listener })

    const provider = ProviderModule.providerProxies[network].provider
    provider.on(filter, listener)
  },

  async closeAllNetworks() {
    const networks = Object.values(NetworksEnum)
    for (const network of networks) {
      const provider = ProviderModule.providerProxies[network]?.provider
      if (provider?.destroy) {
        await provider.destroy()
        logger.info(`WebSocket connection closed for ${network}`, llo({ network }))
      }
    }
  },

  async reconnectToNetwork(network: NetworksEnum, nodeUrl: string, attempt = 0): Promise<void> {
    if (attempt >= config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS) {
      logger.error('Max reconnect attempts reached', llo({ network, attempt }))
      throw new Error(`Max reconnect attempts reached for ${network}`)
    }
    const delay = config.NODE_CONFIG.RECONNECT_INTERVAL * Math.pow(2, attempt)
    await Utils.wait(delay)

    logger.info(`Reconnecting to ${network}... Attempt ${attempt + 1}`, llo({ network, attempt: attempt + 1 }))
    await ProviderModule.connectToNetwork(network, nodeUrl)
  },

  resubscribeEvents(network: NetworksEnum) {
    const provider = ProviderModule.providerProxies[network].provider
    if (ProviderModule.providerProxies[network].subscriptions.length > 0) {
      ProviderModule.providerProxies[network].subscriptions.forEach((subscription: { filter: any; listener: any }) => {
        logger.verbose('resubscribe events', llo({ network, filter: subscription.filter }))
        provider.on(subscription.filter, subscription.listener)
      })
    }
  },

  isConnectionOpen(network: NetworksEnum) {
    return (
      ProviderModule.providerProxies[network].provider?.websocket &&
      ProviderModule.providerProxies[network].provider?.websocket?.readyState === IWebSocketStatus.OPEN
    )
  },

  async waitForConnection(network: NetworksEnum) {
    while (!ProviderModule.isConnectionOpen(network)) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  },
}

export default ProviderModule
