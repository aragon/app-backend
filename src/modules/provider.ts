import {
  type IAlchemyConfig,
  type IAlchemyNodeConnection,
  type IAragonNodeConfig,
  type IConnectionType,
  type IProviderProxy,
  IProviderType,
  type IRawNodeConfig,
  NetworksEnum,
} from '@types'
import { JsonRpcProvider } from 'ethers'
import { Alchemy, type AlchemySettings, Network } from 'alchemy-sdk'
import config from '@config'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'modules:Provider' })

const ProviderModule = {
  providerProxies: {} satisfies Record<NetworksEnum | string, IProviderProxy>,

  // Maps NetworksEnum values to Alchemy SDK network identifiers.
  alchemyNetworksMap: {
    [NetworksEnum.ethereumMainnet]: Network.ETH_MAINNET,
    [NetworksEnum.ethereumSepolia]: Network.ETH_SEPOLIA,
    [NetworksEnum.polygonMainnet]: Network.MATIC_MAINNET,
    [NetworksEnum.baseMainnet]: Network.BASE_MAINNET,
    [NetworksEnum.arbitrumMainnet]: Network.ARB_MAINNET,
    [NetworksEnum.zksyncSepolia]: Network.ZKSYNC_SEPOLIA,
    [NetworksEnum.zksyncMainnet]: Network.ZKSYNC_MAINNET,
  },

  // Maps raw config keys to your NetworksEnum.
  networksMap: {
    ETHEREUM_MAINNET: NetworksEnum.ethereumMainnet,
    ETHEREUM_SEPOLIA: NetworksEnum.ethereumSepolia,
    POLYGON_MAINNET: NetworksEnum.polygonMainnet,
    BASE_MAINNET: NetworksEnum.baseMainnet,
    ARBITRUM_MAINNET: NetworksEnum.arbitrumMainnet,
    ZKSYNC_SEPOLIA: NetworksEnum.zksyncSepolia,
    ZKSYNC_MAINNET: NetworksEnum.zksyncMainnet,
    PEAQ_MAINNET: NetworksEnum.peaqMainnet,
  },

  // Converts a config key to a NetworksEnum.
  parseNetwork: (network: string): NetworksEnum | undefined => {
    return ProviderModule.networksMap[network]
  },

  // Converts a NetworksEnum to the corresponding Alchemy SDK Network.
  parseAlchemyNetwork: (network: NetworksEnum): Network => {
    return ProviderModule.alchemyNetworksMap[network]
  },

  async connectToAllNetworks() {
    const rawNodes = config.NODES as Record<string, IRawNodeConfig>
    await Promise.all(
      Object.entries(rawNodes).map(async ([networkKey, rawConfig]) => {
        const networkEnum = ProviderModule.networksMap[networkKey] || ProviderModule.parseNetwork(networkKey)
        if (!networkEnum) {
          logger.warn(`Network key ${networkKey} is not mapped to a valid NetworksEnum`, llo())
          return
        }

        // Connect the Alchemy node if an API key is provided.
        if (rawConfig.ALCHEMY_API_KEY) {
          const alchemyConfig: IAlchemyConfig = {
            providerType: IProviderType.ALCHEMY,
            alchemyApiKey: rawConfig.ALCHEMY_API_KEY,
            fromBlock: rawConfig.FROM_BLOCK,
            confirmationBlocks: rawConfig.CONFIRMATION_BLOCKS,
            intervalBlockTime: rawConfig.INTERVAL_BLOCK_TIME,
          }
          await ProviderModule.connectToNetwork(networkEnum, alchemyConfig)
        } else {
          logger.warn(`Alchemy node for ${networkEnum} is not configured.`, llo({ network: networkEnum }))
        }

        // Connect the Aragon node if both WS and RPC endpoints are provided.
        if (rawConfig.ARAGON_WS && rawConfig.ARAGON_RPC) {
          const aragonConfig: IAragonNodeConfig = {
            providerType: IProviderType.ARAGON,
            wsEndpoint: rawConfig.ARAGON_WS,
            rpcEndpoint: rawConfig.ARAGON_RPC,
            fromBlock: rawConfig.FROM_BLOCK,
            confirmationBlocks: rawConfig.CONFIRMATION_BLOCKS,
            intervalBlockTime: rawConfig.INTERVAL_BLOCK_TIME,
          }
          await ProviderModule.connectToNetwork(networkEnum, aragonConfig)
        } else {
          logger.warn(`Custom (Aragon) node for ${networkEnum} is not configured.`, llo({ network: networkEnum }))
        }
      }),
    )
  },

  async connectToNetwork(network: NetworksEnum, nodeConfig: IAlchemyConfig | IAragonNodeConfig) {
    ProviderModule.providerProxies[network] = ProviderModule.providerProxies[network] || {}

    if (nodeConfig.providerType === IProviderType.ALCHEMY) {
      const alchemyConfig = nodeConfig as IAlchemyConfig
      const alchemySettings: AlchemySettings = {
        apiKey: alchemyConfig.alchemyApiKey!,
        network: ProviderModule.parseAlchemyNetwork(network),
        maxRetries: 10,
      }

      const alchemyConnection: any = new Alchemy(alchemySettings) as IAlchemyNodeConnection
      alchemyConnection.rpc = alchemyConnection.core

      ProviderModule.providerProxies[network].alchemy = alchemyConnection
    } else if (nodeConfig.providerType === IProviderType.ARAGON) {
      const aragonConfig = nodeConfig as IAragonNodeConfig

      const rpcProvider = aragonConfig.rpcEndpoint ? new JsonRpcProvider(aragonConfig.rpcEndpoint) : null
      ProviderModule.providerProxies[network].aragon = {
        rpc: rpcProvider,
      }
    }
  },

  getProvider(network: NetworksEnum, providerType: IProviderType, connectionType?: IConnectionType): any {
    const providerConnection = ProviderModule.providerProxies[network]?.[providerType]
    if (!providerConnection) return
    return connectionType ? providerConnection[connectionType] : providerConnection
  },

  getAnyRpcProvider(network: NetworksEnum): any {
    const providerProxy = ProviderModule.providerProxies[network]
    if (!providerProxy) return
    if (providerProxy.aragon?.rpc) return providerProxy.aragon.rpc
    if (providerProxy.alchemy?.rpc) return providerProxy.alchemy.rpc
    return undefined
  },

  subscribeToEvent(
    network: NetworksEnum,
    filter: any,
    listener: (...args: any[]) => Promise<any>,
    providerType?: IProviderType,
  ): void {
    let providerConnection: { ws: { on: (arg0: any, arg1: (...args: any[]) => Promise<void>) => void } }
    if (providerType) {
      providerConnection = ProviderModule.providerProxies[network]?.[providerType]
    } else {
      // No provider type passed: try Aragon first, then Alchemy.
      providerConnection =
        ProviderModule.providerProxies[network]?.aragon || ProviderModule.providerProxies[network]?.alchemy
    }
    if (!providerConnection?.ws) {
      throw new Error(
        `No websocket provider available for network ${network}${providerType ? ` (provider: ${providerType})` : ''}`,
      )
    }
    const wrappedListener = async (...args: any[]) => {
      try {
        await listener(...args)
      } catch (error) {
        logger.error('Error in event listener', llo({ network, error }))
      }
    }
    providerConnection.ws.on(filter, wrappedListener)
  },

  subscribeToNewBlock(network: NetworksEnum, listener: (...args: any[]) => void, providerType?: IProviderType) {
    if (providerType) {
      // Use the specified provider type
      const providerConnection = ProviderModule.providerProxies[network]?.[providerType]
      if (!providerConnection?.ws) {
        throw new Error(`Provider ${providerType} for network ${network} is not available`)
      }
      providerConnection.ws.on('block', listener)
    } else {
      // No provider type specified; try Aragon first, then Alchemy
      const providerProxy = ProviderModule.providerProxies[network]
      if (providerProxy?.aragon?.ws) {
        if (network === NetworksEnum.peaqMainnet) {
          providerProxy.aragon.api.rpc.chain.subscribeNewHeads((lastHeader: any) =>
            listener(lastHeader?.number?.toNumber()),
          )
        } else {
          providerProxy.aragon.ws.on('block', listener)
        }
      } else if (providerProxy?.alchemy?.ws) {
        providerProxy.alchemy.ws.on('block', listener)
      } else {
        throw new Error(`No websocket provider available for network ${network}`)
      }
    }
  },

  setupWSListeners(ws: any, providerLabel: IProviderType, network: NetworksEnum) {
    ws.on('open', () => {
      logger.info(`WebSocket connected to ${network} (${providerLabel})`, llo({ network }))
    })
    ws.on('error', (error: any) => {
      logger.error(`WebSocket error on ${network} (${providerLabel})`, llo({ network, error }))
    })
    ws.on('close', () => {
      logger.error(`WebSocket connection closed for ${network} (${providerLabel})`, llo({ network }))
    })
  },

  async closeAllNetworks() {
    for (const network in ProviderModule.providerProxies) {
      const proxy = ProviderModule.providerProxies[network as NetworksEnum]
      if (proxy.alchemy?.ws && typeof proxy.alchemy.ws.close === 'function') {
        try {
          proxy.alchemy.ws.close()
          logger.info(`Alchemy WebSocket connection closed for ${network}`, llo({ network }))
        } catch (error) {
          logger.error(`Error closing Alchemy WebSocket for ${network}`, llo({ network, error }))
        }
      }
      if (proxy.aragon?.ws && typeof proxy.aragon.ws.destroy === 'function') {
        try {
          proxy.aragon.ws.destroy()
          logger.info(`Aragon WebSocket connection closed for ${network}`, llo({ network }))
        } catch (error) {
          logger.error(`Error closing Aragon WebSocket for ${network}`, llo({ network, error }))
        }
      }
      delete ProviderModule.providerProxies[network as NetworksEnum]
    }
  },
}

export default ProviderModule
