import { Models } from '@dbModels'
import {
  EnumQueueName,
  ErrorKeyEnum,
  type IGaugeParams,
  type IGaugeResponse,
  type IGetGaugeEpochId,
  type IPaginatedResult,
  type IPaginationParams,
} from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import config from '@config'
import { assertExposable } from '@errors'

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
}

export default GaugeController
