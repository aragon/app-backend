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

/**
 * Payload for the `crosschain.gasLimit` queue.
 *
 * The estimation runs in a service that holds RPC providers, not in the API, so the request
 * crosses a queue boundary. Everything here must stay JSON-serialisable.
 */
export interface IQueueCrossChainGasLimit {
  /** Origin network - the DAO's own chain, where the message is sent from. */
  network: NetworksEnum
  /** The `CrossChainController` on the origin chain. */
  controllerAddress: string
  /** Standard EVM chain id, not a CCIP selector. */
  destinationChainId: number
  actions: ICrossChainGasAction[]
}

/**
 * A failure the consumer could not deliver as an exception, since a thrown handler never replies
 * and the caller would only see a timeout. `errorKey` is an `ErrorKeyEnum` name the API rethrows,
 * which is what preserves the 400/501/502 distinction across the queue.
 */
export interface ICrossChainGasQueueError {
  error: string
  errorKey: string
}

export type ICrossChainGasQueueResponse = ICrossChainGasEstimate | ICrossChainGasQueueError

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
