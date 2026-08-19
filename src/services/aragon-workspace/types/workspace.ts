import { type HexAddress, type NetworksEnum } from '@types'
import { type IAccessControlGuardRequirement, type IAccessControlScheme } from './accessControl'

export enum IWorkspaceStatus {
  pending = 'pending',
  scanning = 'scanning',
  ready = 'ready',
  failed = 'failed',
}

/**
 * Per-target outcome.
 *
 * `undetermined` is load-bearing: no ABI could be obtained, so nothing is known
 * about the target's access control. It must never be read as "has none".
 */
export enum IWorkspaceTargetStatus {
  pending = 'pending',
  done = 'done',
  undetermined = 'undetermined',
  notAContract = 'notAContract',
  failed = 'failed',
}

/** What a privileged address turned out to be. */
export enum IWorkspaceAccountType {
  dao = 'dao',
  plugin = 'plugin',
  safe = 'safe',
  eoa = 'eoa',
  contract = 'contract',
}

export interface IWorkspaceCreateParams {
  name: string
  creator: HexAddress
  network: NetworksEnum
  targets: HexAddress[]
}

/** An address holding a role, or ownership when `role` is null. */
export interface IWorkspaceHolder {
  target: HexAddress
  role: string | null
  account: HexAddress
}

/**
 * One thing that gates functions on a target: what it demands, who satisfies it,
 * and what it protects.
 *
 * Only gates are recorded. A function the probe found open, or could not
 * classify, has nothing to attribute to anybody and is left out — so an empty
 * `gates` means "nothing gated was found", not "the target was not scanned".
 */
export interface IWorkspaceGate {
  /** role, owner or authority — never none or unknown. */
  requirement: IAccessControlGuardRequirement
  role: string | null
  roleName: string | null
  /**
   * True when the requirement was deduced from who could call it rather than
   * read out of a revert — see IAccessControlGuard.inferred. A gate is wholly
   * inferred or wholly probed; the two never share one.
   */
  inferred: boolean
  /**
   * Who satisfies this gate right now, each resolved to what it actually is.
   * Empty means gated but nobody found. Direct holders only — an account that
   * administers the role could grant itself in, and that path is deliberately
   * not modelled.
   */
  holders: IWorkspaceHolderRef[]
  selectors: Array<{ selector: string; signature: string }>
}

/** A privileged address, resolved against our own DAO/plugin records and a Safe fingerprint. */
export interface IWorkspaceHolderRef {
  address: HexAddress
  type: IWorkspaceAccountType
  /** DAO name or plugin interface type; null when there is nothing to name. */
  ref: string | null
}

// ── API responses ────────────────────────────────────────────────────────────

/** One function an account can call on one target. */
export interface IWorkspaceCapabilityView {
  target: HexAddress
  selector: string
  functionName: string | null
  viaRole: string | null
  roleName: string | null
}

/** What protects one contract. */
export interface IWorkspaceTargetView {
  address: HexAddress
  status: IWorkspaceTargetStatus
  schemes: IAccessControlScheme[]
  owner: HexAddress | null
  pendingOwner: HexAddress | null
  authority: HexAddress | null
  gates: IWorkspaceGate[]
  error: string | null
}

/** One row in a creator's list, without the per-target detail. */
export interface IWorkspaceSummaryView {
  id: string
  name: string
  creator: HexAddress
  network: NetworksEnum
  status: IWorkspaceStatus
  targets: number
  createdAt: Date
}

/**
 * The workspace and what protects each target. A gate already carries its holders
 * and the selectors it guards, so the per-account view of the same facts lives at
 * /capabilities rather than being repeated here.
 */
export interface IWorkspaceView {
  id: string
  name: string
  creator: HexAddress
  network: NetworksEnum
  status: IWorkspaceStatus
  error: string | null
  counts: {
    targets: number
    gates: number
    accounts: number
    capabilities: number
  }
  targets: IWorkspaceTargetView[]
}
