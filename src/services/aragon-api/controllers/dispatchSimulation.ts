/**
 * Dispatch Simulation Controller
 * Handles simulation of dispatch operations with full asset flow summary
 */

import { Models } from '@dbModels'
import * as Errors from '@errors'
import { createAddressMapper } from '@helpers/simulationAddressMapper'
import { processSimulation } from '@helpers/simulationProcessor'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
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
   * Best-effort on-chain contract detection for addresses.
   */
  private static async enrichMapperWithOnChainContracts(params: {
    network: NetworksEnum
    addresses: string[]
    mapper: ReturnType<typeof createAddressMapper>
  }): Promise<void> {
    const { network, addresses, mapper } = params

    const provider = ProviderModule.getAnyRpcProvider(network)
    if (!provider) {
      logger.warn('No RPC provider available for contract detection', llo({ network }))
      return
    }

    // Keep it cheap: only check a limited set of unique unknown addresses.
    const unique = Array.from(new Set(addresses.map(a => a.toLowerCase()))).slice(0, 50)

    await Promise.all(
      unique.map(async address => {
        const resolved = mapper.resolve(address)
        if (resolved.role !== 'wallet') {
          return
        }

        try {
          const code = await BottleneckModule.getNodeLimiter(network).schedule(async () => provider.getCode(address))
          if (typeof code === 'string' && code !== '0x') {
            // Mark as contract, but keep it "unknown" unless we have a label/ENS.
            mapper.addMapping(address, { role: 'contract', isKnown: false })
          }
        } catch (error: any) {
          logger.debug(
            'Contract detection failed',
            llo({
              network,
              address,
              error: error?.message ?? String(error),
            }),
          )
        }
      }),
    )
  }

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

    const policy = await Models.Plugin.findOne({
      address: policyAddress,
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

    // Tenderly does not always include all contracts in `contracts[]` (e.g. swap pools),
    // but those addresses can still appear in asset transfers. Detect them on-chain.
    await DispatchSimulationController.enrichMapperWithOnChainContracts({
      network,
      mapper,
      addresses: tenderlyResult.assetChanges.flatMap(change => [change.from, change.to]).filter(Boolean),
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
