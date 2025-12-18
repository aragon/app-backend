import { Models } from '@dbModels'
import GaugeHelper from '@helpers/gauge'
import logger from '@logger'
import { type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-dao:GaugeMetrics' })

export const GaugeMetrics = {
  epochGaugeMetrics: async ({
    epochId,
    gaugeAddress,
    pluginAddress,
    currentEpochVotingPower,
    totalGaugeVotingPower,
    network,
  }: {
    epochId: string | null
    gaugeAddress: string
    pluginAddress: string
    currentEpochVotingPower: string
    totalGaugeVotingPower: string
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

    const totalMemberVoteCount = await Models.VoteGauge.countActiveVotesByEpochAndGauge(
      lastEpochId,
      pluginAddress,
      gaugeAddress,
      network,
    )
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
      // update metrics
      await gaugeMetrics.update({
        totalMemberVoteCount,
        currentEpochVotingPower,
        totalGaugeVotingPower,
      })
      logger.verbose('Update Gauge metrics', llo({ gaugeAddress, lastEpochId, network }))
    }
  },
}
