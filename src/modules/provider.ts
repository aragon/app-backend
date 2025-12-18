import config from '@config'
import utils from '@helpers/utils'
import logger from '@logger'
import {
  AlchemyNetwork,
  alchemyNetworkToUrl,
  DrpcNetwork,
  drpcNetworkToUrl,
  type IAlchemyConfig,
  type IAragonNodeConfig,
  type IConnectionType,
  type IDrpcConfig,
  type IProviderProxy,
  IProviderType,
  type IRawNodeConfig,
  NetworksEnum,
} from '@types'
import { FetchRequest, JsonRpcProvider } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'modules:Provider' })

/**
 * Creates a JsonRpcProvider with custom fetch that logs raw response on parse failures
 */
function createLoggingProvider(url: string, network: NetworksEnum): JsonRpcProvider {
  const fetchRequest = new FetchRequest(url)

  fetchRequest.processFunc = async (request, response) => {
    const bodyText = response.bodyText
    const requestBody = request.body ? new TextDecoder().decode(request.body) : null

    if (bodyText) {
      try {
        JSON.parse(bodyText)
      } catch {
        logger.error(
          'RPC returned invalid JSON response',
          llo({
            network,
            url: url.replace(/[a-zA-Z0-9]{20,}/g, '***'),
            statusCode: response.statusCode,
            statusMessage: response.statusMessage,
            requestBody,
            responsePreview: bodyText.substring(0, 500),
            responseLength: bodyText.length,
          }),
        )
      }
    } else {
      logger.error(
        'RPC returned empty response',
        llo({
          network,
          url: url.replace(/[a-zA-Z0-9]{20,}/g, '***'),
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          requestBody,
        }),
      )
    }

    return response
  }

  return new JsonRpcProvider(fetchRequest, undefined, { staticNetwork: true })
}

const ProviderModule = {
  providerProxies: {} satisfies Record<NetworksEnum | string, IProviderProxy>,

  // Maps NetworksEnum values to Alchemy network identifiers.
  alchemyNetworksMap: {
    [NetworksEnum.ethereumMainnet]: AlchemyNetwork.ETH_MAINNET,
    [NetworksEnum.ethereumSepolia]: AlchemyNetwork.ETH_SEPOLIA,
    [NetworksEnum.polygonMainnet]: AlchemyNetwork.MATIC_MAINNET,
    [NetworksEnum.baseMainnet]: AlchemyNetwork.BASE_MAINNET,
    [NetworksEnum.arbitrumMainnet]: AlchemyNetwork.ARB_MAINNET,
    [NetworksEnum.zksyncSepolia]: AlchemyNetwork.ZKSYNC_SEPOLIA,
    [NetworksEnum.zksyncMainnet]: AlchemyNetwork.ZKSYNC_MAINNET,
    [NetworksEnum.optimismMainnet]: AlchemyNetwork.OPT_MAINNET,
    [NetworksEnum.chilizMainnet]: AlchemyNetwork.CHILIZ_MAINNET,
    [NetworksEnum.avaxMainnet]: AlchemyNetwork.AVAX_MAINNET,
  },

  // Maps NetworksEnum values to DRPC network identifiers.
  // Only networks supported by DRPC are mapped here.
  drpcNetworksMap: {
    [NetworksEnum.ethereumMainnet]: DrpcNetwork.ETH_MAINNET,
    [NetworksEnum.ethereumSepolia]: DrpcNetwork.ETH_SEPOLIA,
    [NetworksEnum.polygonMainnet]: DrpcNetwork.POLYGON_MAINNET,
    [NetworksEnum.baseMainnet]: DrpcNetwork.BASE_MAINNET,
    [NetworksEnum.arbitrumMainnet]: DrpcNetwork.ARB_MAINNET,
    [NetworksEnum.zksyncSepolia]: DrpcNetwork.ZKSYNC_SEPOLIA,
    [NetworksEnum.zksyncMainnet]: DrpcNetwork.ZKSYNC_MAINNET,
    [NetworksEnum.optimismMainnet]: DrpcNetwork.OPT_MAINNET,
    [NetworksEnum.avaxMainnet]: DrpcNetwork.AVAX_MAINNET,
    [NetworksEnum.katanaMainnet]: DrpcNetwork.KATANA_MAINNET,
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
    OPTIMISM_MAINNET: NetworksEnum.optimismMainnet,
    PEAQ_MAINNET: NetworksEnum.peaqMainnet,
    CHILIZ_MAINNET: NetworksEnum.chilizMainnet,
    CORN_MAINNET: NetworksEnum.cornMainnet,
    AVAX_MAINNET: NetworksEnum.avaxMainnet,
    KATANA_MAINNET: NetworksEnum.katanaMainnet,
  },

  networkChainMap: {
    [NetworksEnum.ethereumMainnet]: 1,
    [NetworksEnum.ethereumSepolia]: 11155111,
    [NetworksEnum.polygonMainnet]: 137,
    [NetworksEnum.baseMainnet]: 8453,
    [NetworksEnum.arbitrumMainnet]: 42161,
    [NetworksEnum.zksyncSepolia]: 300,
    [NetworksEnum.zksyncMainnet]: 324,
    [NetworksEnum.optimismMainnet]: 10,
    [NetworksEnum.peaqMainnet]: 3338,
    [NetworksEnum.chilizMainnet]: 88888,
    [NetworksEnum.cornMainnet]: 21000000,
    [NetworksEnum.avaxMainnet]: 43114,
    [NetworksEnum.katanaMainnet]: 747474,
  },

  // Converts a config key to a NetworksEnum.
  parseNetwork: (network: string): NetworksEnum | undefined => {
    return ProviderModule.networksMap[network]
  },

  // Converts a NetworksEnum to the corresponding Alchemy network string.
  parseAlchemyNetwork: (network: NetworksEnum): AlchemyNetwork => {
    return ProviderModule.alchemyNetworksMap[network]
  },

  // Converts a NetworksEnum to the corresponding DRPC network string.
  parseDrpcNetwork: (network: NetworksEnum): DrpcNetwork | undefined => {
    return ProviderModule.drpcNetworksMap[network]
  },

  getChainId: (network: NetworksEnum): number => {
    return ProviderModule.networkChainMap[network]
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

        if (rawConfig.ARAGON_RPC) {
          const aragonConfig: IAragonNodeConfig = {
            providerType: IProviderType.ARAGON,
            rpcEndpoint: rawConfig.ARAGON_RPC,
            fromBlock: rawConfig.FROM_BLOCK,
            confirmationBlocks: rawConfig.CONFIRMATION_BLOCKS,
            intervalBlockTime: rawConfig.INTERVAL_BLOCK_TIME,
          }
          await ProviderModule.connectToNetwork(networkEnum, aragonConfig)
        } else {
          logger.warn(`Custom (Aragon) node for ${networkEnum} is not configured.`, llo({ network: networkEnum }))
        }

        // Connect the DRPC node if an API key is provided and network is supported.
        if (rawConfig.DRPC_API_KEY) {
          const drpcNetwork = ProviderModule.parseDrpcNetwork(networkEnum)
          if (drpcNetwork) {
            const drpcConfig: IDrpcConfig = {
              providerType: IProviderType.DRPC,
              drpcApiKey: rawConfig.DRPC_API_KEY,
              fromBlock: rawConfig.FROM_BLOCK,
              confirmationBlocks: rawConfig.CONFIRMATION_BLOCKS,
              intervalBlockTime: rawConfig.INTERVAL_BLOCK_TIME,
            }
            await ProviderModule.connectToNetwork(networkEnum, drpcConfig)
          } else {
            logger.warn(`DRPC does not support network ${networkEnum}.`, llo({ network: networkEnum }))
          }
        } else {
          logger.warn(`DRPC node for ${networkEnum} is not configured.`, llo({ network: networkEnum }))
        }
      }),
    )
  },

  async connectToNetwork(network: NetworksEnum, nodeConfig: IAlchemyConfig | IAragonNodeConfig | IDrpcConfig) {
    ProviderModule.providerProxies[network] = ProviderModule.providerProxies[network] || {}

    if (nodeConfig.providerType === IProviderType.ALCHEMY) {
      const alchemyConfig = nodeConfig as IAlchemyConfig
      const alchemyNetwork = ProviderModule.parseAlchemyNetwork(network)
      const alchemyHost = alchemyNetworkToUrl[alchemyNetwork]

      if (!alchemyHost) {
        logger.warn(`Alchemy host not found for network ${alchemyNetwork}`, llo({ network }))
        return
      }

      const alchemyUrl = `https://${alchemyHost}/v2/${alchemyConfig.alchemyApiKey}`
      const rpcProvider = createLoggingProvider(alchemyUrl, network)

      ProviderModule.providerProxies[network].alchemy = { rpc: rpcProvider }
    } else if (nodeConfig.providerType === IProviderType.ARAGON) {
      const aragonConfig = nodeConfig as IAragonNodeConfig
      const rpcProvider = createLoggingProvider(aragonConfig.rpcEndpoint, network)

      ProviderModule.providerProxies[network].aragon = { rpc: rpcProvider }
    } else if (nodeConfig.providerType === IProviderType.DRPC) {
      const drpcConfig = nodeConfig as IDrpcConfig
      const drpcNetwork = ProviderModule.parseDrpcNetwork(network)

      if (!drpcNetwork) {
        logger.warn(`DRPC network not found for ${network}`, llo({ network }))
        return
      }

      const drpcUrl = drpcNetworkToUrl(drpcNetwork, drpcConfig.drpcApiKey)
      const rpcProvider = createLoggingProvider(drpcUrl, network)

      ProviderModule.providerProxies[network].drpc = { rpc: rpcProvider }
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
    // Priority order: aragon → drpc → alchemy
    if (providerProxy.aragon?.rpc) return providerProxy.aragon.rpc
    if (providerProxy.drpc?.rpc) return providerProxy.drpc.rpc
    if (providerProxy.alchemy?.rpc) return providerProxy.alchemy.rpc
    return undefined
  },

  async closeAllNetworks() {
    for (const network in ProviderModule.providerProxies) {
      delete ProviderModule.providerProxies[network as NetworksEnum]
    }
  },

  getProviderUrl(network: NetworksEnum): string | undefined {
    const providerProxy = ProviderModule.providerProxies[network]
    if (!providerProxy) return undefined

    const networkKey = utils.networkToAragon(network)

    // Priority order: aragon → drpc → alchemy
    // Check if we have an Aragon provider first (priority)
    if (providerProxy.aragon) {
      if (config.NODES?.[networkKey]) {
        return config.NODES[networkKey].ARAGON_RPC
      }
    }

    // Check if we have a DRPC provider
    if (providerProxy.drpc) {
      const drpcNetwork = ProviderModule.parseDrpcNetwork(network)
      const apiKey = config.NODES?.[networkKey]?.DRPC_API_KEY
      if (drpcNetwork && apiKey) {
        return drpcNetworkToUrl(drpcNetwork, apiKey)
      }
    }

    // Check if we have an Alchemy provider
    if (providerProxy.alchemy) {
      const alchemyNetwork = ProviderModule.parseAlchemyNetwork(network)
      const alchemyHost = alchemyNetworkToUrl[alchemyNetwork]
      if (alchemyHost) {
        const apiKey = config.NODES?.[networkKey]?.ALCHEMY_API_KEY
        if (apiKey) {
          return `https://${alchemyHost}/v2/${apiKey}`
        }
      }
    }

    return undefined
  },
}

export default ProviderModule
