/**
 * Cross-chain `_gasLimit` estimation.
 *
 * Simulates the delivery of a batch of actions on the destination chain and reports how much gas
 * the `ccipReceive` frame consumed. It is a *measurement*, not a recommendation: no safety margin
 * is applied and the result is not checked against the lane's per-message gas cap. Both of those
 * are the client's judgment, and applying a margin on both sides would double it invisibly.
 *
 * The one thing this service must never do is ask "what is the smallest gas that succeeds".
 * `CrossChainController.receiveMessage` catches an out-of-gas payload and returns normally, so the
 * transaction succeeds far below what the actions need and a binary search settles at the bottom
 * of that range. Instead: run once with a huge budget, read the events to confirm which branch of
 * the `try/catch` ran, and only then read the gas.
 */

import * as Errors from '@errors'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import CrossChainGasCacheModule from '@modules/crossChainGas/gasCache'
import TenderlyModule from '@modules/tenderly'
import {
  ErrorKeyEnum,
  ICrossChainDeliveryVerdict,
  type ICrossChainGasAction,
  type ICrossChainGasEstimate,
  ICrossChainGasStatus,
  type NetworksEnum,
} from '@types'
import Bottleneck from 'bottleneck'
import { getAddress, keccak256, toUtf8Bytes } from 'ethers'
import { SIMULATION_GAS_CEILING } from './constants'
import CrossChainLaneReader from './laneReader'
import CrossChainPayloadEncoder from './payloadEncoder'
import CrossChainTraceAnalyzer from './traceAnalyzer'

const llo = logger.logMeta.bind(null, { service: 'cross-chain-gas-service' })

/**
 * The result cache is in Mongo, see `CrossChainGasCache`. It has to be shared, because every worker
 * has its own memory, and we would pay Tenderly once per worker for the same request.
 *
 * This one stays in memory. It only joins calls that are running right now in this process, and a
 * promise cannot be saved in Mongo anyway.
 */
const inFlight = new Map<string, Promise<ICrossChainGasEstimate>>()

/** The id of one request, and the `_id` of its document in `CrossChainGasCache`. */
function cacheKey(
  network: NetworksEnum,
  controllerAddress: string,
  destinationChainId: number,
  actions: ICrossChainGasAction[],
): string {
  const actionsHash = keccak256(
    toUtf8Bytes(
      JSON.stringify(
        actions.map(action => [action.to.toLowerCase(), action.value, (action.data || '0x').toLowerCase()]),
      ),
    ),
  )
  return `${network}|${controllerAddress.toLowerCase()}|${destinationChainId}|${actionsHash}`
}

/**
 * Estimate the `_gasLimit` a `forwardMessage` proposal needs for this batch.
 *
 * Action count and calldata size are bounded by the route schema before this is reached.
 *
 * @param key the request id, already built by the caller
 * @param network origin network - the DAO's own chain, where the message is sent from
 * @param controller the `CrossChainController` on the origin chain, already checksummed
 * @param destinationChainId standard EVM chain id (not a CCIP selector)
 * @param actions the calls to run on the destination chain, in order, as one batch
 */
async function runEstimate(
  key: string,
  network: NetworksEnum,
  controller: string,
  destinationChainId: number,
  actions: ICrossChainGasAction[],
): Promise<ICrossChainGasEstimate> {
  const meta = { network, controllerAddress: controller, destinationChainId }

  const lane = await CrossChainLaneReader.readLane({ network, controllerAddress: controller, destinationChainId })

  const input = CrossChainPayloadEncoder.buildDeliveryInput(lane, controller, actions)

  const runAt = Date.now()

  if (!(await CrossChainGasCacheModule.consumeSimulationBudget(network, controller, runAt))) {
    Errors.throwExposable(ErrorKeyEnum.crossChainGasBudgetExhausted, null, null, llo(meta))
  }
  // Simulate with a deliberately huge budget. `from` is the destination router because
  // `ccipReceive` is `onlyRouter`; Tenderly does not require `from` to be an EOA.
  const response = await TenderlyModule.simulateRaw({
    chainId: destinationChainId,
    from: lane.ccipRouter,
    to: lane.remoteAdapter,
    input,
    gas: SIMULATION_GAS_CEILING,
  })

  Errors.assertExposable(!!response, ErrorKeyEnum.crossChainSimulationFailed, null, null, llo(meta))
  const simulated = response!

  const transactionInfo = simulated.transaction?.transaction_info
  const callTrace = transactionInfo?.call_trace
  const simulationUrl = simulated.simulation?.id
    ? (await TenderlyModule.createShareableUrl(simulated.simulation.id)) || undefined
    : undefined

  // Read the events. This is the only trustworthy signal, the transaction status is not!
  // This is because the controller's `catch` swallows an out-of-gas payload and returns normally.
  const { verdict, failureLog } = CrossChainTraceAnalyzer.readVerdict(transactionInfo?.logs)

  if (verdict === ICrossChainDeliveryVerdict.NOT_DELIVERED) {
    // Neither event: the delivery reverted before reaching the controller. Either the lane is
    // half-configured (the adapter's own checks - REMOTE_NOT_TRUSTED, CALLER_NOT_LOCAL_ADAPTER,
    // INCORRECT_CHAIN_MISMATCH) or the payload is mis-encoded. The adapter's revert reason
    // distinguishes them, so surface it rather than making the operator open the trace.
    const reason = CrossChainTraceAnalyzer.readTopLevelRevertReason(callTrace)

    logger.error(
      'Cross-chain gas: delivery never reached the controller',
      llo({
        ...meta,
        remoteAdapter: lane.remoteAdapter,
        ccipRouter: lane.ccipRouter,
        transactionStatus: simulated.transaction?.status,
        error: simulated.transaction?.error_info?.error_message,
        reason,
        simulationUrl,
      }),
    )
    Errors.throwExposable(
      ErrorKeyEnum.crossChainSimulationFailed,
      null,
      `The delivery simulation did not reach the cross-chain controller${reason ? `: ${reason}` : ''}`,
      llo(meta),
    )
  }

  let result: ICrossChainGasEstimate

  if (verdict === ICrossChainDeliveryVerdict.FAILED) {
    // The actions were reached but did not run. With ~30M gas supplied this is almost never an
    // out-of-gas condition - the actions genuinely revert. Never derive a gas limit from this run.
    const revertData = CrossChainTraceAnalyzer.extractRevertData(failureLog)

    result = {
      status: ICrossChainGasStatus.REVERTED,
      revertReason: CrossChainTraceAnalyzer.decodeRevertReason(revertData),
      revertedActionIndex: CrossChainTraceAnalyzer.findRevertedActionIndex(callTrace, lane.executor, actions),
      simulationUrl,
      runAt,
    }

    logger.info('Cross-chain gas: actions reverted in simulation', llo({ ...meta, reason: result.revertReason }))
  } else {
    // The measurement. `call_trace.gas_used` is the gas of the `ccipReceive` frame, excluding the
    // transaction envelope's intrinsic cost - which is exactly what the CCIP `gasLimit` pays for.
    const frameGas = callTrace?.gas_used
    Errors.assertExposable(
      typeof frameGas === 'number' && Number.isFinite(frameGas) && frameGas > 0,
      ErrorKeyEnum.crossChainSimulationFailed,
      null,
      null,
      llo({ ...meta, simulationUrl }),
    )

    // Add the reserve back. `receiveMessage` subtracts it from `gasleft()` *before* running
    // the payload, so it is never consumed and never appears in the frame gas - but the limit still
    // has to be large enough to contain it. Skipping this under-funds the payload by exactly the
    // reserve and lands the message in the expensive "slightly short" regime.
    const requiredGas = BigInt(frameGas as number) + lane.minFailedMessageGas

    result = {
      status: ICrossChainGasStatus.SUCCESS,
      requiredGas: requiredGas.toString(),
      simulationUrl,
      runAt,
    }

    logger.info(
      'Cross-chain gas: measurement complete',
      llo({
        ...meta,
        frameGas,
        reserve: lane.minFailedMessageGas.toString(),
        requiredGas: requiredGas.toString(),
      }),
    )
  }

  // One place, so both a measurement and a revert are saved. A revert is a real result too, and
  // repeating it costs the same Tenderly call as repeating a measurement.
  await CrossChainGasCacheModule.writeSharedEstimate(key, result, runAt)
  return result
}

/**
 * Return a measurement for this request, and pay for a new simulation only when we have to.
 *
 * Order: a fresh saved measurement, else a real simulation, else the old measurement of the same
 * request when the hourly budget ran out. If the budget is finished and we have nothing saved we
 * throw, and the queue consumer turns that into a 429 for the caller. We never build a gas number
 * ourselves. A limit that was never simulated can be too low, and then the message is lost.
 */
async function estimateCrossChainGasLimit(
  network: NetworksEnum,
  controllerAddress: string,
  destinationChainId: number,
  actions: ICrossChainGasAction[],
): Promise<ICrossChainGasEstimate> {
  const controller = getAddress(controllerAddress)
  const key = cacheKey(network, controller, destinationChainId, actions)
  const meta = { network, controllerAddress: controller, destinationChainId }
  const now = Date.now()

  const stored = await CrossChainGasCacheModule.readSharedEstimate(key, now)
  if (stored?.fresh) {
    logger.debug('Cross-chain gas: served from cache', llo(meta))
    return stored.result
  }

  const pending = inFlight.get(key)
  if (pending) return await pending

  // The limiter guards only real runs - cache hits and coalesced duplicates never reach it, so
  // a repeat request is never made to wait behind an unrelated estimate.
  const request = BottleneckModule.getCrossChainGasLimiter().schedule(() =>
    runEstimate(key, network, controller, destinationChainId, actions),
  )
  inFlight.set(key, request)

  try {
    return await request
  } catch (error) {
    if (error instanceof Bottleneck.BottleneckError) {
      logger.warn('Cross-chain gas: rejected, estimation queue is full', llo(meta))
      Errors.throwExposable(ErrorKeyEnum.tooBusy)
    }

    if (Errors.isExposableError(error) && error.message === ErrorKeyEnum.crossChainGasBudgetExhausted && stored) {
      logger.info('Cross-chain gas: budget finished, returning an old measurement', llo(meta))
      return { ...stored.result, staleSince: stored.result.runAt, runAt: now }
    }

    throw error
  } finally {
    if (inFlight.get(key) === request) inFlight.delete(key)
  }
}

export default {
  estimateCrossChainGasLimit,
}
