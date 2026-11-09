import type { HexAddress, NetworksEnum } from './networks'
import type { IPaginationParams } from './pagination'
import type { ISafeInfo, ISafeInfoResponse, ISafeMultisigTransaction } from './safe'

export interface IWorkspaceAccountRef {
  network: NetworksEnum
  address: HexAddress
}

export type IWorkspaceResource = 'assets' | 'transactions' | 'proposals' | 'members' | 'governances' | 'todo'

export interface IWorkspaceQuery<T = Record<string, never>> {
  accounts: IWorkspaceAccountRef[]
  filters: T
  pagination: IPaginationParams
}

export interface IWorkspaceCoverage {
  account: IWorkspaceAccountRef
  resource: IWorkspaceResource
  source: 'index' | 'safe'
  /** `partial` means the source holds more than the single page that was read. */
  status: 'available' | 'unverified' | 'partial' | 'unsupported' | 'unavailable'
  stale?: boolean
  error?: { code: string; retryAfter?: number }
}

export interface IWorkspaceAccount extends IWorkspaceAccountRef {
  type: 'dao' | 'safe' | 'unknown'
  status: 'available' | 'unsupported' | 'unavailable'
  indexed: boolean
  name?: string | null
  safe?: ISafeInfoResponse
  error?: { code: string; retryAfter?: number }
}

/**
 * A body plugin of a selected DAO. Processes such as the SPP have no members and are not listed,
 * nor are the Safes in their stages. A Safe selected as an account has no bodies.
 */
export interface IWorkspaceGovernance {
  address: HexAddress
  type: string
  /** The DAO's slug for the body, null for a plugin without one. */
  slug?: string | null
  name?: string | null
  description?: string | null
  processKey?: string | null
}

/** The bodies of one selected account. The members query attributes memberships to exactly this set. */
export interface IWorkspaceAccountGovernances {
  account: IWorkspaceAccountRef & { type: IWorkspaceAccount['type'] }
  governances: IWorkspaceGovernance[]
}

export interface IWorkspaceMembership {
  account: IWorkspaceAccountRef
  governance: { address: HexAddress; type: string }
  role: 'member' | 'owner'
  votingPower?: string
  tokenBalance?: string
}

export interface IWorkspaceMember {
  network: NetworksEnum
  address: HexAddress
  ens?: string | null
  avatar?: string | null
  memberships: IWorkspaceMembership[]
}

export interface IWorkspaceTodoQuery {
  accounts: IWorkspaceAccountRef[]
  /** The wallet whose to-do list is read. Eligibility is a property of this address. */
  memberAddress: HexAddress
  filters: { network?: NetworksEnum }
}

/** A live Safe transaction the member owns a signature on and has not confirmed yet. */
export interface IWorkspaceTodoTransaction {
  id: string
  account: IWorkspaceAccountRef
  /** Current Safe state the row is judged against; null when the chain read failed. */
  safe: Pick<ISafeInfo, 'nonce' | 'threshold' | 'version'> | null
  /** Another live row of the same Safe holds this nonce, so at most one of them can execute. */
  hasNonceRival: boolean
  transaction: ISafeMultisigTransaction
}
