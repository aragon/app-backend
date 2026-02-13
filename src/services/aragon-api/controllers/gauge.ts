import config from '@config'
import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import {
  EnumQueueName,
  ErrorKeyEnum,
  type IGaugeEpochMetricParams,
  type IGaugeInfo,
  type IGaugeParams,
  type IGaugeResponse,
  type IGetGaugeEpochId,
  type IGetGaugeInfoId,
  type IGetGaugeRewardDistribution,
  type IPaginatedResult,
  type IPaginationParams,
  IPluginInterfaceType,
  type RewardDistributionResult,
} from '@types'

const GaugeController = {
  getGaugesWithPagination: async (
    paginationParams: IPaginationParams = {},
    params: IGaugeParams = {},
  ): Promise<IPaginatedResult<IGaugeResponse>> => {
    params.epochId = await RabbitMQHelper.sendMessage(
      EnumQueueName.gaugeEpochId,
      {
        id: `${params.pluginAddress}-${params.network}`,
        params: {
          pluginAddress: params.pluginAddress!,
          network: params.network!,
        } satisfies IGetGaugeEpochId,
      },
      { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
    )

    assertExposable(!!params.epochId, ErrorKeyEnum.notFound, undefined, undefined, params)

    return await Models.Gauge.findWithPagination({ params, paginationParams })
  },

  getRewardDistribution: async (params: IGetGaugeRewardDistribution) => {
    const result: RewardDistributionResult | null = await RabbitMQHelper.sendMessage(
      EnumQueueName.gaugeRewardDistribution,
      {
        id: `${params.pluginAddress}-${params.network}-${params.epochId}`,
        params,
      },
      { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
    )

    assertExposable(!!result, ErrorKeyEnum.notFound, undefined, undefined, params)

    const totalVP = result.contractTotal
    const owners = result.ownerRewards.map(r => ({
      owner: r.owner,
      votingPower: r.votingPower.toString(),
      percentage: totalVP > 0n ? Number((r.votingPower * 10000n) / totalVP) / 100 : 0,
      tokenIds: r.tokenIds,
    }))

    return {
      epoch: result.epoch,
      pluginAddress: result.pluginAddress,
      network: result.network,
      totalVotingPower: totalVP.toString(),
      owners,
      invariants: result.invariants,
    }
  },

  getGaugeEpochMetrics: async (params: IGaugeEpochMetricParams): Promise<IGaugeInfo> => {
    const plugin = await Models.Plugin.findOne({
      interfaceType: IPluginInterfaceType.gauge,
      address: params.pluginAddress,
    })
    assertExposable(!!plugin, ErrorKeyEnum.notFound, undefined, undefined, {
      pluginAddress: params.pluginAddress,
    })

    const gaugeInfo = await RabbitMQHelper.sendMessage(
      EnumQueueName.gaugeInfo,
      {
        id: `${plugin.address}-${plugin.network}`,
        params: {
          pluginAddress: plugin.address!,
          memberAddress: params.memberAddress,
          network: plugin.network!,
        } satisfies IGetGaugeInfoId,
      },
      { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
    )
    assertExposable(!!gaugeInfo, ErrorKeyEnum.notFound, undefined, undefined, {
      pluginAddress: params.pluginAddress,
      memberAddress: params.memberAddress,
    })

    return gaugeInfo
  },
}

export default GaugeController
