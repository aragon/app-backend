import { Models } from '@dbModels'
import { ProposalHandler } from '@handlers/proposalHandler'
import logger from '@logger'
import { EnumConnection, type IService, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'tool:fixSppPair' })

export const FixSppPair: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const parentProposals = await Models.Proposal.find({
      pluginSubdomain: 'spp',
      isSubProposal: false,
      stageIndex: { $exists: false },
    })

    if (!parentProposals || parentProposals.length === 0) {
      logger.info('No broken parent proposals found for SPP', llo())
      return
    }

    for (const proposalParent of parentProposals) {
      const info = {
        transactionHash: proposalParent.transactionHash,
        blockNumber: proposalParent.blockNumber,
        network: proposalParent.network as NetworksEnum,
        address: proposalParent.pluginAddress,
      }

      logger.info('Fixing SPP pair', llo({ info }))

      await ProposalHandler.pairSppProposals(
        proposalParent,
        await Models.Plugin.findOne({ address: proposalParent.pluginAddress, network: proposalParent.network }),
        info as any,
      )

      const parentProposal = await Models.Proposal.findOne({
        pluginSubdomain: 'spp',
        isSubProposal: false,
        pluginAddress: proposalParent.pluginAddress,
        proposalIndex: proposalParent.proposalIndex,
      })

      if (parentProposal && parentProposal.stageIndex !== undefined && parentProposal.subProposals?.length) {
        logger.info('SPP Stage Indexed Issue Fixed', llo({ info }))
      } else {
        logger.error('Failed to fix SPP stage index', llo({ info }))
      }
    }

    logger.info('End fixSppPair', llo())
  },

  stop: async () => {},
}

export default FixSppPair
