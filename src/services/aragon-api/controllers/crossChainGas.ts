/**
 * Cross-chain gas limit controller
 * Thin controller that delegates to the cross-chain gas estimation service
 */

import { estimateCrossChainGasLimit } from '@modules/crossChainGas'
import { type ICrossChainGasAction, type ICrossChainGasEstimate, type NetworksEnum } from '@types'

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
    return estimateCrossChainGasLimit(network, controllerAddress, destinationChainId, actions)
  }
}

export default CrossChainGasController
