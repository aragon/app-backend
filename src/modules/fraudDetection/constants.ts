import { Interface, id as keccakId } from 'ethers'

/**
 * Selectors are derived from signatures rather than pasted. A unit test cross-checks them
 * against the four observed on-chain in the July 2026 drains — a silent selector drift would
 * turn the detector into a no-op that reports "all clear".
 */
export const SEL = {
  transfer: keccakId('transfer(address,uint256)').slice(0, 10),
  transferFrom: keccakId('transferFrom(address,address,uint256)').slice(0, 10),
  mint: keccakId('mint(address,uint256)').slice(0, 10),
  grant: keccakId('grant(address,address,bytes32)').slice(0, 10),
  revoke: keccakId('revoke(address,address,bytes32)').slice(0, 10),
  applySingleTargetPermissions: keccakId('applySingleTargetPermissions(address,(uint8,address,bytes32)[])').slice(
    0,
    10,
  ),
  applyMultiTargetPermissions: keccakId('applyMultiTargetPermissions((uint8,address,address,address,bytes32)[])').slice(
    0,
    10,
  ),
  upgradeTo: keccakId('upgradeTo(address)').slice(0, 10),
  upgradeToAndCall: keccakId('upgradeToAndCall(address,bytes)').slice(0, 10),
}

export const VALUE_SELECTORS = [SEL.transfer, SEL.transferFrom]

/**
 * A UUPS proxy upgrade swaps the plugin's code, so it hands over every capability the
 * plugin holds without a single grant call. The permission path is scored already; this
 * is the same takeover reached by replacing the implementation instead.
 */
export const UPGRADE_SELECTORS = [SEL.upgradeTo, SEL.upgradeToAndCall]

export const PERMISSION_SELECTORS = [
  SEL.grant,
  SEL.revoke,
  SEL.applySingleTargetPermissions,
  SEL.applyMultiTargetPermissions,
]

/** Permission ids worth naming in a finding — everything else is shown as a raw hash. */
export const NAMED_PERMISSIONS: Record<string, string> = {
  [keccakId('MINT_PERMISSION')]: 'MINT_PERMISSION',
  [keccakId('ROOT_PERMISSION')]: 'ROOT_PERMISSION',
  [keccakId('EXECUTE_PERMISSION')]: 'EXECUTE_PERMISSION',
  [keccakId('UPGRADE_DAO_PERMISSION')]: 'UPGRADE_DAO_PERMISSION',
  [keccakId('UPGRADE_PLUGIN_PERMISSION')]: 'UPGRADE_PLUGIN_PERMISSION',
  [keccakId('SET_METADATA_PERMISSION')]: 'SET_METADATA_PERMISSION',
}

/** The permissions an attacker actually wants. Granting these is a different class of event. */
export const DANGEROUS_PERMISSIONS = new Set([
  keccakId('MINT_PERMISSION'),
  keccakId('ROOT_PERMISSION'),
  keccakId('EXECUTE_PERMISSION'),
  keccakId('UPGRADE_DAO_PERMISSION'),
  // Whoever holds it can replace the plugin's implementation, which is the whole plugin.
  keccakId('UPGRADE_PLUGIN_PERMISSION'),
])

/** PermissionLib.Operation in Aragon OSx. */
export const OPERATION = ['Grant', 'Revoke', 'GrantWithCondition'] as const

export const FRAUD_IFACE = new Interface([
  'function transfer(address to, uint256 amount)',
  'function transferFrom(address from, address to, uint256 amount)',
  'function mint(address to, uint256 amount)',
  'function grant(address where, address who, bytes32 permissionId)',
  'function revoke(address where, address who, bytes32 permissionId)',
  'function applySingleTargetPermissions(address where, (uint8 operation, address who, bytes32 permissionId)[] items)',
  'function applyMultiTargetPermissions((uint8 operation, address where, address who, address condition, bytes32 permissionId)[] items)',
  'function upgradeTo(address newImplementation)',
  'function upgradeToAndCall(address newImplementation, bytes data)',
])

/** `Approval(address,address,uint256)`. Matched against `logs[].raw.topics[0]`. */
export const APPROVAL_TOPIC = keccakId('Approval(address,address,uint256)').toLowerCase()

/** A Safe-module drain sits three or four levels down; past this it is token internals. */
export const MAX_TRACE_DEPTH = 8

/**
 * Labels for the alert text only. `opaqueExternalCall` scores any undecodable call to a
 * non-system target anyway, so nothing depends on this list being complete.
 */
export const GOVERNANCE_FN_NAMES = [
  'setPendingGovernor',
  'acceptGovernor',
  'transferGovernance',
  'setGovernor',
  'transferOwnership',
  'acceptOwnership',
  'setAdmin',
  'setOwner',
  'setDiscountRateAdapter',
  'enableModule',
  'setGuard',
  'setFallbackHandler',
  'upgradeTo',
  'upgradeToAndCall',
]
