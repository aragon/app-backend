import logger from '@logger'
import { Models } from '@dbModels'
import { type NetworksEnum } from '@types'
import GaugeHelper from '@helpers/gauge'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-dao:GaugeMetrics' })

export const GaugeMetrics = {
  epochGaugeMetrics: async ({
    epochId,
    gaugeAddress,
    pluginAddress,
    network,
  }: {
    epochId: string | null
    gaugeAddress: string
    pluginAddress: string
    network: NetworksEnum
  }) => {
    const gauge = await Models.Gauge.findOne({ address: gaugeAddress, network, pluginAddress })
    if (!gauge) {
      logger.warn('Gauge not found', llo({ gaugeAddress, network }))
      return
    }

    let lastEpochId: string | null = epochId

    if (!lastEpochId) {
      lastEpochId = await GaugeHelper.getGaugeEpochId(pluginAddress, network)
    }

    if (!lastEpochId) {
      logger.error('Error getting gauge lastEpochId', llo({ gaugeAddress, network }))
      return
    }

    const [currentEpochVotingPower, totalGaugeVotingPower, totalMemberVoteCount] = await Promise.all([
      GaugeHelper.getGaugeVotes(gaugeAddress, pluginAddress, network),
      GaugeHelper.totalVotingPowerCast(pluginAddress, network),
      Models.VoteGauge.countActiveVotesByEpochAndGauge(lastEpochId, pluginAddress, gaugeAddress, network),
    ])

    const gaugeMetrics = await Models.GaugeMetrics.findByGaugeAndEpoch({
      network,
      pluginAddress,
      gaugeAddress,
      epochId: lastEpochId,
    })

    if (!gaugeMetrics) {
      // create metrics
      await Models.GaugeMetrics.create({
        network,
        pluginAddress,
        gaugeAddress,
        epochId: lastEpochId,
        totalMemberVoteCount,
        currentEpochVotingPower,
        totalGaugeVotingPower,
      })
      logger.verbose('New Gauge metrics', llo({ gaugeAddress, lastEpochId, network }))
    } else {
      await gaugeMetrics.update({
        totalMemberVoteCount,
        currentEpochVotingPower,
        totalGaugeVotingPower,
      })
      logger.verbose('Update Gauge metrics', llo({ gaugeAddress, lastEpochId, network }))
    }
  },
}
