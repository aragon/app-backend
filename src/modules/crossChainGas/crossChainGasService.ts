/**
 * Cross-chain `_gasLimit` estimation.
 *
 * Simulates the delivery of a batch of actions on the destination chain and reports how much gas
 * the `ccipReceive` frame consumed. It is a *measurement*, not a recommendation: no safety margin
 * is applied and the result is not checked against the lane's per-message gas cap. Both of those
 * are the client's judgement, and applying a margin on both sides would double it invisibly.
 *
 * The one thing this service must never do is ask "what is the smallest gas that succeeds".
 * `CrossChainController.receiveMessage` catches an out-of-gas payload and returns normally, so the
 * transaction succeeds far below what the actions need and a binary search settles at the bottom
 * of that range. Instead: run once with a huge budget, read the events to confirm which branch of
 * the `try/catch` ran, and only then read the gas.
 */

import * as Errors from '@errors'
import logger from '@logger'
import TenderlyModule from '@modules/tenderly'
import {
  ErrorKeyEnum,
  ICrossChainDeliveryVerdict,
  type ICrossChainGasAction,
  type ICrossChainGasEstimate,
  ICrossChainGasStatus,
  type NetworksEnum,
} from '@types'
import { getAddress, keccak256, toUtf8Bytes } from 'ethers'
import { CACHE_MAX_ENTRIES, CACHE_TTL_MS, SIMULATION_GAS_CEILING } from './constants'
import CrossChainLaneReader from './laneReader'
import CrossChainPayloadEncoder from './payloadEncoder'
import CrossChainTraceAnalyzer from './traceAnalyzer'

const llo = logger.logMeta.bind(null, { service: 'cross-chain-gas-service' })

interface CacheEntry {
  expiresAt: number
  result: ICrossChainGasEstimate
}

/**
 * Process-local TTL cache. The codebase has no shared cache layer to reuse - `daoAddressCache` and
 * `tokenEligibilityCache` are both bespoke module-local Maps mirroring Mongo, a different shape
 * entirely - and a 60s window that only exists to absorb double-clicks does not justify one.
 * Per-process duplication is bounded by the TTL and costs one extra Tenderly call at worst.
 */
const cache = new Map<string, CacheEntry>()

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

function readCache(key: string, now: number): ICrossChainGasEstimate | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= now) {
    cache.delete(key)
    return undefined
  }
  return entry.result
}

function writeCache(key: string, result: ICrossChainGasEstimate, now: number): void {
  for (const [existingKey, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(existingKey)
  }
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, result })
}

/**
 * Estimate the `_gasLimit` a `forwardMessage` proposal needs for this batch.
 *
 * Action count and calldata size are bounded by the route schema before this is reached.
 *
 * @param network origin network - the DAO's own chain, where the message is sent from
 * @param controllerAddress the `CrossChainController` on the origin chain
 * @param destinationChainId standard EVM chain id (not a CCIP selector)
 * @param actions the calls to run on the destination chain, in order, as one batch
 */
export async function estimateCrossChainGasLimit(
  network: NetworksEnum,
  controllerAddress: string,
  destinationChainId: number,
  actions: ICrossChainGasAction[],
): Promise<ICrossChainGasEstimate> {
  const controller = getAddress(controllerAddress)
  const meta = { network, controllerAddress: controller, destinationChainId }

  const key = cacheKey(network, controller, destinationChainId, actions)
  const cached = readCache(key, Date.now())
  if (cached) {
    logger.debug('Cross-chain gas: served from cache', llo(meta))
    return cached
  }

  const lane = await CrossChainLaneReader.readLane({ network, controllerAddress: controller, destinationChainId })

  const input = CrossChainPayloadEncoder.buildDeliveryInput(lane, controller, actions)

  // Simulate with a deliberately huge budget. `from` is the destination router because
  // `ccipReceive` is `onlyRouter`; Tenderly does not require `from` to be an EOA.
  const response = await TenderlyModule.simulateRaw({
    chainId: destinationChainId,
    from: lane.ccipRouter,
    to: lane.remoteAdapter,
    input,
    gas: SIMULATION_GAS_CEILING,
  })

  const runAt = Date.now()

  Errors.assertExposable(
    !!response,
    ErrorKeyEnum.crossChainSimulationFailed,
    502,
    'The delivery simulation could not be run',
    llo(meta),
  )

  const transactionInfo = response?.transaction?.transaction_info
  const simulationUrl = response?.simulation?.id
    ? (await TenderlyModule.createShareableUrl(response.simulation.id)) || undefined
    : undefined

  // Read the events. This is the only trustworthy signal, the transaction status is not!
  // This is because the controller's `catch` swallows an out-of-gas payload and returns normally.
  const { verdict, failureLog } = CrossChainTraceAnalyzer.readVerdict(transactionInfo?.logs)

  if (verdict === ICrossChainDeliveryVerdict.NOT_DELIVERED) {
    // Neither event: the delivery reverted before reaching the controller. Either the lane is
    // half-configured (the adapter's own checks - REMOTE_NOT_TRUSTED, CALLER_NOT_LOCAL_ADAPTER,
    // INCORRECT_CHAIN_MISMATCH) or the payload is mis-encoded. The adapter's revert reason
    // distinguishes them, so surface it rather than making the operator open the trace.
    const reason = CrossChainTraceAnalyzer.readTopLevelRevertReason(transactionInfo?.call_trace)

    logger.error(
      'Cross-chain gas: delivery never reached the controller',
      llo({
        ...meta,
        remoteAdapter: lane.remoteAdapter,
        ccipRouter: lane.ccipRouter,
        transactionStatus: response?.transaction?.status,
        error: response?.transaction?.error_info?.error_message,
        reason,
        simulationUrl,
      }),
    )
    Errors.throwExposable(
      ErrorKeyEnum.crossChainSimulationFailed,
      502,
      `The delivery simulation did not reach the cross-chain controller${reason ? `: ${reason}` : ''}`,
      llo(meta),
    )
  }

  if (verdict === ICrossChainDeliveryVerdict.FAILED) {
    // The actions were reached but did not run. With ~30M gas supplied this is almost never an
    // out-of-gas condition - the actions genuinely revert. Never derive a gas limit from this run.
    const revertData = CrossChainTraceAnalyzer.extractRevertData(failureLog)
    const result: ICrossChainGasEstimate = {
      status: ICrossChainGasStatus.REVERTED,
      revertReason: CrossChainTraceAnalyzer.decodeRevertReason(revertData),
      revertedActionIndex: CrossChainTraceAnalyzer.findRevertedActionIndex(
        transactionInfo?.call_trace,
        lane.executor,
        actions,
      ),
      simulationUrl,
      runAt,
    }

    logger.info('Cross-chain gas: actions reverted in simulation', llo({ ...meta, reason: result.revertReason }))
    writeCache(key, result, runAt)
    return result
  }

  // The measurement. `call_trace.gas_used` is the gas of the `ccipReceive` frame, excluding the
  // transaction envelope's intrinsic cost - which is exactly what the CCIP `gasLimit` pays for.
  const frameGas = transactionInfo?.call_trace?.gas_used
  Errors.assertExposable(
    typeof frameGas === 'number' && Number.isFinite(frameGas) && frameGas > 0,
    ErrorKeyEnum.crossChainSimulationFailed,
    502,
    'The delivery simulation returned an unusable trace',
    llo({ ...meta, simulationUrl }),
  )

  // Add the reserve back. `receiveMessage` subtracts it from `gasleft()` *before* running
  // the payload, so it is never consumed and never appears in the frame gas - but the limit still
  // has to be large enough to contain it. Skipping this under-funds the payload by exactly the
  // reserve and lands the message in the expensive "slightly short" regime.
  const requiredGas = BigInt(frameGas as number) + lane.minFailedMessageGas

  const result: ICrossChainGasEstimate = {
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

  writeCache(key, result, runAt)
  return result
}

/** Exposed for tests: the cache is process-local and intentionally short-lived. */
export function clearCrossChainGasCache(): void {
  cache.clear()
}

export default {
  estimateCrossChainGasLimit,
  clearCrossChainGasCache,
}
