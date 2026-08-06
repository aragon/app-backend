/**
 * On-chain reads backing the cross-chain gas estimator.
 *
 * Nothing about the lane is taken from the request body: adapters, routers and chain selectors are
 * all resolved from the controller the caller named, so a caller cannot point the simulation at
 * contracts of their choosing.
 *
 * Every read here exists because the simulation cannot be built without it. Verifying that the
 * lane is *correctly* configured is not this endpoint's job - the simulated `ccipReceive` enforces
 * its own preconditions, and anything it rejects surfaces as a failed delivery with the contract's
 * own revert reason attached.
 */

import { CrossChainController } from '@artifacts/CrossChainController'
import { CCIPAdapter } from '@artifacts/ccip'
import * as Errors from '@errors'
import Utils from '@helpers/utils'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { ErrorKeyEnum, type ICrossChainLane, type NetworksEnum } from '@types'
import { Contract, getAddress, Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'cross-chain-gas:lane-reader' })

const controllerInterface = new Interface(CrossChainController.abi)
const adapterInterface = new Interface(CCIPAdapter.abi)

function getProvider(network: NetworksEnum) {
  return ProviderModule.getAnyRpcProvider(network)
}

/** Raw `eth_call`, rate-limited per network. Returns undefined when the call reverts. */
async function tryCall(network: NetworksEnum, to: string, data: string): Promise<string | undefined> {
  const provider = getProvider(network)
  if (!provider) return undefined

  try {
    return await BottleneckModule.getNodeLimiter(network).schedule(async () => provider.call({ to, data }))
  } catch (error: any) {
    logger.debug('Cross-chain gas: view call reverted', llo({ network, to, error: error?.message ?? String(error) }))
    return undefined
  }
}

const CrossChainLaneReader = {
  /**
   * The lane, read from the origin chain.
   * Both adapters zero means the DAO has no lane to that chain.
   */
  async readLaneAdapters(
    network: NetworksEnum,
    controllerAddress: string,
    destinationChainId: number,
  ): Promise<{ localAdapter: string; remoteAdapter: string }> {
    const provider = getProvider(network)
    Errors.assertExposable(
      !!provider,
      ErrorKeyEnum.crossChainBridgeUnsupported,
      501,
      'No RPC provider configured for the origin chain',
      llo({ network }),
    )

    const controller = new Contract(controllerAddress, controllerInterface, provider)

    let localAdapter: string
    let remoteAdapter: string

    try {
      const result = await BottleneckModule.getNodeLimiter(network).schedule(async () =>
        controller.chainToAdapter(destinationChainId),
      )
      localAdapter = getAddress(result[0])
      remoteAdapter = getAddress(result[1])
    } catch (error: any) {
      // The RPC failure detail is logged, never exposed. `exposeMeta` is returned to the caller
      // verbatim, and an ethers transport error embeds the full provider URL - which carries the
      // API key - in its message.
      logger.warn(
        'Cross-chain gas: could not read chainToAdapter',
        llo({ network, controllerAddress, destinationChainId, error: error?.message ?? String(error) }),
      )
      Errors.throwExposable(
        ErrorKeyEnum.crossChainLaneNotConfigured,
        400,
        'Could not read the cross-chain configuration from this controller',
        llo({ network, controllerAddress, destinationChainId }),
      )
      throw error
    }

    Errors.assertExposable(
      localAdapter !== Utils.zeroAddress || remoteAdapter !== Utils.zeroAddress,
      ErrorKeyEnum.crossChainLaneNotConfigured,
      400,
      'No cross-chain lane is configured for this destination chain',
      llo({ network, controllerAddress, destinationChainId }),
    )

    return { localAdapter, remoteAdapter }
  },

  /**
   * Identify the bridge and read the facts the simulation needs.
   */
  async readLane(params: {
    network: NetworksEnum
    controllerAddress: string
    destinationChainId: number
  }): Promise<ICrossChainLane> {
    const { network, controllerAddress, destinationChainId } = params
    const originChainId = ProviderModule.getChainId(network)

    const { localAdapter, remoteAdapter } = await CrossChainLaneReader.readLaneAdapters(
      network,
      controllerAddress,
      destinationChainId,
    )

    // An unmapped destination is a "cannot estimate" condition, not a bad request.
    const destinationNetwork = ProviderModule.getNetworkByChainId(destinationChainId)
    Errors.assertExposable(
      !!destinationNetwork && !!getProvider(destinationNetwork),
      ErrorKeyEnum.crossChainBridgeUnsupported,
      501,
      'Gas estimation is not supported for this destination chain',
      llo({ network, destinationChainId }),
    )

    // Explicit bridge dispatch. A remote adapter without `CCIP_ROUTER()` is some other
    // bridge (LayerZero, ...), which needs a different simulation shape. The router is also the
    // `from` of the simulation, since `ccipReceive` is `onlyRouter`.
    const ccipRouterData = await tryCall(
      destinationNetwork as NetworksEnum,
      remoteAdapter,
      adapterInterface.encodeFunctionData('CCIP_ROUTER'),
    )
    Errors.assertExposable(
      !!ccipRouterData && ccipRouterData !== '0x',
      ErrorKeyEnum.crossChainBridgeUnsupported,
      501,
      'The configured adapter is not a CCIP adapter',
      llo({ network, destinationChainId, remoteAdapter }),
    )
    const ccipRouter = getAddress(
      adapterInterface.decodeFunctionResult('CCIP_ROUTER', ccipRouterData as string)[0] as string,
    )

    // The remaining destination facts. Note the direction on `toNativeChainId`:
    // `sourceChainSelector` describes where the message came *from*, so the *origin* chain id goes
    // to a function on the *destination* adapter.
    const [controllerData, selectorData] = await Promise.all([
      tryCall(
        destinationNetwork as NetworksEnum,
        remoteAdapter,
        adapterInterface.encodeFunctionData('CROSS_CHAIN_CONTROLLER'),
      ),
      tryCall(
        destinationNetwork as NetworksEnum,
        remoteAdapter,
        adapterInterface.encodeFunctionData('toNativeChainId', [originChainId]),
      ),
    ])

    Errors.assertExposable(
      !!controllerData && controllerData !== '0x',
      ErrorKeyEnum.crossChainLaneNotConfigured,
      400,
      'Could not read the destination controller from the remote adapter',
      llo({ network, destinationChainId, remoteAdapter }),
    )
    const destinationController = getAddress(
      adapterInterface.decodeFunctionResult('CROSS_CHAIN_CONTROLLER', controllerData as string)[0] as string,
    )

    // `toNativeChainId` reverts with UNKNOWN_CHAIN_ID for a chain CCIP does not map - a legitimate
    // "cannot estimate" condition rather than a misconfigured lane.
    Errors.assertExposable(
      !!selectorData && selectorData !== '0x',
      ErrorKeyEnum.crossChainBridgeUnsupported,
      501,
      'CCIP does not map the origin chain on this lane',
      llo({ network, originChainId, destinationChainId, remoteAdapter }),
    )
    const originChainSelector = adapterInterface.decodeFunctionResult(
      'toNativeChainId',
      selectorData as string,
    )[0] as bigint

    const [minGasData, executorData] = await Promise.all([
      tryCall(
        destinationNetwork as NetworksEnum,
        destinationController,
        controllerInterface.encodeFunctionData('minFailedMessageGas'),
      ),
      tryCall(
        destinationNetwork as NetworksEnum,
        destinationController,
        controllerInterface.encodeFunctionData('executor'),
      ),
    ])

    // The gas estimate adds this reserve back onto the measured frame gas (crossChainGasService),
    // so a failed read must not silently fall back to zero - that would under-fund every estimate.
    Errors.assertExposable(
      !!minGasData && minGasData !== '0x',
      ErrorKeyEnum.crossChainLaneNotConfigured,
      400,
      'Could not read minFailedMessageGas from the destination controller',
      llo({ network, destinationChainId, destinationController }),
    )
    const minFailedMessageGas = controllerInterface.decodeFunctionResult(
      'minFailedMessageGas',
      minGasData as string,
    )[0] as bigint

    // Best effort - only used to point at a reverting action in the trace.
    const executor =
      executorData && executorData !== '0x'
        ? getAddress(controllerInterface.decodeFunctionResult('executor', executorData)[0] as string)
        : undefined

    return {
      originChainId,
      destinationChainId,
      destinationNetwork: destinationNetwork as NetworksEnum,
      localAdapter,
      remoteAdapter,
      ccipRouter,
      destinationController,
      originChainSelector,
      minFailedMessageGas,
      executor,
    }
  },
}

export default CrossChainLaneReader
