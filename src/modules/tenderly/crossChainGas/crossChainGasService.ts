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
import {
  ErrorKeyEnum,
  ICrossChainDeliveryVerdict,
  type ICrossChainGasEstimate,
  ICrossChainGasStatus,
  ITenderlyOperation,
  type ITenderlyRequest,
} from '@types'
import Bottleneck from 'bottleneck'
import TenderlyTransport from '../transport'
import { SIMULATION_GAS_CEILING } from './constants'
import CrossChainLaneReader from './laneReader'
import CrossChainPayloadEncoder from './payloadEncoder'
import CrossChainTraceAnalyzer from './traceAnalyzer'

const llo = logger.logMeta.bind(null, { service: 'cross-chain-gas-service' })

const CrossChainGasService = {
  async simulate(
    request: ITenderlyRequest<ITenderlyOperation.crossChainGas>,
    deadlineAt: number,
  ): Promise<ICrossChainGasEstimate> {
    try {
      return await BottleneckModule.getCrossChainGasLimiter().schedule(() =>
        CrossChainGasService._runEstimate(request, deadlineAt),
      )
    } catch (error) {
      if (error instanceof Bottleneck.BottleneckError) Errors.throwExposable(ErrorKeyEnum.tooBusy)
      throw error
    }
  },

  async _runEstimate(
    {
      network,
      controllerAddress: controller,
      destinationChainId,
      actions,
    }: ITenderlyRequest<ITenderlyOperation.crossChainGas>,
    deadlineAt: number,
  ): Promise<ICrossChainGasEstimate> {
    const meta = { network, controllerAddress: controller, destinationChainId }
    Errors.assertExposable(Date.now() < deadlineAt, ErrorKeyEnum.tooBusy)

    const lane = await CrossChainLaneReader.readLane({ network, controllerAddress: controller, destinationChainId })
    Errors.assertExposable(Date.now() < deadlineAt, ErrorKeyEnum.tooBusy)

    const input = CrossChainPayloadEncoder.buildDeliveryInput(lane, controller, actions)

    const runAt = Date.now()

    // Simulate with a deliberately huge budget. `from` is the destination router because
    // `ccipReceive` is `onlyRouter`; Tenderly does not require `from` to be an EOA.
    const simulated = await TenderlyTransport.simulate(
      {
        network_id: destinationChainId.toString(),
        block_number: null,
        from: lane.ccipRouter,
        to: lane.remoteAdapter,
        input,
        gas: SIMULATION_GAS_CEILING,
        gas_price: '0',
        value: '0',
        save: true,
        save_if_fails: true,
        // A receiver can catch out-of-gas and return normally, so a binary search gives the wrong gas.
        estimate_gas: false,
        simulation_type: 'full',
      },
      { operation: ITenderlyOperation.crossChainGas, network, controllerAddress: controller, deadlineAt },
    )

    const transactionInfo = simulated.transaction?.transaction_info
    const callTrace = transactionInfo?.call_trace
    const simulationUrl = await TenderlyTransport.share(simulated.simulation!.id, deadlineAt)

    // Read the events. This is the only trustworthy signal, the transaction status is not!
    // This is because the controller's `catch` swallows an out-of-gas payload and returns normally.
    const { verdict, failureLog } = CrossChainTraceAnalyzer.readVerdict(
      transactionInfo?.logs,
      lane.destinationController,
    )

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

    return result
  },
}

export default CrossChainGasService
