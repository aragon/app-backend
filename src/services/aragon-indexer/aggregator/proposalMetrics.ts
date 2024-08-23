import logger from '@logger'
import { Models } from '@dbModels'
import DbOperations from '@models/utils/dbOperations'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:AggregatorProposalMetrics' })

export const AggregatorProposalMetrics = {
  proposalMultisigMetrics: async ({
    proposalId,
    pluginAddress,
    network,
  }: {
    proposalId: number
    pluginAddress: string
    network: string
  }) => {
    const proposal = await Models.Proposal.findByProposalId(proposalId, pluginAddress, network)

    if (!proposal) {
      logger.warn('Proposal not found - multisig metrics ', llo({ proposalId, pluginAddress, network }))
      return
    }

    const votes = await Models.Vote.findVotes({ proposalId, pluginAddress, network })

    const rawMetrics = {
      approvalReached: votes.length >= proposal.settings.minApprovals,
      metrics: {
        totalVotes: votes.length,
        missingVotes: votes.length - proposal.settings.minApprovals,
      },
    }
    return await DbOperations.updateDocument(
      proposal,
      rawMetrics,
      { logId: proposal.id },
      'Update multisig metrics',
      llo,
    )
  },

  // TODO: implement token voting metrics
  proposalTokenVotingMetrics: async ({
    proposalId,
    pluginAddress,
    network,
  }: {
    proposalId: number
    pluginAddress: string
    network: string
  }) => {
    const proposal = await Models.Proposal.findByProposalId(proposalId, pluginAddress, network)

    if (!proposal) {
      logger.warn('Proposal not found - multisig metrics ', llo({ proposalId, pluginAddress, network }))
      return
    }

    const votes = await Models.Vote.findVotes({ proposalId, pluginAddress, network })
    const members = await Models.DaoMemberMapping.findAllMembersOfPlugin({
      pluginAddress,
      network,
    })

    const rawMetrics = {
      approvalReached: votes.length >= proposal.settings.minApprovals,
      metrics: {
        totalVotes: votes.length,
        missingVotes: votes.length - members.length,
      },
    }
    return await DbOperations.updateDocument(
      proposal,
      rawMetrics,
      { logId: proposal.id },
      'Update token voting metrics',
      llo,
    )
  },
}
