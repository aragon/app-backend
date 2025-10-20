import logger from '@logger'
import { Models } from '@dbModels'
import { type NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'

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
    const gauge = await Models.Gauge.findOne({ address: gaugeAddress, network })
    if (!gauge) {
      logger.warn('Gauge not found', llo({ gaugeAddress, network }))
      return
    }

    let lastEpochId: string | null = epochId

    if (!lastEpochId) {
      lastEpochId = await Web3Helper.getGaugeEpochId(pluginAddress, network)
    }

    if (!lastEpochId) {
      logger.error('Error getting gauge lastEpochId', llo({ gaugeAddress, network }))
      return
    }

    const voteCount = await Models.VoteGauge.countActiveVotesByEpochAndGauge(lastEpochId, gaugeAddress, network)
    const votingPower = await Models.VoteGauge.sumActiveVotingPowerByEpochAndGauge(lastEpochId, gaugeAddress, network)

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
        voteCount,
        votingPower,
      })
      logger.verbose('New Gauge metrics', llo({ gaugeAddress, lastEpochId, network }))
    } else {
      // update metrics
      await gaugeMetrics.update({
        voteCount,
        votingPower,
      })
      logger.verbose('Update Gauge metrics', llo({ gaugeAddress, lastEpochId, network }))
    }
  },
}
