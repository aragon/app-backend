/**
 * Types for the AI proposal analysis.
 *
 * POST /v2/proposals/:id/analysis   generate the report and return it
 *
 * The backend builds a deterministic *fact pack* from indexed data, runs rule detectors over it,
 * and sends the pack plus the proposal text to the assistant, which writes the prose. The report
 * the model returns never carries its own numbers or addresses: every claim points back at fact
 * pack actions by index (`actionRefs`), and the renderer fills in the values from the pack.
 * Nothing is persisted in this iteration; the generation lives in `ProposalAnalysisModule.generate`
 * so a queue consumer can call the same function once reports are stored.
 *
 * The request/response shape is owned by the zod schema in the monorepo
 * (`packages/assistant-contracts/src/analysis.ts`). This repository cannot import that package,
 * so the types here mirror it by hand and `PROPOSAL_ANALYSIS_CONTRACT_VERSION` travels in every
 * request so a drift becomes a clear 400 instead of a confusing validation error.
 */

import { type NetworksEnum } from './networks'
import { type ISimulationStatus } from './tenderly'

/** Bump together with the zod schema whenever the fact pack or the report shape changes. */
export const PROPOSAL_ANALYSIS_CONTRACT_VERSION = 1

export enum IProposalAnalysisSeverity {
  routine = 'routine',
  review = 'review',
  high = 'high',
}

/** Rank used by `max(rules, model)`. Higher wins. */
export const PROPOSAL_ANALYSIS_SEVERITY_RANK: Record<IProposalAnalysisSeverity, number> = {
  [IProposalAnalysisSeverity.routine]: 0,
  [IProposalAnalysisSeverity.review]: 1,
  [IProposalAnalysisSeverity.high]: 2,
}

export enum IProposalAnalysisIntentVerdict {
  aligned = 'aligned',
  partial = 'partial',
  contradicted = 'contradicted',
}

/**
 * What the `to` of an action is, as far as the indexer knows. Decides whether sending native value
 * or unknown calldata there is worth a flag.
 */
export enum IProposalAnalysisTargetKind {
  /** The DAO contract itself. */
  dao = 'dao',
  /** A plugin installed in this DAO. */
  plugin = 'plugin',
  /** A contract the decoder resolved a name for (verified source, NatSpec, or a known token). */
  contract = 'contract',
  /** A plain value transfer with no calldata to an address we have no name for. */
  wallet = 'wallet',
  /** Calldata to an address we could not name. */
  unknown = 'unknown',
}

export interface IProposalAnalysisParameter {
  name: string | null
  type: string
  /** Stringified. BigInts become decimal strings, tuples and arrays become JSON. Long values are cut. */
  value: string
}

/** Present on actions that move treasury funds: ERC20 `transfer`/`transferFrom` and native transfers. */
export interface IProposalAnalysisTransfer {
  /** `ethers.ZeroAddress` for the native token. */
  tokenAddress: string
  symbol: string | null
  decimals: number | null
  recipient: string
  /** Smallest unit, as on chain. */
  amountRaw: string
  /** `amountRaw` divided by `10^decimals`, as a decimal string. Null when decimals are unknown. */
  amount: string | null
  amountUsd: number | null
  /** `amountUsd / dao.metrics.tvlUSD`, 0..1. Null when either side is unknown or the TVL is zero. */
  shareOfTreasury: number | null
  /** `amountRaw / DAO balance of this token`, 0..1, capped at 1. Null when the balance is unknown. */
  shareOfAssetBalance: number | null
}

export interface IProposalAnalysisAction {
  /** Position in the flat list. `actionRefs` in the report point here. */
  index: number
  /** Index of the `execute`/`createProposal`/`forwardMessage` action this one is nested in. */
  parentIndex: number | null
  depth: number
  /** `ProposalActionType` as stored on the proposal, `Unknown` when the decoder gave up. */
  type: string
  to: string
  targetKind: IProposalAnalysisTargetKind
  /** Contract name from the decoder, or the proxy name when the target is a proxy. */
  targetName: string | null
  /** Native value in wei, as a decimal string. */
  value: string
  /** First four bytes of the calldata, `0x`-prefixed. Null when there is no calldata. */
  selector: string | null
  /** Canonical text signature when known, e.g. `grant(address,address,bytes32)`. */
  signature: string | null
  functionName: string | null
  /** NatSpec notice of the function when the decoder found one. */
  notice: string | null
  parameters: IProposalAnalysisParameter[]
  /** False when the decoder produced no `inputData` for this action. */
  decoded: boolean
  transfer: IProposalAnalysisTransfer | null
  /** Set on `forwardMessage` actions: the chain the nested actions run on. */
  destinationChainId: number | null
}

export interface IProposalAnalysisStage {
  stageIndex: number
  name: string | null
  approvalThreshold: number | null
  vetoThreshold: number | null
  voteDuration: number | null
}

export interface IProposalAnalysisFactPack {
  contractVersion: number
  proposal: {
    id: string
    network: NetworksEnum
    daoAddress: string
    daoName: string | null
    pluginAddress: string
    pluginSubdomain: string | null
    creatorAddress: string
    /** Unix seconds. */
    startDate: number
    endDate: number
    isSubProposal: boolean
    executed: boolean
    hasTitle: boolean
    hasSummary: boolean
    hasDescription: boolean
  }
  governance: {
    votingMode: number | null
    supportThreshold: number | null
    minParticipation: number | null
    minDuration: number | null
    minApprovals: number | null
    onlyListed: boolean | null
    stages: IProposalAnalysisStage[]
  }
  treasury: {
    tvlUsd: number | null
    /** Sum of `amountUsd` over every transfer action. Null when no transfer could be priced. */
    outflowUsd: number | null
    /** `outflowUsd / tvlUsd`, 0..1. */
    outflowShare: number | null
  }
  actions: IProposalAnalysisAction[]
  simulation: {
    status: ISimulationStatus | null
    /** Unix ms. */
    runAt: number | null
  }
  integrity: {
    /** True while the decoder is still running; the fact pack is then incomplete. */
    decoding: boolean
    rawActionsCount: number
    topLevelActionsCount: number
    undecodedActionsCount: number
    /** `rawActions.length !== actions.length` - the decoder dropped or duplicated something. */
    actionsCountMismatch: boolean
  }
}

/** One rule that fired. */
export enum IProposalAnalysisFlag {
  /** `grant`, `revoke`, `grantWithCondition`, `apply*TargetPermissions`. */
  permissionChange = 'permissionChange',
  /** `upgradeTo`, `upgradeToAndCall` on any proxy. */
  upgrade = 'upgrade',
  /** `applyInstallation`, `applyUpdate`, `applyUninstallation` on the PluginSetupProcessor. */
  pluginSetup = 'pluginSetup',
  /** `updateVotingSettings`, `updateMultisigSettings`, `updateStages`, `updateMinApprovals`, `setTargetConfig`. */
  governanceSettingsChange = 'governanceSettingsChange',
  /** `addAddresses`, `removeAddresses` on a multisig or address list. */
  membershipChange = 'membershipChange',
  /** `mint` - dilutes token voters. */
  tokenMint = 'tokenMint',
  /** `execute`, `createProposal*`, `forwardMessage` - the action carries further actions. */
  nestedExecution = 'nestedExecution',
  /** Native value sent with calldata to an address nobody could name. */
  valueToUnknownTarget = 'valueToUnknownTarget',
  /** A single transfer, or all transfers together, move more than the configured share of the treasury. */
  largeTreasuryShare = 'largeTreasuryShare',
  /** The decoder produced no `inputData` for the action. */
  undecodedAction = 'undecodedAction',
  /** The stored Tenderly simulation reverted. */
  simulationFailed = 'simulationFailed',
  /** Neither title nor description. */
  metadataMissing = 'metadataMissing',
  /** `rawActions.length !== actions.length`. */
  actionCountMismatch = 'actionCountMismatch',
}

export interface IProposalAnalysisFinding {
  flag: IProposalAnalysisFlag
  severity: IProposalAnalysisSeverity
  actionRefs: number[]
  /** Small, JSON-safe context for the renderer and the prompt: function name, share, count. */
  detail?: Record<string, string | number>
}

export interface IProposalAnalysisDetectorResult {
  findings: IProposalAnalysisFinding[]
  /** The floor. The model can raise it, never lower it. */
  severity: IProposalAnalysisSeverity
}

export interface IProposalAnalysisDetectorThresholds {
  /** Share of treasury (0..1) from which a transfer is `review`. */
  treasuryShareReview: number
  /** Share of treasury (0..1) from which a transfer is `high`. */
  treasuryShareHigh: number
}

/** Mirror of `proposalAnalysisReportSchema` in the assistant contracts. */
export interface IProposalAnalysisReport {
  headline: string
  whatItDoes: Array<{ text: string; actionRefs: number[] }>
  intentMismatch: {
    verdict: IProposalAnalysisIntentVerdict
    explanation: string
    actionRefs: number[]
  }
  whyItMatters: string
  openQuestions: string[]
  severity: IProposalAnalysisSeverity
}

/** Mirror of `proposalAnalysisRequestSchema` in the assistant contracts. */
export interface IProposalAnalysisRequest {
  contractVersion: number
  factPack: IProposalAnalysisFactPack
  findings: IProposalAnalysisFinding[]
  /** Author-written text. The assistant treats it as untrusted data, never as instructions. */
  text: {
    title: string | null
    summary: string | null
    description: string | null
  }
}

/** Mirror of `proposalAnalysisResponseSchema` in the assistant contracts. */
export interface IProposalAnalysisResponse {
  contractVersion: number
  report: IProposalAnalysisReport
  /** The floor the assistant computed from `findings`; `report.severity` is already max(rules, model). */
  rulesSeverity: IProposalAnalysisSeverity
  model: string
  promptVersion: string
}

export interface IProposalAnalysisGenerateOptions {
  /**
   * Assistant to call instead of `config.AI_ANALYSIS.ASSISTANT_URL`. Lets a sandbox backend reach
   * a preview deployment; the host has to match `ASSISTANT_ALLOWED_HOSTS`.
   */
  assistantUrl?: string
}

/**
 * What `POST /v2/proposals/:id/analysis` returns. Nothing is stored yet: the prototype generates
 * on demand and the client keeps the result.
 */
export interface IProposalAnalysisResult {
  proposalId: string
  daoId: string
  network: NetworksEnum
  severity: IProposalAnalysisSeverity
  /** The rules' floor, kept next to the final severity so the UI can show which side raised it. */
  rulesSeverity: IProposalAnalysisSeverity
  report: IProposalAnalysisReport
  findings: IProposalAnalysisFinding[]
  factPack: IProposalAnalysisFactPack
  model: string
  promptVersion: string
  /** Unix ms. */
  generatedAt: number
}
