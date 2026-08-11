/**
 * Cross-chain gas limit controller
 *
 * The estimation reads its lane on chain and counts the hourly Tenderly budget, so it needs RPC
 * providers and Mongo writes. The API has neither, it sends a `crosschain.gasLimit` message to the
 * dao service and waits for the reply.
 *
 * The cache and the budget both live in the dao service, next to the simulation they protect. This
 * one only checks the plugin, sends the message, and turns a failure reply back into a status.
 */

import config from '@config'
import { Models } from '@dbModels'
import { assertExposable, throwExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import {
  EnumQueueName,
  ErrorKeyEnum,
  type ICrossChainGasAction,
  type ICrossChainGasEstimate,
  type ICrossChainGasQueueError,
  type ICrossChainGasQueueResponse,
  IPluginInterfaceType,
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
    const plugin = await Models.Plugin.findByAddress(controllerAddress, network)

    assertExposable(
      plugin?.interfaceType === IPluginInterfaceType.crossChainController,
      ErrorKeyEnum.crossChainControllerNotFound,
    )

    const params: IQueueCrossChainGasLimit = {
      sentAt: Date.now(),
      network,
      controllerAddress,
      destinationChainId,
      actions,
    }

    const result: ICrossChainGasQueueResponse | null = await RabbitMQHelper.sendMessage(
      EnumQueueName.crossChainGasLimit,
      {
        id: `${network}-${controllerAddress}-${destinationChainId}`,
        params,
      },
      { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
    )

    // Null means the consumer never replied - it is down, or the simulation outran the timeout.
    // Plain object, not `llo`. This is `exposeMeta`, which the error middleware returns to the
    // caller as it is, so it should carry only what the caller asked with.
    assertExposable(!!result, ErrorKeyEnum.crossChainSimulationFailed, null, null, {
      network,
      controllerAddress,
      destinationChainId,
    })

    // A reply always arrives as an object, so `error` - not the reply itself - is what marks a
    // failure. The consumer cannot throw across the queue, so it hands back the error key instead
    // and the status attached to it here is the one the caller would have got in-process.
    const failure = result as ICrossChainGasQueueError
    if (failure.error) {
      // Checked against the values, not read as a key. `ErrorKeyEnum` is a plain object, so a key
      // like `toString` would give back an inherited function instead of undefined, the `??` would
      // never fire, and the caller would get a 500 instead of the status the key carries.
      const errorKey = Object.values(ErrorKeyEnum).includes(failure.errorKey as ErrorKeyEnum)
        ? (failure.errorKey as ErrorKeyEnum)
        : ErrorKeyEnum.crossChainSimulationFailed

      throwExposable(errorKey, null, failure.error)
    }

    return result as ICrossChainGasEstimate
  }
}

export default CrossChainGasController
