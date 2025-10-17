import logger from '@logger'
import { Models } from '@dbModels'
import { type NetworksEnum } from '@types'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-dao:GaugeMetrics' })

export const GaugeMetrics = {
  gaugeMetrics: async ({
    epochId,
    gaugeAddress,
    pluginAddress,
    network,
  }: {
    epochId: string
    gaugeAddress: string
    pluginAddress: string
    network: NetworksEnum
  }) => {
    return await DbTx.executeTxFn(async ({ session }) => {
      const gauge = await Models.Gauge.findOne({ address: gaugeAddress, network })
      if (!gauge) {
        logger.warn('Gauge not found', llo({ gaugeAddress, network }))
        return
      }

      const gaugeMetrics = await Models.GaugeMetrics.findOne({ epochId, gaugeAddress, pluginAddress, network })
      if (!gauge) {
        logger.warn('Gauge not found', llo({ gaugeAddress, network }))
        return
      }

      const proposal = await Models.GaugeMetrics.findByProposalIndex(proposalIndex, pluginAddress, network, { session })

      if (!proposal) {
        logger.warn('Proposal not found - multisig metrics', llo({ proposalIndex, pluginAddress, network }))
        return
      }
    })
  },

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
}
