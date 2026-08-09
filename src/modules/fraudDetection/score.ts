import type { IFraudAssessment, IFraudRiskContext, IFraudRiskLevel, IFraudSignal } from '@types'
import { PERMISSION_SELECTORS, SEL, VALUE_SELECTORS } from './constants'
import { extractMints, extractPermissionOps, extractTransfers } from './decode'

const short = (a?: string | null): string => (a ? `${a.slice(0, 8)}…${a.slice(-4)}` : '-')

export const levelFor = (score: number): IFraudRiskLevel => {
  if (score >= 70) return 'critical'
  if (score >= 45) return 'high'
  if (score >= 25) return 'medium'
  return 'low'
}

const NO_MATCH: IFraudAssessment = {
  matched: false,
  attackClass: [],
  permissionOps: [],
  transfers: [],
  mints: [],
  nativeValue: null,
  signals: [],
  score: 0,
  creationScore: 0,
  level: 'low',
  creationLevel: 'low',
  suppressedAs: null,
}

/**
 * Pure scoring — no I/O. Signal weights are the ones validated against the July 2026 drain
 * campaign by the scanGovernanceDrains retro scan; change them there first, then here.
 */
export const scoreProposal = (context: IFraudRiskContext): IFraudAssessment => {
  const actions = context.actions ?? []
  const selectors = actions.map(a => (a.data ?? '').slice(0, 10))

  const nativeValue = actions.find(a => a.value && a.value !== '0')?.value ?? null
  const permissionOps = extractPermissionOps(actions)
  const hasValueMove = selectors.some(s => VALUE_SELECTORS.includes(s)) || nativeValue != null
  const hasMint = selectors.includes(SEL.mint)
  const hasPermissionMove = selectors.some(s => PERMISSION_SELECTORS.includes(s))
  if (!hasValueMove && !hasMint && !hasPermissionMove) return NO_MATCH

  // The DAO and its own plugin are always legitimate endpoints; the caller adds the rest
  // (same-DAO plugins, protocol infra). Everything outside this set is an outsider.
  const system = new Set(context.systemAddresses ?? [])
  system.add(context.daoAddress)
  system.add(context.pluginAddress)

  const transfers = extractTransfers(actions)
  const mints = extractMints(actions)
  const holders = context.tokenHolders ?? new Set<string>()

  // Every way value can leave: ERC20 recipients, mint recipients, native-send targets.
  const nativeRecipients = actions.filter(a => a.value && a.value !== '0').map(a => a.to)
  const beneficiaries = [...transfers.map(t => t.to), ...mints.map(m => m.to), ...nativeRecipients]
  const outsideRecipients = [...new Set(beneficiaries.filter(to => !system.has(to) && !holders.has(to)))]

  const voters = [...new Set(context.voters ?? [])]
  const selfVoteOnly = voters.length === 1 && voters[0] === context.creatorAddress

  const signals: IFraudSignal[] = []

  if (context.priorProposals === 0 && context.priorVotes === 0) {
    signals.push({
      name: 'outsiderCreator',
      weight: 40,
      detail: 'creator has never proposed or voted in this DAO before',
      atCreation: true,
    })
  } else if (context.priorProposals >= 3 && context.priorVotes >= 3) {
    // A DAO's own operator installing a plugin uses the exact same grant → call → revoke
    // shape as the MINT attack. Without this, routine upgrades by established members
    // outrank the real drains. Track record is the only thing separating the two.
    signals.push({
      name: 'establishedCreator',
      weight: -35,
      detail: `creator has ${context.priorProposals} prior proposals and ${context.priorVotes} prior votes here`,
      atCreation: true,
    })
  }
  if (selfVoteOnly) {
    signals.push({
      name: 'selfVoteOnly',
      weight: 25,
      detail: 'the only vote cast is the creator’s own',
      atCreation: false,
    })
  }

  // What decides the permission weight is what is left behind. A STANDING dangerous grant
  // to an outsider is the takeover shape. A grant revoked in the same proposal leaves no
  // capability behind — its damage, if any, is in the middle calls, which the beneficiary
  // signals already score. Grants to the DAO's own plugins are wiring.
  // Fold the permission ops in execution order: only the LAST operation on a given
  // (where, who, permission) decides what the proposal leaves behind. A revoke placed
  // before the grant does not make that grant temporary.
  const finalOp = new Map<string, string>()
  const tripleOf = (op: (typeof permissionOps)[number]) => `${op.where}:${op.who}:${op.permissionId.toLowerCase()}`
  for (const op of permissionOps) finalOp.set(tripleOf(op), op.operation)
  const isTemporary = (op: (typeof permissionOps)[number]) => finalOp.get(tripleOf(op)) === 'Revoke'

  const dangerousGrants = permissionOps.filter(op => op.dangerous && op.operation !== 'Revoke')
  const standingOutsiderGrants = dangerousGrants.filter(op => !system.has(op.who) && !isTemporary(op))
  if (standingOutsiderGrants.length > 0) {
    signals.push({
      name: 'dangerousPermissionGrant',
      weight: 30,
      detail: standingOutsiderGrants.map(op => `${op.operation} ${op.permissionName} to ${short(op.who)}`).join('; '),
      atCreation: true,
    })
  } else if (dangerousGrants.length > 0) {
    signals.push({
      name: 'containedPermissionGrant',
      weight: 10,
      detail: dangerousGrants
        .map(op => `${op.operation} ${op.permissionName} to ${short(op.who)} (revoked in-proposal or system address)`)
        .join('; '),
      atCreation: true,
    })
  } else if (permissionOps.length > 0) {
    signals.push({
      name: 'permissionChange',
      weight: 10,
      detail: `${permissionOps.length} permission op(s)`,
      atCreation: true,
    })
  }

  // grant → call → revoke: the middle call uses the permission, the revoke hides it. Only
  // scored when the sandwich wraps extraction (an outsider beneficiary) — a plugin install
  // (ROOT to the setup processor → apply → revoke) uses the identical shape.
  const firstIsPermission = PERMISSION_SELECTORS.includes(selectors[0])
  const lastIsPermission = PERMISSION_SELECTORS.includes(selectors[selectors.length - 1])
  const opensWithGrant = permissionOps.length > 0 && permissionOps[0].operation !== 'Revoke'
  const closesWithRevoke = permissionOps[permissionOps.length - 1]?.operation === 'Revoke'
  const wrapsExtraction = outsideRecipients.length > 0
  if (
    actions.length >= 3 &&
    firstIsPermission &&
    lastIsPermission &&
    opensWithGrant &&
    closesWithRevoke &&
    wrapsExtraction
  ) {
    signals.push({
      name: 'permissionSandwich',
      weight: 25,
      detail: 'grant → call → revoke in one proposal, which covers the tracks on execution',
      atCreation: true,
    })
  }

  if (outsideRecipients.length > 0) {
    signals.push({
      name: 'recipientOutsider',
      weight: 15,
      detail: `pays ${outsideRecipients.map(short).join(', ')} — not the DAO, its plugins, or a token holder`,
      atCreation: true,
    })
  }

  if (context.minParticipation === 0) {
    signals.push({
      name: 'zeroQuorum',
      weight: 15,
      detail: 'minParticipation is 0 — a single vote carries it',
      atCreation: true,
    })
  }
  if (context.minDuration != null && context.minDuration < 24 * 3600) {
    signals.push({
      name: 'shortWindow',
      weight: 10,
      detail: `minDuration ${(context.minDuration / 3600).toFixed(1)}h leaves no time to react`,
      atCreation: true,
    })
  }
  if (!context.title && !context.description) {
    signals.push({ name: 'noDescription', weight: 5, detail: 'no title and no description', atCreation: true })
  }
  if (context.isSubPlugin) {
    signals.push({
      name: 'subPluginStage',
      weight: -20,
      detail: 'SPP sub-plugin — no direct DAO execute, must clear later stages',
      atCreation: true,
    })
  }

  // A new DAO's first proposal grants ROOT to install its plugins, and its creator has no
  // history because the DAO is minutes old. 13 of 34 hits in the July sweep were this.
  const daoAge = context.daoBlockTimestamp ? context.blockTimestamp - context.daoBlockTimestamp : null
  const targetsSelfOnly = actions.every(a => a.to === context.daoAddress)
  const isBootstrap = daoAge != null && daoAge < 3600 && targetsSelfOnly && context.daoAssetCount === 0

  const sum = (list: IFraudSignal[]) =>
    Math.max(
      0,
      list.reduce((total, s) => total + s.weight, 0),
    )
  const score = isBootstrap ? 0 : sum(signals)
  const creationScore = isBootstrap ? 0 : sum(signals.filter(s => s.atCreation))

  return {
    matched: true,
    attackClass: [
      ...(hasValueMove ? (['transfer'] as const) : []),
      ...(hasMint ? (['mint'] as const) : []),
      ...(hasPermissionMove ? (['permission'] as const) : []),
    ],
    permissionOps,
    transfers,
    mints,
    nativeValue,
    signals,
    score,
    creationScore,
    level: levelFor(score),
    creationLevel: levelFor(creationScore),
    suppressedAs: isBootstrap ? 'daoBootstrap' : null,
  }
}
