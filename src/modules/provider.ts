import { type IProviderProxy, type IWebSocketProvider, IWebSocketStatus, NetworksEnum } from '@types'
import { WebSocketProvider } from 'ethers'
import config from '@config'
import logger from '@logger'
import { assert } from '@errors'
import Utils from '@helpers/utils'
import EventEmitter from 'events'

const llo = logger.logMeta.bind(null, { service: 'modules:Provider' })

const ProviderEvents = new EventEmitter()

const ProviderModule = {
  providerProxies: {} satisfies Record<string, IProviderProxy>,
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
      const existingProxy = ProviderModule.providerProxies[network]
      const existingSubscriptions = existingProxy?.subscriptions || []

      // Create a new provider with a custom WebSocket class for testing
      const provider = new WebSocketProvider(nodeUrl) as IWebSocketProvider

      // Update provider proxy while preserving existing properties
      ProviderModule.providerProxies[network] = {
        ...existingProxy,
        provider,
        reconnectAttempts: 0,
        subscriptions: existingSubscriptions,
      }

      // Add event listeners for the provider's WebSocket
      provider.websocket.addEventListener('open', () => {
        logger.info(`WebSocket connected to ${network}`, llo({ network }))
        ProviderModule.providerProxies[network].reconnectAttempts = 0
        ProviderModule.resubscribeEvents(network)
        ProviderEvents.emit('reconnected', network)
      })

      provider.websocket.addEventListener('error', (error: any) => {
        logger.error('WebSocket error', llo({ network, error }))
      })

      provider.websocket.addEventListener('close', () => {
        const attempts = ProviderModule.providerProxies[network].reconnectAttempts + 1
        ProviderModule.providerProxies[network].reconnectAttempts = attempts
        logger.error(
          `WebSocket connection closed for ${network}. Attempting to reconnect...`,
          llo({ network, attempts }),
        )
        ProviderModule.reconnectToNetwork(network, nodeUrl, attempts).catch(error => {
          logger.error('Reconnection failed', llo({ network, error }))
        })
      })

      // // Simulate disconnection after 5 seconds for testing purposes
      // // if (config.NODE_CONFIG.SIMULATE_DISCONNECT) {
      // setTimeout(() => {
      //   provider.websocket.close()
      //   logger.info('Programmatically closed WebSocket connection for testing', llo({ network }))
      // }, 1000 * 60) // Adjust the delay as needed
      // // }
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
          return async (...args: any[]) => {
            if (!ProviderModule.isConnectionOpen(network)) {
              await ProviderModule.waitForConnection(network)
            }
            return value.apply(target, args)
          }
        }
        return value
      },
    })
  },

  subscribeToEvent(network: NetworksEnum, filter: any, listener: any) {
    const providerProxy = ProviderModule.providerProxies[network]
    if (!providerProxy) {
      throw new Error(`Provider for network ${network} is not available`)
    }

    // Wrap the listener to handle errors and prevent duplication
    const wrappedListener = async (...args: any[]) => {
      try {
        await listener(...args)
      } catch (error) {
        logger.error('Error in event listener', llo({ network, error }))
        // Handle error appropriately
      }
    }

    // Store the wrapped listener
    providerProxy.subscriptions.push({ filter, listener: wrappedListener })

    const provider = providerProxy.provider
    provider.on(filter, wrappedListener)
  },

  async closeAllNetworks() {
    for (const network in ProviderModule.providerProxies) {
      const providerProxy = ProviderModule.providerProxies[network]
      const provider = providerProxy.provider
      if (provider) {
        provider.removeAllListeners()
        if (provider.destroy) {
          await provider.destroy()
        }
        delete ProviderModule.providerProxies[network]
        logger.info(`WebSocket connection closed and cleaned up for ${network}`, llo({ network }))
      }
    }
  },

  async reconnectToNetwork(network: NetworksEnum, nodeUrl: string, attempt = 0): Promise<void> {
    if (attempt >= config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS) {
      logger.error('Max reconnect attempts reached', llo({ network, attempt }))
      throw new Error(`Max reconnect attempts reached for ${network}`)
    }

    const delay = config.NODE_CONFIG.RECONNECT_INTERVAL * Math.pow(2, attempt)

    logger.info(
      `Reconnecting to ${network} after ${delay}ms... Attempt ${attempt + 1}`,
      llo({ network, attempt: attempt + 1, delay }),
    )

    await Utils.wait(delay)

    await ProviderModule.connectToNetwork(network, nodeUrl)
  },

  resubscribeEvents(network: NetworksEnum) {
    const providerProxy = ProviderModule.providerProxies[network]
    const provider = providerProxy.provider
    if (providerProxy.subscriptions.length > 0) {
      providerProxy.subscriptions.forEach((subscription: { filter: any; listener: any }) => {
        logger.verbose('Resubscribing to events', llo({ network, filter: subscription.filter }))
        provider.removeListener(subscription.filter, subscription.listener) // Remove existing listener
        provider.on(subscription.filter, subscription.listener) // Add listener
      })
    }
  },

  isConnectionOpen(network: NetworksEnum) {
    const provider = ProviderModule.providerProxies[network]?.provider
    return provider?.websocket && provider.websocket.readyState === IWebSocketStatus.OPEN
  },

  async waitForConnection(network: NetworksEnum) {
    while (!ProviderModule.isConnectionOpen(network)) {
      logger.debug('Waiting for connection to open', llo({ network }))
      await Utils.wait(1000)
    }
  },
}

export default ProviderModule
