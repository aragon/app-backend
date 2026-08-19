import { type HexAddress, type NetworksEnum } from '@types'

/**
 * Access-control schemes a contract can advertise. A contract can hold several
 * at once — OZ's Ownable and AccessControl are not exclusive — so reports carry
 * a list rather than a single value.
 */
export enum IAccessControlScheme {
  ownable = 'ownable',
  ownable2Step = 'ownable2Step',
  accessControl = 'accessControl',
  accessControlEnumerable = 'accessControlEnumerable',
  accessManaged = 'accessManaged',
}

/**
 * What a function demands of its caller, as recovered from a probe.
 *
 * `none` means the call got past every check from an address holding nothing.
 * `unknown` means the revert was not an authorisation error we recognise — an
 * unrelated `require` firing first looks exactly like this, so it is "we could
 * not tell", never "there is no guard".
 */
export enum IAccessControlGuardRequirement {
  none = 'none',
  owner = 'owner',
  role = 'role',
  authority = 'authority',
  unknown = 'unknown',
}

/**
 * One role on a contract.
 *
 * `name` is null for a role id the probe named but no public getter exposes.
 * `members` is null when the contract is not AccessControlEnumerable — that is
 * "not enumerable", distinct from an empty array meaning "nobody holds it".
 */
export interface IAccessControlRole {
  id: string
  name: string | null
  adminRole: string | null
  members: HexAddress[] | null
}

/** One state-changing function and what it demands. */
export interface IAccessControlGuard {
  selector: string
  signature: string
  requirement: IAccessControlGuardRequirement
  role: string | null
  /**
   * True when the requirement was deduced from who could call it rather than
   * read out of a revert. Pre-0.8 contracts revert with no data, so `onlyOwner`
   * is invisible to the normal probe and only shows up as "the owner gets
   * through and nobody else does" — good evidence, not proof. A function gated
   * on something the owner happens to satisfy would look identical.
   */
  inferred?: boolean
}

export interface IAccessControlDetectOptions {
  /** Skips the explorer lookup when the caller already has the ABI. */
  abi?: ReadonlyArray<unknown>
  /** Off by default: probing costs one eth_call per state-changing function. */
  probeGuards?: boolean
  /** Address the probe claims to call from. Must hold no roles anywhere. */
  probeFrom?: string
  /** Upper bound on probe calls per contract; the rest are skipped and warned about. */
  maxProbes?: number
}

/**
 * The result of classifying one contract.
 *
 * `supportsAccessControlInterface` is null when the contract does not answer
 * ERC-165 at all. A false there is weak evidence — Ownable has no registered
 * interface id, so ERC-165 can only ever confirm the roles scheme.
 *
 * `guards` is null when probing was not requested, as opposed to an empty array
 * meaning "probed, found no state-changing functions".
 */
export interface IAccessControlReport {
  address: HexAddress
  network: NetworksEnum
  schemes: IAccessControlScheme[]
  supportsAccessControlInterface: boolean | null
  owner: HexAddress | null
  pendingOwner: HexAddress | null
  authority: HexAddress | null
  roles: IAccessControlRole[]
  guards: IAccessControlGuard[] | null
}
