import { type IProviderProxy, NetworksEnum } from '@types'
import { Alchemy, type AlchemySettings, Network } from 'alchemy-sdk'
import config from '@config'
import logger from '@logger'
import { assert } from '@errors'

const llo = logger.logMeta.bind(null, { service: 'modules:Provider' })

const ProviderModule = {
  providerProxies: {} satisfies Record<string, IProviderProxy>,
  alchemyNetworksMap: {
    [NetworksEnum.ethereumMainnet]: Network.ETH_MAINNET,
    [NetworksEnum.ethereumSepolia]: Network.ETH_SEPOLIA,
    [NetworksEnum.polygonMainnet]: Network.MATIC_MAINNET,
    [NetworksEnum.baseMainnet]: Network.BASE_MAINNET,
    [NetworksEnum.arbitrumMainnet]: Network.ARB_MAINNET,
    [NetworksEnum.zksyncSepolia]: Network.ZKSYNC_SEPOLIA,
    [NetworksEnum.zksyncMainnet]: Network.ZKSYNC_MAINNET,
  },

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

  parseAlchemyNetwork: (network: string) => {
    return ProviderModule.alchemyNetworksMap[network]
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

      const alchemySettings: AlchemySettings = {
        apiKey: nodeUrl.split('/v2/')[1],
        network: ProviderModule.parseAlchemyNetwork(network),
        maxRetries: 10,
      }
      const alchemy = new Alchemy(alchemySettings)
      const provider = alchemy.core

      ProviderModule.providerProxies[network] = {
        ...existingProxy,
        provider,
        alchemy,
        subscriptions: existingSubscriptions,
      }

      ProviderModule.providerProxies[network].alchemy.ws.on('open', () => {
        logger.info(`WebSocket connected to ${network}`, llo({ network }))
      })

      ProviderModule.providerProxies[network].alchemy.ws.on('error', (error: any) => {
        logger.error('WebSocket error', llo({ network, error }))
      })

      ProviderModule.providerProxies[network].alchemy.ws.on('close', () => {
        logger.error(`WebSocket connection closed for ${network}`, llo({ network }))
      })
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

    return provider
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

    const alchemy = providerProxy?.alchemy
    alchemy?.ws?.on(filter, wrappedListener)
  },

  async closeAllNetworks() {
    for (const network in ProviderModule.providerProxies) {
      const providerProxy = ProviderModule.providerProxies[network]
      const provider = providerProxy?.provider
      if (provider) {
        delete ProviderModule.providerProxies[network]
        logger.info(`WebSocket connection closed for ${network}`, llo({ network }))
      }
    }
  },
}

export default ProviderModule
