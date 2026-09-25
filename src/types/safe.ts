/**
 * Safe body reads: the shape `/v2/safe/*` emits, and the payload that carries one read from
 * `aragon-api` to `aragon-gateway`.
 *
 * Only two of the five reads a Safe body needs can come from the Safe Transaction Service at all -
 * the pending queue and the next free nonce, both of which exist offchain only. Owners, threshold,
 * version and the onchain nonce are plain contract reads, so they are served from chain and never
 * spend the shared Safe API key.
 */

import { type NetworksEnum } from '@src/types/networks'

/** Where a payload came from. Observability only - the client must not branch on it. */
export enum ISafeSource {
  chain = 'chain',
  safeApi = 'safe-api',
  /** Answered from what this backend already holds, without asking anyone. */
  store = 'store',
}

export enum ISafeReadKind {
  info = 'info',
  queue = 'queue',
  history = 'history',
  nextNonce = 'next-nonce',
}

/**
 * Failure vocabulary of `/v2/safe/*`. The values are the app's `SafeServiceErrorCode` verbatim so
 * the frontend's existing error handling needs no change. An unsupported chain is in here because
 * the app renders a dedicated state for it - it is an answer, not an error.
 */
export enum ISafeErrorCode {
  unsupportedChain = 'unsupported-chain',
  rateLimited = 'rate-limited',
  notConfigured = 'not-configured',
  invalidResponse = 'invalid-response',
  connectionError = 'connection-error',
  notFound = 'not-found',
  upstreamError = 'upstream-error',
}

export interface ISafeMeta {
  source: ISafeSource
  fetchedAt: string
  /** The fresh window lapsed and this came from the stale window. Render it, do not discard it. */
  stale: boolean
}

export interface ISafeInfo {
  /** EIP-55 checksummed. */
  address: string
  owners: string[]
  threshold: number
  version: string | null
  /** uint256 as a decimal string - a JSON number loses precision. */
  nonce: string
  modules: string[]
  guard: string | null
}

export interface ISafeConfirmation {
  owner: string
  signature: string
  signatureType?: string
  submissionDate: string
}

/**
 * The Aragon proposal a queued Safe transaction reports to, as the calldata states it - not a
 * governance outcome. The transaction may never execute, or execute after the stage advanced.
 */
export interface IAragonProposalReport {
  /** `${network}-${checksummedDaoAddress}` - the composite the app's `useDao` is keyed by. */
  daoId: string
  /** The reporting plugin: the SPP address the call targets. A proposal slug is scoped to it. */
  bodyId: string
  /** The backend `incrementalId` the app builds its URL from, not the contract's `uint256` id. */
  proposalId: number
  stageId: number
  /** `ResultType` as encoded in the call. */
  resultType: number
}

export interface ISafeMultisigTransaction {
  safeTxHash: string
  nonce: string
  /** The proposing owner. Upstream calls this `proposer`; renamed once, here. */
  from: string | null
  to: string
  value: string
  data: string | null
  operation: number
  safeTxGas: string
  baseGas: string
  gasPrice: string
  gasToken: string
  refundReceiver: string
  confirmations: ISafeConfirmation[]
  confirmationsRequired: number
  signatures: string | null
  isExecuted: boolean
  isSuccessful: boolean | null
  submissionDate: string
  /** Executed transactions only: when it executed. */
  executionDate?: string
  /** Executed transactions only: the onchain transaction that executed it. */
  transactionHash?: string
  /**
   * Present whenever the transaction's calldata decoded into one or more proposal reports; absent
   * when it is not a recognised report at all. An **empty array** therefore means "this calldata
   * claims to be a proposal report and nothing could be resolved from it" - not yet indexed,
   * refused by the body check, or the correlation read failed - which absence cannot express.
   *
   * An empty array asserts nothing about legitimacy. The calldata is queuer-chosen, so it is not a
   * claim that the Safe may report to anything, nor that a resolvable proposal exists. It means the
   * payload is a governance report this backend could not characterise, and is the weaker signal of
   * the two - never render it as a pending-but-valid link.
   *
   * Entries are in calldata order (MultiSend order for a batch), duplicates are preserved rather
   * than collapsed, and each entry carries its own `daoId`: one row can span DAOs.
   */
  aragonReports?: IAragonProposalReport[]
}

export interface ISafeQueue {
  count: number
  next: string | null
  previous: string | null
  results: ISafeMultisigTransaction[]
}

export interface ISafeNextNonce {
  nextNonce: string
  currentNonce: string
}

export type ISafeInfoResponse = ISafeInfo & { meta: ISafeMeta }
export type ISafeQueueResponse = ISafeQueue & { meta: ISafeMeta }
export type ISafeNextNonceResponse = ISafeNextNonce & { meta: ISafeMeta }

/**
 * Liveness of a stored Safe transaction. `executed` needs the execution event or a history page
 * naming it; `superseded` is a rival of an executed row, or any live row below the Safe's nonce.
 * `removed` was deleted from the transaction service offchain and may still be executable with
 * signatures already shared elsewhere.
 */
export enum ISafeTransactionState {
  live = 'live',
  superseded = 'superseded',
  executed = 'executed',
  removed = 'removed',
}

export enum ISafeCacheKind {
  cache = 'cache',
  budget = 'budget',
}

/** A tracked Safe to bring up to date: the first queue page, then `historyPages` history pages, one when absent. */
export interface IQueueSafeSync {
  network: NetworksEnum
  /** Checksummed. */
  address: string
  historyPages?: number
}

export interface IQueueSafeRead {
  sentAt: number
  network: NetworksEnum
  /** Checksummed. The upstream service answers 422 for any other form. */
  address: string
  kind: ISafeReadKind
  limit?: number
  offset?: number
  /** Queue and history: narrow to transactions aimed at one target, checksummed. */
  to?: string
  /** History only: inclusive nonce window, decimal strings to preserve uint256 precision. */
  nonceGte?: string
  nonceLte?: string
}

/**
 * A gateway handler cannot throw across RabbitMQ, so it answers with the failure instead and the
 * controller turns it back into a status. Mirrors `ICrossChainGasQueueError`.
 */
export interface ISafeReadError {
  safeError: {
    code: ISafeErrorCode
    error: string
    status: number
    retryAfter?: number
  }
}

export type ISafeReadResult = ISafeInfoResponse | ISafeQueueResponse | ISafeNextNonceResponse | ISafeReadError
