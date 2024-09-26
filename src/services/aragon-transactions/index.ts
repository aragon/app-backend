import logger from '@logger'
import { EnumConnection, type IService, type IWebSocketProvider, type NetworksEnum } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { NetworkHelper } from '@helpers/network'
import ProviderModule from '@modules/provider'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import { BlockHandler } from '@services/aragon-transactions/blockHandler'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

export interface IExtendedService extends IService {
  processNewBlock: (provider: IWebSocketProvider, blockNumber: number, network: NetworksEnum) => Promise<void>
}

const IndexerService: IExtendedService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async function () {
    logger.info('IndexerService started', llo({}))

    const networks = NetworkHelper.supportedNetworks()

    for (const { networkName } of networks) {
      const provider = ProviderModule.getProvider(networkName)
      if (!provider) {
        logger.error('Provider not available for network', llo({ network: networkName }))
        return
      }

      provider.on('block', async (blockNumber: number) => this.processNewBlock(provider, blockNumber, networkName))
      logger.verbose('Listening to new block events', llo({ network: networkName }))
    }
  },

  async stop() {
    const scheduler = TaskSchedulerState.getInstance()
    scheduler.stopTask('indexer')

    logger.info('IndexerService service stopped', llo({}))
  },

  async processNewBlock(provider: IWebSocketProvider, blockNumber: number, network: NetworksEnum) {
    try {
      const block = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network)!.schedule(async () => provider.getBlock(blockNumber)),
      )
      logger.verbose('New block', llo({ network, blockNumber }))
      await BlockHandler.processNewBlock(block, network)
    } catch (error) {
      logger.warn('Error fetching block data', llo({ network, blockNumber, error }))
    }
  },
}

export default IndexerService
