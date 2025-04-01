import { EnumConnection, type IService, NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import utils from '@helpers/utils'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import { ProposalHandler } from '@handlers/proposalHandler'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

export const ToolsManualTrigger: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async () => {
    await ProviderModule.connectToAllNetworks()
    /**
     * }
     * 2025-04-01T15:31:35.528Z [error] Error findIncrementalId not found
     * Detail : {
     *   "service": "service:indexer:handlers:ProposalHandler",
     *   "proposal": {
     *     "pluginAddress": "0x2F9B0d87E58F0ACa7Ce32542FdC3Eb8d1B98c7d1",
     *     "network": "ethereum-sepolia",
     *     "proposalIndex": "75975790735131048384706670536875920897828894933489266449233853750379578681547"
     *   },
     *   "environment": "testing",
     */

    const index = await ProposalHandler.findIncrementalId({
      pluginAddress: '0x2F9B0d87E58F0ACa7Ce32542FdC3Eb8d1B98c7d1',
      network: NetworksEnum.ethereumSepolia,
      proposalIndex: '75975790735131048384706670536875920897828894933489266449233853750379578681547',
    })

    console.log('index', index)
  },

  stop: async () => {},
}

export default ToolsManualTrigger
