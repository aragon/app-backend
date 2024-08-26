import logger from '@logger'
import { Models } from '@dbModels'
import DbOperations from '@models/utils/dbOperations'
import { type IVoteAggregation } from '@types'

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
      logger.warn('Proposal not found - tokenVoting metrics ', llo({ proposalId, pluginAddress, network }))
      return
    }

    const votes = await Models.Vote.findVotes({ proposalId, pluginAddress, network })
    const members = await Models.DaoMemberMapping.findAllMembersOfPlugin({
      pluginAddress,
      network,
    })

    const voteAggregation: Record<number, IVoteAggregation> = votes.reduce(
      (acc: Record<number, IVoteAggregation>, { voteOption, votingPower }) => {
        if (!acc[voteOption]) {
          acc[voteOption] = {
            type: voteOption,
            totalVotes: 0,
            totalVotingPower: BigInt(0),
          }
        }

        // Increment totalVotes and totalVotingPower
        acc[voteOption].totalVotes += 1
        acc[voteOption].totalVotingPower += BigInt(votingPower)

        return acc
      },
      {},
    )

    const rawMetrics = {
      approvalReached: votes.length >= proposal.settings.minApprovals,
      metrics: {
        totalVotes: votes.length,
        missingVotes: votes.length - members.length,
        votesByOption: Object.entries(voteAggregation).map(([type, data]) => ({
          type,
          totalVotes: data.totalVotes,
          totalVotingPower: data.totalVotingPower.toString(),
        })),
      },
    }
    return await DbOperations.updateDocument(
      proposal,
      rawMetrics,
      { logId: proposal.id },
      'Update tokenVoting metrics',
      llo,
    )
  },
}
