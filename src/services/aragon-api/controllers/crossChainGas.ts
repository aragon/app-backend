/**
 * Cross-chain gas limit controller
 *
 * The estimation resolves its lane on-chain, and the API service holds no RPC providers, so the
 * work is delegated over RabbitMQ to the gateway - the same pattern the gauge endpoints use.
 */

import config from '@config'
import { assertExposable, throwExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import {
  EnumQueueName,
  ErrorKeyEnum,
  type ICrossChainGasAction,
  type ICrossChainGasEstimate,
  type ICrossChainGasQueueError,
  type ICrossChainGasQueueResponse,
  type IQueueCrossChainGasLimit,
  type NetworksEnum,
} from '@types'

class CrossChainGasController {
  /**
   * Measure the `_gasLimit` a `forwardMessage` proposal needs to deliver `actions` on
   * `destinationChainId`. The measurement carries no safety margin - the client adds its own.
   */
  static async estimateGasLimit(
    network: NetworksEnum,
    controllerAddress: string,
    destinationChainId: number,
    actions: ICrossChainGasAction[],
  ): Promise<ICrossChainGasEstimate> {
    const params: IQueueCrossChainGasLimit = { network, controllerAddress, destinationChainId, actions }

    const result: ICrossChainGasQueueResponse | null = await RabbitMQHelper.sendMessage(
      EnumQueueName.crossChainGasLimit,
      {
        id: `${network}-${controllerAddress}-${destinationChainId}`,
        params,
      },
      { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
    )

    // Null means the consumer never replied - it is down, or the simulation outran the timeout.
    assertExposable(
      !!result,
      ErrorKeyEnum.crossChainSimulationFailed,
      502,
      'The cross-chain gas estimation did not complete in time',
      params,
    )

    // A reply always arrives as an object, so `error` - not the reply itself - is what marks a
    // failure. The consumer cannot throw across the queue, so it hands back the error key instead
    // and the status attached to it here is the one the caller would have got in-process.
    const failure = result as ICrossChainGasQueueError
    if (failure.error) {
      const errorKey = (failure.errorKey as keyof typeof ErrorKeyEnum) ?? ErrorKeyEnum.crossChainSimulationFailed
      throwExposable(ErrorKeyEnum[errorKey] ?? ErrorKeyEnum.crossChainSimulationFailed, null, failure.error)
    }

    return result as ICrossChainGasEstimate
  }
}

export default CrossChainGasController
