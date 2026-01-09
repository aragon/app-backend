import { Models } from '@dbModels'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import { ProposalHandler } from '@src/handlers/proposalHandler'
import { EnumConnection, type IService } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Tools' })

export const SyncProposalIndex: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    await ProviderModule.connectToAllNetworks()

    const proposals = await Models.Proposal.find({
      incrementalId: null,
    })

    logger.info(`Found ${proposals.length} proposals with rawActions`, llo({ proposals: proposals.length }))

    for (const proposal of proposals) {
      const index = await ProposalHandler.findIncrementalId(proposal)
      proposal.incrementalId = index
      await proposal.save()
      logger.info(`Processed proposal ${proposal.id} with index ${index}`, llo({ proposal: proposal.id, index }))
    }
  },

  stop: async () => {},
}

export default SyncProposalIndex
