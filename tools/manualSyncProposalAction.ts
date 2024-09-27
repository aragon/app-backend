import { EnumConnection, type IService } from '@types'
import { Models } from '@dbModels'
import { ProposalHandler } from '@indexer/handlers/proposalHandler'
import ProviderModule from '@modules/provider'

export const ToolsManualSyncProposalAction: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    await ProviderModule.connectToAllNetworks()

    const proposals = await Models.Proposal.find([])

    for (const proposal of proposals) {
      await ProposalHandler.parseActions(proposal)
    }
  },

  stop: async () => {},
}

export default ToolsManualSyncProposalAction
