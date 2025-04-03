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
import { Alchemy, type AlchemySettings, Network } from 'alchemy-sdk'
import config from '@config'
import logger from '@logger'
import { type INodeConnection } from '@src/types/node'

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
}

export default ProviderModule
