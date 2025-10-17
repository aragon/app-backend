import {
  type IAlchemyNodeConnection,
  type IAragonNodeConfig,
  type IConnectionType,
  type IAlchemyConfig,
  type IProviderProxy,
  IProviderType,
  type IRawNodeConfig,
  NetworksEnum,
} from '@types'
import { JsonRpcProvider } from 'ethers'
import { AlchemyNetwork, alchemyNetworkToUrl } from '@types'
import config from '@config'
import logger from '@logger'
import { type INodeConnection } from '@src/types/node'
import utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'modules:Provider' })

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
  },

  // Converts a config key to a NetworksEnum.
  parseNetwork: (network: string): NetworksEnum | undefined => {
    return ProviderModule.networksMap[network]
  },

  // Converts a NetworksEnum to the corresponding Alchemy network string.
  parseAlchemyNetwork: (network: NetworksEnum): AlchemyNetwork => {
    return ProviderModule.alchemyNetworksMap[network]
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
      }),
    )
  },

  async connectToNetwork(network: NetworksEnum, nodeConfig: IAlchemyConfig | IAragonNodeConfig) {
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
      const rpcProvider = new JsonRpcProvider(alchemyUrl)

      const alchemyConnection: IAlchemyNodeConnection = {
        rpc: rpcProvider,
      }
      ProviderModule.providerProxies[network].alchemy = alchemyConnection
    } else if (nodeConfig.providerType === IProviderType.ARAGON) {
      const aragonConfig = nodeConfig as IAragonNodeConfig
      const rpcProvider = new JsonRpcProvider(aragonConfig.rpcEndpoint)
      const aragonConnection: INodeConnection = {
        rpc: rpcProvider,
      }
      ProviderModule.providerProxies[network].aragon = aragonConnection
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

  async closeAllNetworks() {
    for (const network in ProviderModule.providerProxies) {
      delete ProviderModule.providerProxies[network as NetworksEnum]
    }
  },

  getProviderUrl(network: NetworksEnum): string | undefined {
    const providerProxy = ProviderModule.providerProxies[network]
    if (!providerProxy) return undefined

    // Check if we have an Aragon provider first (priority)
    if (providerProxy.aragon) {
      const networkKey = utils.networkToAragon(network)
      if (config.NODES?.[networkKey]) {
        return config.NODES[networkKey].ARAGON_RPC
      }
    }

    // Check if we have an Alchemy provider
    if (providerProxy.alchemy) {
      const alchemyNetwork = ProviderModule.parseAlchemyNetwork(network)
      const alchemyHost = alchemyNetworkToUrl[alchemyNetwork]
      if (alchemyHost) {
        const networkKey = utils.networkToAragon(network)
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
