/**
 * Types for the cross-chain `_gasLimit` estimation endpoint.
 *
 * POST /v2/simulations/:network/cross-chain/:controllerAddress/gas-limit
 */

import { type NetworksEnum } from './networks'

export enum ICrossChainGasStatus {
  /** The actions ran in simulation; `requiredGas` is a valid measurement. */
  SUCCESS = 'success',
  /** The actions were reached but reverted. There is no meaningful gas figure. */
  REVERTED = 'reverted',
}

export interface ICrossChainGasAction {
  to: string
  value: string
  data: string
}

/**
 * The endpoint reports a measurement, not a recommendation: `requiredGas` deliberately carries no
 * safety margin, and is not compared against the lane's per-message gas cap. Deciding how far
 * above the floor to sit, and whether the result fits the lane, is the client's judgement.
 */
export interface ICrossChainGasEstimate {
  status: ICrossChainGasStatus
  /** `success` only. Gas the delivery consumed, including the controller's withheld reserve. */
  requiredGas?: string
  /** `reverted` only. */
  revertReason?: string
  /** `reverted` only, best effort. */
  revertedActionIndex?: number
  simulationUrl?: string
  /** Unix ms. */
  runAt: number
}

/** Everything read off-chain before the simulation can be built. */
export interface ICrossChainLane {
  originChainId: number
  destinationChainId: number
  destinationNetwork: NetworksEnum
  localAdapter: string
  remoteAdapter: string
  /** Destination CCIP Router - the `from` of the simulation, since `ccipReceive` is `onlyRouter`. */
  ccipRouter: string
  /** The `CrossChainController` on the destination chain. */
  destinationController: string
  /** CCIP selector of the *origin* chain, read from the *destination* adapter. */
  originChainSelector: bigint
  /** Gas the destination controller withholds from the payload, added back in §8.1. */
  minFailedMessageGas: bigint
  /** Destination executor, used only to locate a reverting action in the trace. */
  executor?: string
}

/** Outcome of reading the destination controller's events out of the trace. */
export enum ICrossChainDeliveryVerdict {
  /** `MessageReceived` - the actions executed. */
  EXECUTED = 'executed',
  /** `MessageExecutionFailed` - the actions did NOT execute. Never derive a gas limit from this. */
  FAILED = 'failed',
  /** Neither event - the transaction reverted before reaching the controller. A bug in this service. */
  NOT_DELIVERED = 'notDelivered',
}
