/**
 * Dispatch Simulation Controller
 * Thin controller that queues dispatch simulations
 */

import SimulationQueue from '@api/controllers/simulationQueue'
import { type IDispatchSimulationSummary, ITenderlyOperation, type NetworksEnum } from '@types'

class DispatchSimulationController {
  /**
   * Simulate dispatch and return processed summary with address mappings
   */
  static async simulateDispatchSummary(
    policyAddress: string,
    network: NetworksEnum,
    from: string,
    data?: string,
  ): Promise<IDispatchSimulationSummary> {
    return SimulationQueue.request({
      operation: ITenderlyOperation.dispatch,
      policyAddress,
      network,
      from,
      data,
      sentAt: Date.now(),
    })
  }
}

export default DispatchSimulationController
