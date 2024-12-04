import { EnumConnection, type IService } from '@types'
import { Models } from '@dbModels'
import { ProposalHandler } from '@src/handlers/proposalHandler'
import ProviderModule from '@modules/provider'
import logger from '@logger'
const llo = logger.logMeta.bind(null, { service: 'tools:ManualSyncProposalAction' })
export const ToolsManualSyncProposalAction: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    await ProviderModule.connectToAllNetworks()
    // if the rawAction length is greator then 0
    const proposals = await Models.Proposal.aggregate([
      {
        $unwind: '$actions',
      },
      {
        $match: {
          'actions.type': {
            $in: ['UpdateMultiSigSettings', 'UpdateVoteSettings'],
          },
        },
      },
    ])

    logger.info('Total proposals found', llo({ count: proposals.length }))
    let i = 0
    for (const proposal of proposals) {
      const _proposal = await Models.Proposal.findOne({ _id: proposal._id })
      await ProposalHandler.parseActions(_proposal)
      i++
      logger.info('Proposal parsed', llo({ count: i }))
    }
  },

  stop: async () => {},
}

export default ToolsManualSyncProposalAction
