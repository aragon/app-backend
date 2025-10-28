import { type IGetGaugeInfoId, type IGaugeInfo } from '@types'
import { Models } from '@dbModels'
import GaugeHelper from '@helpers/gauge'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'aragon-gateway:gauge' })

export const GaugeInfo = {
  getGaugeInfo: async ({ pluginAddress, memberAddress, network }: IGetGaugeInfoId): Promise<IGaugeInfo | null> => {
    try {
      // Fetch plugin and common gauge data in parallel
      const [
        plugin,
        epochId,
        totalVotingPower,
        enableUpdateVotingPowerHook,
        currentEpochStart,
        epochVoteStart,
        epochVoteEnd,
      ] = await Promise.all([
        Models.Plugin.findOne({ address: pluginAddress, network }),
        GaugeHelper.getGaugeEpochId(pluginAddress, network),
        GaugeHelper.totalVotingPowerCast(pluginAddress, network),
        GaugeHelper.getEnableUpdateVotingPowerHookFlag(pluginAddress, network),
        GaugeHelper.currentEpochStart(pluginAddress, network),
        GaugeHelper.getGaugeEpochVoteStart(pluginAddress, network),
        GaugeHelper.getGaugeEpochVoteEnd(pluginAddress, network),
      ])

      if (!plugin) {
        logger.warn('plugin not found - getGaugeInfo', llo({ pluginAddress, memberAddress, network }))
        return null
      }

      // Build base gauge info object
      const gaugeInfo: IGaugeInfo = {
        pluginAddress,
        network,
        epochId,
        totalVotingPower,
        enableUpdateVotingPowerHook,
        currentEpochStart,
        epochVoteStart,
        epochVoteEnd,
      }

      if (memberAddress && plugin.iVotesAddress) {
        const [memberUsedVotingPower, memberVotingPower] = await Promise.all([
          GaugeHelper.getUsedVotingPower(memberAddress, pluginAddress, network),
          enableUpdateVotingPowerHook
            ? GaugeHelper.getVotes(memberAddress, plugin.iVotesAddress, network)
            : GaugeHelper.getPastVotes(memberAddress, currentEpochStart || 0, plugin.iVotesAddress, network),
        ])

        gaugeInfo.memberAddress = memberAddress
        gaugeInfo.memberUsedVotingPower = memberUsedVotingPower
        gaugeInfo.memberVotingPower = memberVotingPower
      }

      return gaugeInfo
    } catch (e) {
      logger.error('Error getting gauge info', llo({ pluginAddress, memberAddress, network, error: e }))
      return null
    }
  },
}
