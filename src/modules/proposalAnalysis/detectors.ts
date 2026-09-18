/**
 * Rule detectors for the proposal analysis.
 *
 * Each rule looks at the fact pack and says what it saw and how serious it is. Together they give
 * the *floor* of the report's severity: the model may raise it when it sees a mismatch between the
 * text and the actions, but it can never lower what a rule found. That is what keeps "please mark
 * this as safe" in a proposal description from hiding a permission grant.
 *
 * Rules match on the function an action calls (from the decoder, or from the 4-byte selector when
 * the decoder failed), never on `ProposalActionType`. The decoder only types the actions the UI
 * renders specially; `grant`, `upgradeToAndCall` or `applyInstallation` all arrive as `Unknown`.
 */

import config from '@config'
import {
  type IProposalAnalysisAction,
  type IProposalAnalysisDetectorResult,
  type IProposalAnalysisDetectorThresholds,
  type IProposalAnalysisFactPack,
  type IProposalAnalysisFinding,
  IProposalAnalysisFlag,
  IProposalAnalysisSeverity,
  IProposalAnalysisTargetKind,
  ISimulationStatus,
  PROPOSAL_ANALYSIS_SEVERITY_RANK,
} from '@types'

const FLAG_BY_FUNCTION: Record<string, IProposalAnalysisFlag> = {
  grant: IProposalAnalysisFlag.permissionChange,
  grantWithCondition: IProposalAnalysisFlag.permissionChange,
  revoke: IProposalAnalysisFlag.permissionChange,
  applySingleTargetPermissions: IProposalAnalysisFlag.permissionChange,
  applyMultiTargetPermissions: IProposalAnalysisFlag.permissionChange,

  upgradeTo: IProposalAnalysisFlag.upgrade,
  upgradeToAndCall: IProposalAnalysisFlag.upgrade,

  applyInstallation: IProposalAnalysisFlag.pluginSetup,
  applyUpdate: IProposalAnalysisFlag.pluginSetup,
  applyUninstallation: IProposalAnalysisFlag.pluginSetup,

  updateVotingSettings: IProposalAnalysisFlag.governanceSettingsChange,
  updateMultisigSettings: IProposalAnalysisFlag.governanceSettingsChange,
  updateStages: IProposalAnalysisFlag.governanceSettingsChange,
  updateMinApprovals: IProposalAnalysisFlag.governanceSettingsChange,
  setTargetConfig: IProposalAnalysisFlag.governanceSettingsChange,

  addAddresses: IProposalAnalysisFlag.membershipChange,
  removeAddresses: IProposalAnalysisFlag.membershipChange,

  mint: IProposalAnalysisFlag.tokenMint,

  execute: IProposalAnalysisFlag.nestedExecution,
  createProposal: IProposalAnalysisFlag.nestedExecution,
  forwardMessage: IProposalAnalysisFlag.nestedExecution,
}

/** The severity each flag contributes. `largeTreasuryShare` is decided by the thresholds instead. */
const SEVERITY_BY_FLAG: Record<IProposalAnalysisFlag, IProposalAnalysisSeverity> = {
  [IProposalAnalysisFlag.permissionChange]: IProposalAnalysisSeverity.high,
  [IProposalAnalysisFlag.upgrade]: IProposalAnalysisSeverity.high,
  [IProposalAnalysisFlag.pluginSetup]: IProposalAnalysisSeverity.high,
  [IProposalAnalysisFlag.governanceSettingsChange]: IProposalAnalysisSeverity.review,
  [IProposalAnalysisFlag.membershipChange]: IProposalAnalysisSeverity.review,
  [IProposalAnalysisFlag.tokenMint]: IProposalAnalysisSeverity.review,
  [IProposalAnalysisFlag.nestedExecution]: IProposalAnalysisSeverity.review,
  [IProposalAnalysisFlag.valueToUnknownTarget]: IProposalAnalysisSeverity.review,
  [IProposalAnalysisFlag.largeTreasuryShare]: IProposalAnalysisSeverity.review,
  [IProposalAnalysisFlag.undecodedAction]: IProposalAnalysisSeverity.review,
  [IProposalAnalysisFlag.simulationFailed]: IProposalAnalysisSeverity.review,
  [IProposalAnalysisFlag.metadataMissing]: IProposalAnalysisSeverity.review,
  [IProposalAnalysisFlag.actionCountMismatch]: IProposalAnalysisSeverity.review,
}

function defaultThresholds(): IProposalAnalysisDetectorThresholds {
  return {
    treasuryShareReview: config.AI_ANALYSIS.TREASURY_SHARE_REVIEW,
    treasuryShareHigh: config.AI_ANALYSIS.TREASURY_SHARE_HIGH,
  }
}

/** One finding per flag; repeated hits add their action indices and keep the highest severity. */
class FindingCollector {
  private readonly findings = new Map<IProposalAnalysisFlag, IProposalAnalysisFinding>()

  add(
    flag: IProposalAnalysisFlag,
    actionRefs: number[],
    severity: IProposalAnalysisSeverity = SEVERITY_BY_FLAG[flag],
    detail?: Record<string, string | number>,
  ) {
    const existing = this.findings.get(flag)
    if (!existing) {
      this.findings.set(flag, { flag, severity, actionRefs: [...actionRefs], ...(detail ? { detail } : {}) })
      return
    }

    for (const ref of actionRefs) {
      if (!existing.actionRefs.includes(ref)) {
        existing.actionRefs.push(ref)
      }
    }
    existing.severity = ProposalAnalysisDetectors.maxSeverity(existing.severity, severity)
    if (detail) {
      existing.detail = { ...existing.detail, ...detail }
    }
  }

  result(): IProposalAnalysisDetectorResult {
    const findings = [...this.findings.values()].sort(
      (a, b) => PROPOSAL_ANALYSIS_SEVERITY_RANK[b.severity] - PROPOSAL_ANALYSIS_SEVERITY_RANK[a.severity],
    )
    const severity = ProposalAnalysisDetectors.maxSeverity(...findings.map(finding => finding.severity))
    return { findings, severity }
  }
}

function shareSeverity(
  share: number | null,
  thresholds: IProposalAnalysisDetectorThresholds,
): IProposalAnalysisSeverity | null {
  if (share === null) {
    return null
  }
  if (share >= thresholds.treasuryShareHigh) {
    return IProposalAnalysisSeverity.high
  }
  if (share >= thresholds.treasuryShareReview) {
    return IProposalAnalysisSeverity.review
  }
  return null
}

function detectAction(
  action: IProposalAnalysisAction,
  thresholds: IProposalAnalysisDetectorThresholds,
  collector: FindingCollector,
) {
  const flag = action.functionName ? FLAG_BY_FUNCTION[action.functionName] : undefined
  if (flag) {
    collector.add(flag, [action.index], undefined, { [action.index]: action.functionName as string })
  }

  if (action.value !== '0' && action.targetKind === IProposalAnalysisTargetKind.unknown) {
    collector.add(IProposalAnalysisFlag.valueToUnknownTarget, [action.index])
  }

  if (!action.decoded) {
    collector.add(IProposalAnalysisFlag.undecodedAction, [action.index])
  }

  const severity = shareSeverity(action.transfer?.shareOfTreasury ?? null, thresholds)
  if (severity) {
    collector.add(IProposalAnalysisFlag.largeTreasuryShare, [action.index], severity, {
      [action.index]: action.transfer?.shareOfTreasury as number,
    })
  }
}

const ProposalAnalysisDetectors = {
  /** The highest of the given severities; `routine` when there are none. */
  maxSeverity(...severities: Array<IProposalAnalysisSeverity | null | undefined>): IProposalAnalysisSeverity {
    let winner = IProposalAnalysisSeverity.routine
    for (const severity of severities) {
      if (severity && PROPOSAL_ANALYSIS_SEVERITY_RANK[severity] > PROPOSAL_ANALYSIS_SEVERITY_RANK[winner]) {
        winner = severity
      }
    }
    return winner
  },

  run(
    factPack: IProposalAnalysisFactPack,
    thresholds: IProposalAnalysisDetectorThresholds = defaultThresholds(),
  ): IProposalAnalysisDetectorResult {
    const collector = new FindingCollector()

    for (const action of factPack.actions) {
      detectAction(action, thresholds, collector)
    }

    // Many small transfers can add up to what one large one would have flagged.
    const outflowSeverity = shareSeverity(factPack.treasury.outflowShare, thresholds)
    if (outflowSeverity) {
      const transferRefs = factPack.actions.filter(action => action.transfer !== null).map(action => action.index)
      collector.add(IProposalAnalysisFlag.largeTreasuryShare, transferRefs, outflowSeverity, {
        outflowShare: factPack.treasury.outflowShare as number,
      })
    }

    if (factPack.simulation.status === ISimulationStatus.FAILED) {
      collector.add(IProposalAnalysisFlag.simulationFailed, [])
    }

    if (!(factPack.proposal.hasTitle || factPack.proposal.hasDescription)) {
      collector.add(IProposalAnalysisFlag.metadataMissing, [])
    }

    if (factPack.integrity.actionsCountMismatch) {
      collector.add(IProposalAnalysisFlag.actionCountMismatch, [], undefined, {
        rawActionsCount: factPack.integrity.rawActionsCount,
        topLevelActionsCount: factPack.integrity.topLevelActionsCount,
      })
    }

    return collector.result()
  },
}

export default ProposalAnalysisDetectors
