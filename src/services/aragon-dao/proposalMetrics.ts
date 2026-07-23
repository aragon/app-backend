import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import { type IVoteAggregation, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-dao:ProposalMetrics' })

export const ProposalMetrics = {
  proposalMultisigMetrics: async ({
    proposalIndex,
    pluginAddress,
    network,
  }: {
    proposalIndex: string
    pluginAddress: string
    network: NetworksEnum
  }) => {
    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const proposal = await Models.Proposal.findByProposalIndex(proposalIndex, pluginAddress, network, { session })

        if (!proposal) {
          logger.warn('Proposal not found - multisig metrics', llo({ proposalIndex, pluginAddress, network }))
          return
        }

        if (!proposal.settings?.minApprovals) {
          logger.warn('MinApprovals not found - multisig metrics', llo({ proposalIndex, pluginAddress, network }))
        }

        const votes = await Models.Vote.findVotes({ proposalIndex, pluginAddress, network }, { session })
        const missingVotes =
          votes.length >= proposal.settings.minApprovals
            ? votes.length - proposal.settings.minApprovals
            : proposal.settings.minApprovals - votes.length

        const rawMetrics = {
          metrics: {
            totalVotes: votes.length,
            missingVotes,
          },
        }

        const logDb = await proposal.update(rawMetrics, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Updated multisig metrics', llo({ logDb: logDb.id, proposalIndex, pluginAddress, network }))

        return logDb
      })
    } catch (error) {
      logger.error('Error updating multisig metrics', llo({ proposalIndex, pluginAddress, network, error }))
    }
  },

  proposalTokenVotingMetrics: async ({
    proposalIndex,
    pluginAddress,
    network,
  }: {
    proposalIndex: string
    pluginAddress: string
    network: string
  }) => {
    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const proposal = await Models.Proposal.findByProposalIndex(proposalIndex, pluginAddress, network, { session })

        if (!proposal) {
          logger.warn('Proposal not found - tokenVoting metrics', llo({ proposalIndex, pluginAddress, network }))
          return
        }

        const votes = await Models.Vote.findVotes({ proposalIndex, pluginAddress, network }, { session })
        const members = await Models.PluginMember.findAllMembersOfPlugin({
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
          metrics: {
            totalVotes: votes.length,
            missingVotes:
              votes.length >= members.length ? votes.length - members.length : members.length - votes.length,
            votesByOption: Object.entries(voteAggregation).map(([type, data]) => ({
              type,
              totalVotes: data.totalVotes,
              totalVotingPower: data.totalVotingPower.toString(),
            })),
          },
        }

        // Objection (Alchemix) proposals start from the first stage's tallies. Every objection vote
        // moves its voting power from its original yes/abstain bucket to no (ObjectionCast source
        // option); accounts that never voted in stage one add straight to no.
        if (proposal.initialTally) {
          const ABSTAIN = 1
          const YES = 2
          const NO = 3

          let abstain = BigInt(proposal.initialTally.abstain ?? 0)
          let yes = BigInt(proposal.initialTally.yes ?? 0)
          let no = BigInt(proposal.initialTally.no ?? 0)

          for (const { votingPower, objectionFromVoteOption } of votes) {
            const vp = BigInt(votingPower ?? 0)
            no += vp
            if (objectionFromVoteOption === YES) {
              yes -= vp > yes ? yes : vp
            } else if (objectionFromVoteOption === ABSTAIN) {
              abstain -= vp > abstain ? abstain : vp
            }
          }

          rawMetrics.metrics.votesByOption = [
            { type: `${ABSTAIN}`, totalVotes: 0, totalVotingPower: abstain.toString() },
            { type: `${YES}`, totalVotes: 0, totalVotingPower: yes.toString() },
            { type: `${NO}`, totalVotes: votes.length, totalVotingPower: no.toString() },
          ]
        }

        const logDb = await proposal.update(rawMetrics, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Updated tokenVoting metrics', llo({ logDb: logDb.id, proposalIndex, pluginAddress, network }))

        return logDb
      })
    } catch (error) {
      logger.error('Error updating tokenVoting metrics', llo({ proposalIndex, pluginAddress, network, error }))
    }
  },
}
