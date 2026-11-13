import PermissionState, { POWERFUL_PERMISSIONS } from '@modules/proposalChecks/permissions'
import PluginSetupFacts from '@modules/proposalChecks/pluginSetups'
import { nameOf } from '@modules/proposalChecks/naming'
import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
  type IAssessmentFlatAction,
  IAssessmentSeverity,
  type IPluginSetupFacts,
} from '@types'

export const PLUGIN_SETUP_CHECK_ID = 'control/pluginSetup'

const ROOT = PermissionState.idOf('ROOT_PERMISSION')

/** Plugin types through which the DAO's proposals are decided and executed. */
const GOVERNANCE_TYPES = new Set(['tokenVoting', 'multisig', 'admin', 'spp', 'lockToVote'])

/**
 * Rule "Governance plugins are installed, updated or removed". Every setup is a change to
 * notify. It becomes a risk when the setup code is not a published build, when its permissions
 * hand a power outside the DAO and its plugins, or when it removes the DAO's only governance
 * plugin. It stays for a person when the index has no preparation for it, when what is applied
 * is not what was prepared, or when an update does not move to a higher build of the same
 * release. The ROOT window around the apply is graded by the permissions rule.
 */
const PluginSetupCheck = {
  id: PLUGIN_SETUP_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }
    const findings = ctx.actions.flatMap(action => {
      const call = PluginSetupFacts.callOf(action)
      return call ? [PluginSetupCheck._grade(action, ctx)] : []
    })
    return { status: IAssessmentCheckStatus.Ok, findings }
  },

  _grade(action: IAssessmentFlatAction, ctx: Readonly<IAssessmentContext>): IAssessmentFinding {
    const facts = ctx.pluginSetups[action.path] ?? null
    const call = PluginSetupFacts.callOf(action)!
    const limits = ['resulting permission set not judged against what this DAO needs', 'setup contract code not read']
    const finding = (
      kind: IAssessmentFindingKind,
      severity: IAssessmentSeverity | undefined,
      title: string,
      details: string[],
    ): IAssessmentFinding => ({
      id: `${PLUGIN_SETUP_CHECK_ID}:${call.kind}:${action.path}`,
      checkId: PLUGIN_SETUP_CHECK_ID,
      kind,
      ...(severity ? { severity } : {}),
      labels: [],
      notify: true,
      title,
      details,
      actionPaths: [action.path],
      evidenceLimit: limits.join('; '),
      after: facts ?? call,
    })

    const title = PluginSetupCheck._title(facts ?? { ...call, repoSubdomain: null, current: null }, ctx)
    if (!facts) {
      return finding(IAssessmentFindingKind.NeedsReview, undefined, title, [
        'the preparation, the repo and the plugin could not be read from the index',
      ])
    }

    const risks: Array<{ severity: IAssessmentSeverity; detail: string }> = []
    const reviews: string[] = []
    const details: string[] = []

    if (facts.dao !== ctx.request.daoAddress) {
      reviews.push(`the setup targets DAO ${facts.dao}, not this DAO`)
    }
    if (facts.repoSubdomain === null) {
      risks.push({
        severity: IAssessmentSeverity.High,
        detail: `plugin repo ${facts.repo} is not registered in the plugin repo registry: the setup code is not a published build`,
      })
    }
    if (!facts.prepared) {
      reviews.push('no preparation for this plugin found in the index')
    } else {
      details.push(`prepared by ${facts.prepared.sender}`)
      if (!facts.prepared.permissionsMatch) reviews.push('the permissions applied are not the ones prepared')
    }

    for (const p of facts.permissions) {
      if (p.op !== 'grant') continue
      const id = p.permissionId.toLowerCase()
      const name = PermissionState.nameOf(p.permissionId)
      if (id === ROOT) {
        risks.push({ severity: IAssessmentSeverity.Critical, detail: `grants ROOT on ${p.where} to ${p.who}` })
      } else if (POWERFUL_PERMISSIONS.has(id) && PluginSetupCheck._isOutsider(p.who, facts, ctx)) {
        risks.push({
          severity: IAssessmentSeverity.High,
          detail: `gives ${name} on ${p.where} to ${p.who}, outside the DAO and its plugins`,
        })
      }
    }
    details.push(`${facts.permissions.length} permission changes applied`)

    if (facts.kind === 'update' && facts.current) {
      if (facts.current.release !== facts.release)
        reviews.push(`moves from release ${facts.current.release} to release ${facts.release}`)
      else if (facts.build <= facts.current.build)
        reviews.push(`build ${facts.build} is not higher than the current build ${facts.current.build}`)
      if (facts.metadataOnly === true)
        details.push('metadata-only update: the new build uses the same setup contract, no code changes')
      if (facts.metadataOnly === null) limits.push('setup contracts of the two builds not compared')
      if (facts.current.asOf === 'now')
        limits.push("the plugin's version is today's record, not the one at the evidence block")
    }
    if (facts.kind === 'update' && !facts.current) reviews.push('the plugin being updated is not in the index')
    if (facts.kind === 'uninstall' && PluginSetupCheck._lastGovernancePlugin(facts, ctx)) {
      risks.push({
        severity: IAssessmentSeverity.High,
        detail: "removes the DAO's only governance plugin: no proposal can be decided afterwards",
      })
    }

    const window = PluginSetupCheck._rootWindow(action, ctx)
    if (window) details.push(window)

    if (risks.length) {
      const severity = risks.some(r => r.severity === IAssessmentSeverity.Critical)
        ? IAssessmentSeverity.Critical
        : IAssessmentSeverity.High
      return finding(IAssessmentFindingKind.Risk, severity, title, [
        ...details,
        ...risks.map(r => r.detail),
        ...reviews,
      ])
    }
    if (reviews.length) return finding(IAssessmentFindingKind.NeedsReview, undefined, title, [...details, ...reviews])
    return finding(IAssessmentFindingKind.Change, undefined, title, details)
  },

  _title(
    facts: Pick<IPluginSetupFacts, 'kind' | 'plugin' | 'repo' | 'release' | 'build' | 'repoSubdomain' | 'current'>,
    ctx: Readonly<IAssessmentContext>,
  ): string {
    const name = facts.repoSubdomain ?? `repo ${facts.repo}`
    const subject = facts.current?.interfaceType
      ? `the ${facts.current.interfaceType} plugin ${facts.plugin}`
      : nameOf(facts.plugin, ctx)
    switch (facts.kind) {
      case 'install':
        return `Installs ${name} release ${facts.release} build ${facts.build} at ${facts.plugin}`
      case 'update':
        return facts.current
          ? `Updates ${subject} from ${facts.current.release}.${facts.current.build} to ${facts.release}.${facts.build}`
          : `Updates ${subject} to ${name} ${facts.release}.${facts.build}`
      case 'uninstall':
        return `Uninstalls ${subject}`
    }
  },

  /** The DAO, its installed plugins and the plugin being set up are the system; anyone else is an outsider. */
  _isOutsider(who: string, facts: IPluginSetupFacts, ctx: Readonly<IAssessmentContext>): boolean {
    const key = who
    if (key === ctx.request.daoAddress || key === facts.plugin) return false
    return !ctx.plugins.some(p => p.address === key)
  },

  _lastGovernancePlugin(facts: IPluginSetupFacts, ctx: Readonly<IAssessmentContext>): boolean {
    const governance = ctx.plugins.filter(p => !p.isSubPlugin && GOVERNANCE_TYPES.has(p.interfaceType))
    return governance.length === 1 && governance[0].address === facts.plugin
  },

  /** Whether the batch grants ROOT to the processor before the apply and takes it back after; the permissions rule grades what it finds. */
  _rootWindow(action: IAssessmentFlatAction, ctx: Readonly<IAssessmentContext>): string | null {
    const processor = action.target
    const dao = ctx.request.daoAddress
    const ops = ctx.actions
      .filter(a => a.operation !== 'delegatecall' && a.target === dao && PermissionState.isPermissionCall(a))
      .flatMap(a => PermissionState.opsOf(a))
      .filter(o => o.permissionId.toLowerCase() === ROOT && o.who === processor && o.where === dao)
    const granted = ops.some(o => o.op === 'grant')
    const revoked = ops.some(o => o.op === 'revoke')
    if (granted && revoked) return 'ROOT is granted to the setup processor and revoked again within this batch'
    if (granted) return 'ROOT granted to the setup processor is not revoked in this batch'
    return null
  },
}

export default PluginSetupCheck
