import { EnumConnection, type IService, NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import utils from '@helpers/utils'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

export const ToolsManualTrigger: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async () => {
    await ProviderModule.connectToAllNetworks()
    const network = NetworksEnum.peaqMainnet

    const address = '0xc554355ED7c1b435434a68EF54Aa24c229f36f1F'

    await DaoTransactions.start({
      daoAddress: address,
      network,
    })
  },

  stop: async () => {},
}

export default ToolsManualTrigger
