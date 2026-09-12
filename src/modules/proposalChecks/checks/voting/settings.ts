import VotingSettingsFacts, { type IVotingSettingsCall } from '@modules/proposalChecks/votingSettings'
import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
  type IAssessmentFlatAction,
} from '@types'

export const VOTING_SETTINGS_CHECK_ID = 'voting/settings'

/** OSx ratios are parts per million. */
const RATIO_BASE = 1_000_000
const VOTING_MODES = ['standard', 'early execution', 'vote replacement']
const HOUR = 3600
const YEAR = 365 * 24 * 3600

type IDirection = 'reduced' | 'increased' | 'changed' | 'unchanged' | 'unknown'

interface IFieldChange {
  field: string
  before: string | null
  after: string
  direction: IDirection
  line: string
}

/** What each field means and which way a smaller value cuts. */
const FIELDS: Record<
  string,
  { label: string; unit: 'ratio' | 'seconds' | 'units' | 'count' | 'bool' | 'mode'; lowerIs: IDirection }
> = {
  supportThreshold: { label: 'support threshold', unit: 'ratio', lowerIs: 'reduced' },
  supportThresholdRatio: { label: 'support threshold', unit: 'ratio', lowerIs: 'reduced' },
  minParticipation: { label: 'minimum participation', unit: 'ratio', lowerIs: 'reduced' },
  minParticipationRatio: { label: 'minimum participation', unit: 'ratio', lowerIs: 'reduced' },
  minApprovalRatio: { label: 'minimum approval', unit: 'ratio', lowerIs: 'reduced' },
  minDuration: { label: 'minimum voting duration', unit: 'seconds', lowerIs: 'reduced' },
  proposalDuration: { label: 'voting duration', unit: 'seconds', lowerIs: 'reduced' },
  minProposerVotingPower: { label: 'voting power needed to propose', unit: 'units', lowerIs: 'reduced' },
  minApprovals: { label: 'required approvals', unit: 'count', lowerIs: 'reduced' },
  onlyListed: { label: 'only listed members may propose', unit: 'bool', lowerIs: 'reduced' },
  votingMode: { label: 'voting mode', unit: 'mode', lowerIs: 'changed' },
}

/**
 * Rule "Voting requirements change". Every field of a settings update is compared with the
 * value the plugin ran with at the evidence block, and the direction follows the formula the
 * field feeds: support is yes over yes plus no and must exceed the threshold, participation is
 * every vote over total power and must reach the minimum, minimum approval is a floor on yes
 * power, and a shorter duration leaves less time to vote or veto. A reduction makes later
 * proposals easier to pass; the settings of proposals already open are frozen. Without the prior
 * value the direction stays unknown; an update is never taken as a weakening by itself.
 */
const VotingSettingsCheck = {
  id: VOTING_SETTINGS_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }
    const findings: IAssessmentFinding[] = []
    for (const action of ctx.actions) {
      const call = VotingSettingsFacts.callOf(action)
      if (call) findings.push(VotingSettingsCheck._finding(action, call, ctx))
    }
    return { status: IAssessmentCheckStatus.Ok, findings }
  },

  _finding(
    action: IAssessmentFlatAction,
    call: IVotingSettingsCall,
    ctx: Readonly<IAssessmentContext>,
  ): IAssessmentFinding {
    const facts = ctx.votingSettings[action.path] ?? null
    const before = facts?.before ?? null
    const changes = Object.entries(call.values).map(([field, after]) =>
      VotingSettingsCheck._change(field, before?.[field] ?? null, after),
    )
    const moved = changes.filter(c => c.direction !== 'unchanged')
    const reductions = moved.filter(c => c.direction === 'reduced')
    const plugin = ctx.plugins.find(p => p.address === action.target)
    const subject = plugin ? `the ${plugin.interfaceType} plugin ${action.target}` : `plugin ${action.target}`

    const limits: string[] = []
    if (!before)
      limits.push('prior settings not indexed at the evidence block, so the direction of each change is unknown')
    else if (changes.some(c => c.before === null))
      limits.push('some prior values are not indexed, so their direction is unknown')
    if (!plugin) limits.push('the target is not a plugin installed on this DAO at the evidence block')
    const bounds = changes.filter(
      c => FIELDS[c.field]?.unit === 'seconds' && (Number(c.after) < HOUR || Number(c.after) > YEAR),
    )
    for (const c of bounds)
      limits.push(
        `${FIELDS[c.field].label} of ${c.after} seconds is outside the one hour to one year the plugin accepts; execute reverts on it`,
      )

    const title =
      moved.length === 0
        ? `Rewrites the settings of ${subject} with the values it already has`
        : `${reductions.length ? 'Lowers' : 'Changes'} the voting requirements of ${subject}: ${moved.map(c => c.line).join('; ')}`
    const details = [
      ...moved.map(c => `${c.line}: ${VotingSettingsCheck._verdict(c.direction)}`),
      'settings are frozen into each proposal at creation, so this affects only proposals created afterwards',
    ]

    return {
      id: `${VOTING_SETTINGS_CHECK_ID}:${action.path}`,
      checkId: VOTING_SETTINGS_CHECK_ID,
      kind: IAssessmentFindingKind.Change,
      labels: [],
      notify: moved.length > 0,
      title,
      details,
      actionPaths: [action.path],
      evidenceLimit: limits.length ? limits.join('; ') : undefined,
      after: { plugin: call.plugin, before, after: call.values, changes: changes.map(({ line, ...c }) => c) },
    }
  },

  _change(field: string, before: string | null, after: string): IFieldChange {
    const meta = FIELDS[field] ?? { label: field, unit: 'units' as const, lowerIs: 'changed' as const }
    const show = (v: string) => VotingSettingsCheck._format(v, meta.unit)
    let direction: IDirection
    if (before === null) direction = 'unknown'
    else if (before === after) direction = 'unchanged'
    else if (meta.unit === 'mode') direction = 'changed'
    else if (meta.unit === 'bool') direction = after === 'false' ? 'reduced' : 'increased'
    else direction = VotingSettingsCheck._direction(BigInt(before), BigInt(after), meta.lowerIs)
    const line =
      before === null ? `${meta.label} set to ${show(after)}` : `${meta.label} from ${show(before)} to ${show(after)}`
    return { field, before, after, direction, line }
  },

  /** Which way a move cuts: the field says what a smaller value means, so a larger one is its opposite. */
  _direction(before: bigint, after: bigint, lowerIs: IDirection): IDirection {
    if (after < before) return lowerIs
    return lowerIs === 'reduced' ? 'increased' : 'changed'
  },

  _verdict(direction: IDirection): string {
    switch (direction) {
      case 'reduced':
        return 'a reduction, later proposals pass more easily'
      case 'increased':
        return 'an increase, later proposals need more'
      case 'changed':
        return 'a change of mode, neither more nor less is needed'
      case 'unknown':
        return 'direction unknown without the prior value'
      default:
        return 'unchanged'
    }
  },

  _format(value: string, unit: string): string {
    switch (unit) {
      case 'ratio':
        return `${(Number(value) / (RATIO_BASE / 100)).toFixed(2).replace(/\.?0+$/, '')}%`
      case 'seconds': {
        const s = Number(value)
        if (s % 86400 === 0) return `${s / 86400} day${s === 86400 ? '' : 's'}`
        if (s % 3600 === 0) return `${s / 3600} hour${s === 3600 ? '' : 's'}`
        if (s % 60 === 0) return `${s / 60} minute${s === 60 ? '' : 's'}`
        return `${s} seconds`
      }
      case 'mode':
        return VOTING_MODES[Number(value)] ?? `mode ${value}`
      case 'bool':
        return value === 'true' ? 'yes' : 'no'
      case 'count':
        return value
      default:
        return `${value} units`
    }
  },
}

export default VotingSettingsCheck
