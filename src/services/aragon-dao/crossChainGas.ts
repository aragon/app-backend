/**
 * Dao service side of the cross-chain gas estimator.
 *
 * The estimation reads the whole lane on chain, so it needs a service with RPC providers, and it
 * also counts the hourly budget and saves the result, so it needs a service that writes to Mongo.
 * The gateway only reads, so this runs here. The API has neither, it sends a `crosschain.gasLimit`
 * message and waits for this reply.
 */

import { ERRORS, isExposableError } from '@errors'
import logger from '@logger'
import TenderlyModule from '@modules/tenderly'
import {
  ErrorKeyEnum,
  type ICrossChainGasQueueResponse,
  type IQueueCrossChainGasLimit,
  ITenderlyOperation,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'dao:cross-chain-gas' })

/** A failure reply carrying the registry's own wording for the key. */
function queueError(errorKey: ErrorKeyEnum): ICrossChainGasQueueResponse {
  return { error: ERRORS[errorKey].description, errorKey }
}

export const CrossChainGasDao = {
  /**
   * Never throws. `RabbitMQHelper.process` swallows a thrown handler without replying *and without
   * acking*, so the message holds a prefetch slot until the connection drops. Every failure is
   * returned as a value instead, carrying the `ErrorKeyEnum` name the API needs to rebuild the
   * right status code.
   */
  async estimateGasLimit(params: IQueueCrossChainGasLimit): Promise<ICrossChainGasQueueResponse> {
    const meta = {
      network: params.network,
      controllerAddress: params.controllerAddress,
      destinationChainId: params.destinationChainId,
    }

    try {
      return await TenderlyModule.run({ ...params, operation: ITenderlyOperation.crossChainGas })
    } catch (error: any) {
      // Carries the key and description the API needs to rebuild the exact status this would
      // have had in-process. The budget refusal comes through here too.
      if (isExposableError(error)) {
        logger.warn('Cross-chain gas: estimation rejected', llo({ ...meta, errorKey: error.message }))
        return { error: error.description, errorKey: error.message }
      }

      logger.error(
        'Cross-chain gas: estimation failed unexpectedly',
        llo({ ...meta, error: error?.message ?? String(error) }),
      )
      return queueError(ErrorKeyEnum.crossChainSimulationFailed)
    }
  },
}

export default CrossChainGasDao
