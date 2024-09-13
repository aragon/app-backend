import logger from '@logger'
import { Models } from '@dbModels'
import DbOperations from '@models/utils/dbOperations'
import { type IVoteAggregation } from '@types'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-dao:ProposalMetrics' })

export const ProposalMetrics = {
  proposalMultisigMetrics: async ({
    proposalIndex,
    pluginAddress,
    network,
  }: {
    proposalIndex: number
    pluginAddress: string
    network: string
  }) => {
    const proposal = await Models.Proposal.findByProposalIndex(proposalIndex, pluginAddress, network)

    if (!proposal) {
      logger.warn('Proposal not found - multisig metrics ', llo({ proposalIndex, pluginAddress, network }))
      return
    }

    const votes = await Models.Vote.findVotes({ proposalIndex, pluginAddress, network })

    const rawMetrics = {
      approvalReached: votes.length >= proposal.settings.minApprovals,
      metrics: {
        totalVotes: votes.length,
        missingVotes:
          votes.length >= proposal.settings.minApprovals
            ? votes.length - proposal.settings.minApprovals
            : proposal.settings.minApprovals - votes.length,
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
    proposalIndex,
    pluginAddress,
    network,
  }: {
    proposalIndex: number
    pluginAddress: string
    network: string
  }) => {
    const proposal = await Models.Proposal.findByProposalIndex(proposalIndex, pluginAddress, network)

    if (!proposal) {
      logger.warn('Proposal not found - tokenVoting metrics ', llo({ proposalIndex, pluginAddress, network }))
      return
    }

    const votes = await Models.Vote.findVotes({ proposalIndex, pluginAddress, network })
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
      // TODO: add this feature to know if approvalReached
      approvalReached: votes.length >= proposal.settings.minApprovals,
      metrics: {
        totalVotes: votes.length,
        missingVotes: votes.length >= members.length ? votes.length - members.length : members.length - votes.length,
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
