import { EnumConnection, type IService } from '@types'
import { Models } from '@dbModels'
import { ProposalHandler } from '@src/handlers/proposalHandler'
import ProviderModule from '@modules/provider'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'Tools' })

export const ToolsManualSyncProposalAction: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    await ProviderModule.connectToAllNetworks()
    // if the rawAction length is greator then 0
    const proposals = await Models.Proposal.find({
      'actions.type': 'MetadataUpdate',
    })

    logger.info(`Found ${proposals.length} proposals with rawActions`, llo({ proposals: proposals.length }))
    let counter = 0
    for (const proposal of proposals) {
      counter++
      await ProposalHandler.parseActions(proposal)
      logger.info(`Processed ${counter} proposals`, llo({ counter, remaining: proposals.length - counter }))
    }
  },

  stop: async () => {},
}

export default ToolsManualSyncProposalAction
