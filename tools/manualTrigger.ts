import { EnumConnection, type IService, NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import utils from '@helpers/utils'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

export const ToolsManualTrigger: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async () => {
    await ProviderModule.connectToAllNetworks()
    const network = NetworksEnum.ethereumSepolia

    const fromBlock = 7149126
    const toBlock = 'latest'
    const configLogs = utils.filterArrayByProperty(configIndexer, 'enableHistorical')

    const logCrawler = new BlockchainLogCrawler({
      fromBlock,
      toBlock,
      events: configLogs,
      network,
      onError: async (error: any) => logger.error('Error Indexer', llo(error)),
      logService: `indexer-${network}`,
      stopOnError: true,
    })

    await logCrawler.crawl()
  },

  stop: async () => {},
}

export default ToolsManualTrigger
