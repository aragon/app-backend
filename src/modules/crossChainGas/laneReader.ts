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
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import { ErrorKeyEnum, type ICrossChainLane, type NetworksEnum } from '@types'
import { getAddress, Interface } from 'ethers'
const llo = logger.logMeta.bind(null, { service: 'cross-chain-gas:lane-reader' })

const controllerInterface = new Interface(CrossChainController.abi)
const adapterInterface = new Interface(CCIPAdapter.abi)

const assertLane = (condition: boolean, key: ErrorKeyEnum, meta: any) =>
  Errors.assertExposable(condition, key, null, null, llo(meta))

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
    // A controller that does not answer `chainToAdapter` is not a cross-chain controller.
    const logMeta = {
      network,
      controllerAddress,
      destinationChainId,
    }

    const adapterData = await Web3Helper.rawCall(
      network,
      controllerAddress,
      controllerInterface.encodeFunctionData('chainToAdapter', [destinationChainId]),
    )

    assertLane(!!adapterData && adapterData !== '0x', ErrorKeyEnum.crossChainLaneNotConfigured, logMeta)

    const [localAdapterRaw, remoteAdapterRaw] = controllerInterface.decodeFunctionResult(
      'chainToAdapter',
      adapterData as string,
    )
    const localAdapter = getAddress(localAdapterRaw as string)
    const remoteAdapter = getAddress(remoteAdapterRaw as string)

    assertLane(
      localAdapter !== Utils.zeroAddress || remoteAdapter !== Utils.zeroAddress,
      ErrorKeyEnum.crossChainLaneNotConfigured,
      { ...logMeta, localAdapter, remoteAdapter },
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

    // Checked before any destination call, so a chain we simply have no node for is reported as
    // unsupported rather than as a failed rpc read.
    assertLane(
      !!destinationNetwork && !!ProviderModule.getAnyRpcProvider(destinationNetwork),
      ErrorKeyEnum.crossChainBridgeUnsupported,
      params,
    )

    // Explicit bridge dispatch. A remote adapter without `CCIP_ROUTER()` is some other
    // bridge (LayerZero, ...), which needs a different simulation shape. The router is also the
    // `from` of the simulation, since `ccipReceive` is `onlyRouter`.
    const ccipRouterData = await Web3Helper.rawCall(
      destinationNetwork as NetworksEnum,
      remoteAdapter,
      adapterInterface.encodeFunctionData('CCIP_ROUTER'),
    )

    assertLane(!!ccipRouterData && ccipRouterData !== '0x', ErrorKeyEnum.crossChainBridgeUnsupported, {
      ...params,
      remoteAdapter,
    })

    const ccipRouter = getAddress(
      adapterInterface.decodeFunctionResult('CCIP_ROUTER', ccipRouterData as string)[0] as string,
    )

    // The remaining destination facts. Note the direction on `toNativeChainId`:
    // `sourceChainSelector` describes where the message came *from*, so the *origin* chain id goes
    // to a function on the *destination* adapter.
    const [controllerData, selectorData] = await Promise.all([
      Web3Helper.rawCall(
        destinationNetwork as NetworksEnum,
        remoteAdapter,
        adapterInterface.encodeFunctionData('CROSS_CHAIN_CONTROLLER'),
      ),
      Web3Helper.rawCall(
        destinationNetwork as NetworksEnum,
        remoteAdapter,
        adapterInterface.encodeFunctionData('toNativeChainId', [originChainId]),
      ),
    ])

    assertLane(!!controllerData && controllerData !== '0x', ErrorKeyEnum.crossChainLaneNotConfigured, {
      ...params,
      remoteAdapter,
    })

    const destinationController = getAddress(
      adapterInterface.decodeFunctionResult('CROSS_CHAIN_CONTROLLER', controllerData as string)[0] as string,
    )

    // `toNativeChainId` reverts with UNKNOWN_CHAIN_ID for a chain CCIP does not map - a legitimate
    // "cannot estimate" condition rather than a misconfigured lane.
    assertLane(!!selectorData && selectorData !== '0x', ErrorKeyEnum.crossChainBridgeUnsupported, {
      ...params,
      originChainId,
      remoteAdapter,
    })

    const originChainSelector = adapterInterface.decodeFunctionResult(
      'toNativeChainId',
      selectorData as string,
    )[0] as bigint

    const [minGasData, executorData] = await Promise.all([
      Web3Helper.rawCall(
        destinationNetwork as NetworksEnum,
        destinationController,
        controllerInterface.encodeFunctionData('minFailedMessageGas'),
      ),
      Web3Helper.rawCall(
        destinationNetwork as NetworksEnum,
        destinationController,
        controllerInterface.encodeFunctionData('executor'),
      ),
    ])

    // The gas estimate adds this reserve back onto the measured frame gas (crossChainGasService),
    // so a failed read must not silently fall back to zero - that would under-fund every estimate.
    assertLane(!!minGasData && minGasData !== '0x', ErrorKeyEnum.crossChainLaneNotConfigured, {
      ...params,
      destinationController,
    })
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
