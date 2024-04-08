import { WebSocketProvider } from 'ethers'
import config from '@config'
import logger from '@logger'
import { ConfigState } from '@state/configState'
import { type NetworksEnum } from '@types'

const logMeta = logger.logMeta.bind(null, { service: 'modules:Provider' })

const ProviderModule = {
  configState: ConfigState.getInstance(),
  networksMap: {
    MAINNET: 'mainnet',
    SEPOLIA: 'sepolia',
    POLYGON: 'polygon',
    BASE: 'base',
    ARBITRUM: 'arbitrum',
  },

  parseNetwork: (network: string) => {
    return ProviderModule.networksMap[network]
  },

  async connectToAllNetworks() {
    const networks = config.BLOCKCHAIN_NODES
    await Promise.all(
      Object.entries(networks).map(async ([network, nodeUrl]) => {
        if (nodeUrl) {
          return ProviderModule.connectToNetwork(ProviderModule.parseNetwork(network) as NetworksEnum, nodeUrl)
        } else {
          logger.warn(`Node URL for ${network} is not configured.`, logMeta({ network }))
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
          logger.info(`WebSocket connected successfully to ${network}`, logMeta({ network }))
          ProviderModule.configState.setConfigItem(network, provider)
          resolve(provider)
        })

        provider.websocket.on('error', (error: any) => {
          logger.error(
            'WebSocket error',
            logMeta({
              network,
              error,
            }),
          )
          reject(error)
        })
      } catch (error) {
        logger.error('Failed to create WebSocketProvider', logMeta({ network, error }))
        reject(error)
      }
    })
  },
}

export default ProviderModule
