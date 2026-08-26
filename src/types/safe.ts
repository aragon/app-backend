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
}

export enum ISafeReadKind {
  info = 'info',
  queue = 'queue',
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

export interface IQueueSafeRead {
  sentAt: number
  network: NetworksEnum
  /** Checksummed. The upstream service answers 422 for any other form. */
  address: string
  kind: ISafeReadKind
  limit?: number
  offset?: number
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
