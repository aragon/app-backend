/**
 * Gateway side of the cross-chain gas estimator.
 *
 * The estimation resolves its whole lane on-chain, so it has to run in a service that holds RPC
 * providers. The API has none - it sends a `crosschain.gasLimit` message and waits for this reply.
 */

import logger from '@logger'
import CrossChainGasService from '@modules/crossChainGas'
import {
  ErrorKeyEnum,
  type ICrossChainGasQueueResponse,
  type IExposableError,
  type IQueueCrossChainGasLimit,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'gateway:cross-chain-gas' })

export const CrossChainGasGateway = {
  /**
   * Never throws. `RabbitMQHelper.process` swallows a thrown handler without replying, which the
   * caller can only observe as a timeout - so every failure is returned as a value instead, with
   * the `ErrorKeyEnum` name the API needs to rebuild the right status code.
   */
  async estimateGasLimit(params: IQueueCrossChainGasLimit): Promise<ICrossChainGasQueueResponse> {
    try {
      return await CrossChainGasService.estimateCrossChainGasLimit(
        params.network,
        params.controllerAddress,
        params.destinationChainId,
        params.actions,
      )
    } catch (error: any) {
      const exposable = error as IExposableError

      if (exposable?.exposeCustom_) {
        logger.warn(
          'Cross-chain gas: estimation rejected',
          llo({ ...params, errorKey: exposable.message, description: exposable.description }),
        )
        return {
          error: exposable.description ?? 'Could not estimate the cross-chain gas limit',
          errorKey: exposable.message,
        }
      }

      logger.error(
        'Cross-chain gas: estimation failed unexpectedly',
        llo({ ...params, error: error?.message ?? String(error) }),
      )
      return {
        error: 'The cross-chain gas estimation failed unexpectedly',
        errorKey: ErrorKeyEnum.crossChainSimulationFailed,
      }
    }
  },
}

export default CrossChainGasGateway
