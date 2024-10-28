import { type IProviderProxy, NetworksEnum } from '@types'
import { Alchemy, type AlchemySettings, Network } from 'alchemy-sdk'
import config from '@config'
import logger from '@logger'
import { assert } from '@errors'
import { ethers } from 'ethers'

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
    const networks = config.NODES
    await Promise.all(
      Object.entries(networks).map(async item => {
        try {
          assert(item?.[1]?.WS?.length > 0, 'Node URL is not configured')
          return await ProviderModule.connectToNetwork(
            ProviderModule.parseNetwork(item[0]) as NetworksEnum,
            item?.[1]?.WS,
          )
        } catch (error) {
          logger.warn(`Node URL for ${ProviderModule.parseNetwork(item[0])} is not configured.`, llo())
          return Promise.resolve()
        }
      }),
    )
  },

  async connectToNetwork(network: NetworksEnum, nodeUrl: string) {
    try {
      const existingProxy = ProviderModule.providerProxies[network]

      const alchemySettings: AlchemySettings = {
        apiKey: nodeUrl.split('/v2/')[1],
        network: ProviderModule.parseAlchemyNetwork(network),
        maxRetries: 10,
      }
      const alchemy = new Alchemy(alchemySettings)
      const provider = alchemy.core

      const coreProvider = new ethers.WebSocketProvider(nodeUrl)

      ProviderModule.providerProxies[network] = {
        ...existingProxy,
        provider,
        alchemy,
        coreProvider,
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

  getCoreProvider(network: NetworksEnum) {
    const coreProvider = ProviderModule.providerProxies[network]?.coreProvider
    if (!coreProvider) {
      return
    }

    return coreProvider
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
