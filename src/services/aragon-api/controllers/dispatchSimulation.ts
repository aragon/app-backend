/**
 * Dispatch Simulation Controller
 * Handles simulation of dispatch operations with full asset flow summary
 */

import { Models } from '@dbModels'
import * as Errors from '@errors'
import { createAddressMapper } from '@helpers/simulationAddressMapper'
import { processSimulation } from '@helpers/simulationProcessor'
import logger from '@logger'
import TenderlyModule from '@modules/tenderly'
import {
  ErrorKeyEnum,
  type IDispatchSimulationSummary,
  IPluginStatus,
  ISimulationStatus,
  type NetworksEnum,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'dispatch-simulation-controller' })

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
    logger.info('Starting dispatch simulation', llo({ policyAddress, network, from }))

    // Validate policy exists and is installed
    const policy = await Models.Plugin.findOne({
      address: policyAddress.toLowerCase(),
      network,
      isPolicy: true,
      status: IPluginStatus.installed,
    })

    Errors.assertExposable(
      policy,
      ErrorKeyEnum.badSimulationRequest,
      400,
      'Policy not found or not installed',
      llo({
        policyAddress,
        network,
      }),
    )

    // Get DAO with subDAOs
    const dao = await Models.Dao.getDaoDetailsWithoutPlugins(policy.daoAddress, network, false)

    Errors.assertExposable(
      dao,
      ErrorKeyEnum.badSimulationRequest,
      400,
      'DAO not found',
      llo({
        daoAddress: policy.daoAddress,
        network,
      }),
    )

    // Run Tenderly full simulation
    const tenderlyResult = await TenderlyModule.simulateFull(
      {
        to: policyAddress,
        data: data || '0xc6c4df0c', // dispatch() selector
        value: '0',
        from,
      },
      network,
    )

    if (!tenderlyResult) {
      return {
        status: 'failed',
        error: 'Tenderly simulation failed or not configured',
        tenderlyUrl: undefined,
        summaryGroups: [],
      }
    }

    Errors.assertExposable(
      tenderlyResult.status === ISimulationStatus.SUCCESS,
      ErrorKeyEnum.badSimulationRequest,
      400,
      'Tenderly simulation failed or not configured',
      llo({ policyAddress, network }),
    )

    // Build AddressMapper
    const mapper = createAddressMapper({
      dao,
      network,
      contracts: tenderlyResult.contracts,
    })

    // Process simulation into summary groups
    const summary = processSimulation(tenderlyResult, mapper)

    logger.info(
      'Dispatch simulation completed',
      llo({
        policyAddress,
        network,
        status: summary.status,
        summaryGroupsCount: summary.summaryGroups.length,
      }),
    )

    return summary
  }
}

export default DispatchSimulationController
