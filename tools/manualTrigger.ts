import { EnumConnection, type IService, NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import utils from '@helpers/utils'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import { Models } from '@dbModels'
import { ProposalHandler } from '@handlers/proposalHandler'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

export const ToolsManualTrigger: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async () => {
    await ProviderModule.connectToAllNetworks()
    const network = NetworksEnum.polygonMainnet

    const address = '0x907bAab1aBF2D7a07DE1f1958a1afdDca28ad0E0'
    const proposals = await Models.Proposal.find({
      pluginAddress: address,
      network,
    }).sort({ incrementalId: 1 })
    if (proposals.length === 0) {
      llo('No proposals found')
      return
    }

    for (const proposal of proposals) {
      const incrementalId = await ProposalHandler.findIncrementalId(proposal)
      if (incrementalId !== proposal.incrementalId) {
        logger.info('Incremental ID mismatch', llo({ incrementalId, proposal }))
      } else {
        logger.info('Incremental ID match', llo({ incrementalId, proposal: proposal.id }))
      }
    }

    logger.info('Proposals Finished', llo({ proposalsCount: proposals.length }))
  },

  stop: async () => {},
}

export default ToolsManualTrigger
