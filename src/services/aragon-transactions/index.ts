import logger from '@logger'
import { EnumConnection, type IService, type NetworksEnum } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { NetworkHelper } from '@helpers/network'
import ProviderModule from '@modules/provider'
import { BlockHandler } from '@services/aragon-transactions/blockHandler'
import Web3Helper from '@helpers/web3'
import utils from '@helpers/utils'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

export interface IExtendedService extends IService {
  processNewBlock: (blockNumber: number, network: NetworksEnum) => Promise<void>
}

const AragonTransactionsService: IExtendedService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async function () {
    logger.info('IndexerService started', llo({}))

    const networks = NetworkHelper.supportedNetworks()

    for (const { networkName } of networks) {
      const provider = ProviderModule.getAnyRpcProvider(networkName)
      if (!provider) {
        logger.error('Provider not available for network', llo({ network: networkName }))
        return
      }

      ProviderModule.subscribeToNewBlock(networkName, async (blockNumber: number) =>
        AragonTransactionsService.processNewBlock(blockNumber, networkName),
      )

      logger.verbose('Listening to new block events', llo({ network: networkName }))
    }
  },

  async stop() {
    const scheduler = TaskSchedulerState.getInstance()
    scheduler.stopTask('indexer')

    logger.info('IndexerService service stopped', llo({}))
  },

  async processNewBlock(blockNumber: number, network: NetworksEnum) {
    await utils.wait(
      config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME * 1000 * config.CONFIRMATION_BLOCKS,
    )
    const block = await Web3Helper.getBlock(blockNumber, network)
    if (!block) {
      logger.error('Error fetching block data', llo({ network, blockNumber, block }))
      return
    }
    await BlockHandler.processNewBlock(block, network)
  },
}

export default AragonTransactionsService
