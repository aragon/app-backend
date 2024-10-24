import { EnumConnection, type IService } from '@types'
import { Models } from '@dbModels'
import { ProposalHandler } from '@src/handlers/proposalHandler'
import ProviderModule from '@modules/provider'

export const ToolsManualSyncProposalAction: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    await ProviderModule.connectToAllNetworks()
    // if the rawAction length is greator then 0
    const proposals = await Models.Proposal.find({
      'rawActions.0': { $exists: true },
      'actions.type': { $in: ['MultisigAddMembers', 'MultisigRemoveMembers'] },
    })

    for (const proposal of proposals) {
      await ProposalHandler.parseActions(proposal)
    }
  },

  stop: async () => {},
}

export default ToolsManualSyncProposalAction
