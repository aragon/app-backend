/**
 * Dispatch Simulation Controller
 * Thin controller that delegates to dispatch simulation service
 */

import { simulateDispatchSummary } from '@modules/dispatchSimulation'
import { type IDispatchSimulationSummary, type NetworksEnum } from '@types'

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
    return simulateDispatchSummary(policyAddress, network, from, data)
  }
}

export default DispatchSimulationController
