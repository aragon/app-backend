import type { HexAddress, NetworksEnum } from './networks'
import type { IPaginationParams } from './pagination'
import type { ISafeInfoResponse, ISafeMultisigTransaction } from './safe'

export interface IWorkspaceAccountRef {
  network: NetworksEnum
  address: HexAddress
}

export type IWorkspaceResource = 'assets' | 'transactions' | 'proposals' | 'members' | 'governances'

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
  /** Set when the account was not selected itself but reached through this selected DAO's process. */
  via?: IWorkspaceAccountRef
}

/**
 * A queued Safe transaction. Either the Safe is a selected account, or `via` names the selected DAO
 * whose process plugin the transaction is addressed to. Native details are kept as-is.
 */
export interface IWorkspacePendingDecision {
  source: 'safe'
  id: string
  network: NetworksEnum
  account: IWorkspaceAccountRef
  status: 'pending'
  submittedAt: number
  transaction: ISafeMultisigTransaction
  via?: { account: IWorkspaceAccountRef; pluginAddress: HexAddress }
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
