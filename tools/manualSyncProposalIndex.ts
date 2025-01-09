import { EnumConnection, type IService } from '@types'
import { Models } from '@dbModels'
import { ProposalHandler } from '@src/handlers/proposalHandler'
import ProviderModule from '@modules/provider'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'Tools' })

export const ToolsManualSyncProposalIndex: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    await ProviderModule.connectToAllNetworks()

    const proposals = await Models.Proposal.find({ incrementalId: { $eq: null } }).sort({
      blockNumber: -1,
    })

    logger.info(`Found ${proposals.length} proposals with rawActions`, llo({ proposals: proposals.length }))

    for (const proposal of proposals) {
      const index = await ProposalHandler.findIncrementalId(proposal)
      if (index !== false) {
        proposal.incrementalId = index
        await proposal.save()
        logger.info(`Processed proposal ${proposal.id} with index ${index}`, llo({ proposal: proposal.id, index }))
      } else {
        logger.warn(`Failed to process proposal ${proposal.id}`, llo({ proposal: proposal.id }))
      }
    }
  },

  stop: async () => {},
}

export default ToolsManualSyncProposalIndex
