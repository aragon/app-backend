import { type HexAddress, type NetworksEnum } from './networks'
import { type IRawAction } from './proposalAction'

/** Bumped whenever a check's semantics change; part of every request id so old results stay distinguishable. */
export const PROPOSAL_CHECKS_RULES_VERSION = 1

/** Lifecycle of one assessment request, from durable intent to a stored result. */
export enum IAssessmentRequestStatus {
  Pending = 'pending',
  Running = 'running',
  Complete = 'complete',
  Incomplete = 'incomplete',
  Failed = 'failed',
}

/** Outcome of a single check inside an assessment. */
export enum IAssessmentCheckStatus {
  Ok = 'ok',
  NeedsReview = 'needsReview',
  NotApplicable = 'notApplicable',
  Failed = 'failed',
}

export enum IAssessmentFindingKind {
  Risk = 'risk',
  Change = 'change',
  NeedsReview = 'needsReview',
}

export enum IAssessmentSeverity {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
}

export const ASSESSMENT_FINDING_LABELS = ['large', 'protectionReduced'] as const

/** The source's default cut-offs for a "large" transfer; per-subscriber overrides come with delivery. */
export const LARGE_TRANSFER_USD = 100_000
export const LARGE_TRANSFER_TREASURY_SHARE = 0.1
export type IAssessmentFindingLabel = (typeof ASSESSMENT_FINDING_LABELS)[number]

export interface IAssessmentFinding {
  /** Stable rule + subject + action path identity, so re-runs compare finding to finding. */
  id: string
  checkId: string
  kind: IAssessmentFindingKind
  /** Only risks carry a severity. */
  severity?: IAssessmentSeverity
  labels: IAssessmentFindingLabel[]
  /** The rule's own default notification policy; delivery level filtering happens later. */
  notify: boolean
  title: string
  details: string[]
  /** Paths into the action tree such as "0/2/1"; a flattened index alone is ambiguous. */
  actionPaths: string[]
  evidenceLimit?: string
  after?: unknown
}

export interface IAssessmentCheckResult {
  status: IAssessmentCheckStatus
  findings: IAssessmentFinding[]
  /** Required whenever the status is not ok. */
  reason?: string
}

export interface IAssessmentEvidenceBlock {
  number: number
  /** Null until the block hash is captured; a null hash keeps the request tentative. */
  hash: string | null
  time: number
}

/** The proposal exactly as it was when the request was made; checks never read the mutable proposal document. */
export interface IAssessmentCaptured {
  rawActions: IRawAction[]
  allowFailureMap: string
  metadataUri: string | null
  storedSettings: unknown
  evidenceBlock: IAssessmentEvidenceBlock
}

/** Exact source event of a request, with the block it was seen in so a re-included event after a reorg is a new revision. */
export interface IAssessmentEventLocation {
  blockNumber: number
  blockHash: string | null
  transactionHash: string
  logIndex: number
}

export interface IAssessmentRequestInput {
  proposal: {
    id: string
    network: NetworksEnum
    daoAddress: HexAddress
    pluginAddress: HexAddress
    rawActions: IRawAction[]
    /** Decimal string of the on-chain bitmap; the proposal document stores a Number that can round. */
    allowFailureMap: string
    metadataUri: string | null
    settings: unknown
  }
  event: IAssessmentEventLocation
  /** Category plus source identity, e.g. "created:<tx>:<logIndex>"; a bare category is not a cause. */
  causeId: string
  evidenceBlock: IAssessmentEvidenceBlock
}

/** How far an input got while the context was built; a check reads this before trusting the input. */
export type IAssessmentInputAvailability = 'ok' | 'partial' | 'unsupported' | 'missing'

/** What the context builder could make of one action's calldata without any external lookup. */
export type IAssessmentActionDecoding = 'known' | 'unknown' | 'empty'

/**
 * One call in the action tree, flattened. Depth 0 is the proposal's own action list; nested
 * calls through supported wrappers are added by later slices with a longer path.
 */
/** How a call reached the tree: directly from the proposal, or through a wrapper the builder understands. */
export type IAssessmentWrapper =
  | 'execute'
  | 'execTransaction'
  | 'execTransactionFromModule'
  | 'execTransactionFromModuleReturnData'
  | 'executeNextTx'
  | 'callTargetFunctionWithRole'
  | 'upgradeToAndCall'
  | 'upgradeAndCall'
  | 'aggregate'
  | 'aggregate3'
  | 'aggregate3Value'

export interface IAssessmentFlatAction {
  /** Position in the tree, e.g. "2" or "2/0/1"; a bare index is ambiguous once wrappers are expanded. */
  path: string
  depth: number
  /**
   * The account whose storage and balance this call runs with: the DAO at depth 0, the wrapper
   * contract for a call it forwards, the same account again through a delegatecall. Null when the
   * route is known but the executing account is not (a Delay module forwards to its avatar).
   */
  caller: HexAddress | null
  target: string
  value: string
  data: string
  selector: string | null
  operation: 'call' | 'delegatecall'
  decoding: IAssessmentActionDecoding
  decoded: { signature: string; name: string; args: Record<string, string> } | null
  /**
   * Where the ABI that decoded the call came from: the checks' own signature list, or the
   * verified source of the target (its current implementation when the target is a proxy).
   */
  abi: {
    source: 'builtin' | 'verified'
    contractName: string | null
    implementation: string | null
    /** False when the implementation behind a proxy could only be read at the current block, not the evidence block. */
    blockPinned: boolean
  } | null
  /** Set on a call that arrived through a wrapper. */
  via: IAssessmentWrapper | null
  /** Set on a wrapper call: its inner calls were expanded, cut off by the depth limit, or could not be read. */
  nested: 'expanded' | 'truncated' | 'unreadable' | null
}

/** One asset movement the simulation predicts. Amounts are decimal strings in the token's base unit. */
export type ITokenStandard = 'ERC20' | 'ERC721' | 'ERC1155'

export interface ISimulatedMovement {
  type: string
  /** Token contract, or "native" for the chain's own coin. */
  asset: string
  standard: ITokenStandard | null
  from: string
  to: string
  amount: string
}

export interface ISimulatedApproval {
  token: string
  owner: string
  spender: string
  amount: string
  unlimited: boolean
}

/** One DAO `execute` the simulation saw complete, with the bitmap of actions that failed inside it. */
export interface ISimulatedExecution {
  dao: string
  actions: number
  allowFailureMap: string
  failureMap: string
}

/**
 * What running the proposal's actions at the evidence block would do, as predicted by the
 * simulation. `unsupported` and `failed` carry no effects; `reverted` carries the reason.
 */
export interface ISimulationFacts {
  status: 'ok' | 'reverted' | 'unsupported' | 'failed'
  reason: string | null
  simulationId: string | null
  block: number
  movements: ISimulatedMovement[]
  approvals: ISimulatedApproval[]
  executions: ISimulatedExecution[]
}

/**
 * What is known about an address that gains something from the proposal. Every field that could
 * not be established is null rather than guessed; a null never reads as "safe".
 */
export interface IResolvedAddress {
  address: string
  kind: 'eoa' | 'contract' | 'unknown'
  verified: boolean | null
  contractName: string | null
  deployedAtBlock: number | null
  deployedAt: number | null
  deployer: string | null
  deployedByCreator: boolean | null
  /** Deployed within the recent window before the evidence block. */
  recentlyDeployed: boolean | null
}

/** One treasury holding, in the token's own units, with the price known at valuation time if any. */
export interface ITreasuryAsset {
  balance: string
  decimals: number
  priceUsd: string | null
}

/** The DAO's indexed holdings, keyed by lower-cased token address or "native"; `pricedAt` is when the prices were current. */
export interface ITreasurySnapshot {
  pricedAt: number
  /** Dollar value of every priced holding together; null when nothing is priced. */
  totalUsd: string | null
  assets: Record<string, ITreasuryAsset>
}

/** One live grant in the DAO's permission table, keyed by where|who|permissionId (lower-cased). */
export interface IPermissionGrant {
  where: string
  who: string
  permissionId: string
  condition: string | null
}

/** The DAO's permission table folded from its events up to the evidence block. */
export interface IPermissionTable {
  /** False when no permission event was indexed for the DAO at all, so the table cannot be trusted. */
  available: boolean
  grants: Record<string, IPermissionGrant>
}

export interface IPluginSummary {
  address: string
  interfaceType: string
  isSubPlugin: boolean
}

/**
 * The code a proxy runs and the code an upgrade action would put behind it, both read at the
 * evidence block. A null hash means no code at that address at the block.
 */
export interface IUpgradeFacts {
  proxy: string
  currentImplementation: string | null
  currentCodeHash: string | null
  proposedImplementation: string
  proposedCodeHash: string | null
  proposedVerified: boolean | null
  proposedContractName: string | null
  /** False when the current implementation could only be read at the current block. */
  blockPinned: boolean
}

/** One permission a plugin setup grants or revokes when applied. */
export interface IPluginSetupPermission {
  op: 'grant' | 'revoke'
  where: string
  who: string
  permissionId: string
  condition: string | null
}

/**
 * What a plugin setup action would do, against what the index knows: the preparation it applies,
 * the repo it comes from, and the plugin it changes. Null fields were not found, never assumed.
 */
export interface IPluginSetupFacts {
  kind: 'install' | 'update' | 'uninstall'
  dao: string
  plugin: string
  repo: string
  release: number
  build: number
  permissions: IPluginSetupPermission[]
  /** The indexed preparation this apply refers to, and whether it lists the same permissions. */
  prepared: { sender: string; release: number; build: number; permissionsMatch: boolean } | null
  /** Subdomain of the repo in the plugin repo registry; null when the repo is not registered there. */
  repoSubdomain: string | null
  /** The indexed plugin an update or uninstall changes; `asOf` says whether its version is the one at the block or today's record. */
  current: { interfaceType: string; release: number; build: number; repo: string; asOf: 'block' | 'now' } | null
  /** An update whose new build uses the same setup contract as the current one changes no code; null when not read. */
  metadataOnly: boolean | null
}

/**
 * What a component change replaces, read at the evidence block: the value before the action and
 * the verified name of the contract the action points at. Null where a read was not possible.
 */
export interface IComponentFacts {
  /** Verified contract name of the action's target, to tell a DAO from a plugin from anything else. */
  targetName: string | null
  /** The forwarder or target config in place before the action. */
  before: string | null
  /** Verified contract name of the address the action installs, when it installs one. */
  installedName: string | null
}

/** The holder a role change replaces, read at the evidence block through the role's getter; null when there is none to read. */
export interface IOwnershipFacts {
  before: string | null
  targetName: string | null
}

/** The governance settings a plugin ran with at the evidence block, keyed like the update call's fields; null when not indexed. */
export interface IVotingSettingsFacts {
  before: Record<string, string> | null
}

/**
 * Who could approve on a multisig, an address list or a Safe at the evidence block: how many
 * members, how many approvals a proposal needs, whether each address the proposal touches was a
 * member, and the proposals still open on it. Null where a read was not possible.
 */
export interface IMembershipFacts {
  kind: 'multisig' | 'safe'
  count: number | null
  threshold: number | null
  listed: Record<string, boolean>
  openProposals: string[]
}

/** One stage of a staged proposal processor, as configured or as proposed; numbers kept as strings. */
export interface IStageConfig {
  bodies: string[]
  minAdvance: string
  maxAdvance: string
  voteDuration: string
  approvalThreshold: string
  vetoThreshold: string
  cancelable: boolean
  editable: boolean
}

/** The stages a processor ran with at the evidence block; null when not indexed. */
export interface IStagesFacts {
  before: IStageConfig[] | null
}

/** What a requested amount is worth against the treasury; null where a price or a balance is missing, never zero. */
export interface IValuation {
  usd: string | null
  treasuryShare: string | null
  pricedAt: number
}

/**
 * Whether the plugin's real execute entry point would run the proposal at the evidence block when
 * an ordinary account calls it. "Not yet" is the plugin refusing because votes or time are still
 * pending, which is a readiness state, not a problem.
 */
export interface IExecutionValidation {
  status: 'executable' | 'notYet' | 'reverted' | 'unsupported' | 'failed'
  reason: string | null
  simulationId: string | null
  block: number
}

/**
 * Everything a check may look at. Built once per request by the context builder; checks never
 * reach past it to the database or the network. Later slices add inputs here as they arrive.
 */
export interface IAssessmentContext {
  request: {
    id: string
    proposalId: string
    network: NetworksEnum
    daoAddress: HexAddress
    pluginAddress: HexAddress
    revisionId: string
    rulesVersion: number
    creatorAddress: HexAddress | null
  }
  captured: IAssessmentCaptured
  actions: IAssessmentFlatAction[]
  simulation: ISimulationFacts
  validation: IExecutionValidation
  /** Keyed by lower-cased address; only addresses the actions hand something to. */
  recipients: Record<string, IResolvedAddress>
  /** Standard of every token contract the actions touch, keyed by lower-cased address; null when not known. */
  tokens: Record<string, ITokenStandard | null>
  treasury: ITreasurySnapshot
  permissions: IPermissionTable
  /** The DAO's installed plugins; who counts as "the system" when grading a grant. */
  plugins: IPluginSummary[]
  /** Editable and cancelable flags of every SPP plugin's stages, keyed by lower-cased plugin address. */
  sppStages: Record<string, { editable: boolean; cancelable: boolean }>
  /** Current and proposed code behind every proxy an action upgrades, keyed by action path; absent when the lookup failed. */
  upgrades: Record<string, IUpgradeFacts>
  /** Every plugin setup action against the index, keyed by action path; absent when the lookup failed. */
  pluginSetups: Record<string, IPluginSetupFacts>
  /** Before-state and contract names for every component change, keyed by action path; absent when the lookup failed. */
  components: Record<string, IComponentFacts>
  /** The allowance each approval replaces, in base units, keyed by action path; absent when it could not be read. */
  allowances: Record<string, string>
  /** The holder before every role change, keyed by action path; absent when the lookup failed. */
  ownership: Record<string, IOwnershipFacts>
  /** The settings before every governance settings update, keyed by action path; absent when the lookup failed. */
  votingSettings: Record<string, IVotingSettingsFacts>
  /** Membership at the block of every multisig or Safe the actions change, keyed by lower-cased address; absent when the lookup failed. */
  memberships: Record<string, IMembershipFacts>
  /** The stages before every stage update, keyed by action path; absent when the lookup failed. */
  stages: Record<string, IStagesFacts>
  votingEvidence: IVotingEvidence
  stageEvidence: IStageEvidence
  metadata: IMetadataFacts
  creator: ICreatorContext
  /** The previous revision of this proposal, or null for the first. */
  previous: IPreviousRevision | null
  /** Only inputs a check reads are listed; a new input joins here with the check that needs it. */
  availability: {
    actions: IAssessmentInputAvailability
    simulation: IAssessmentInputAvailability
  }
}

/** One rule from the source document, as code. Pure: same context, same result. */
export interface IAssessmentCheck {
  id: string
  run(ctx: Readonly<IAssessmentContext>): Promise<IAssessmentCheckResult> | IAssessmentCheckResult
}

/** The evidence a stored result was judged against, kept with it so the history can show it. */
/**
 * Where the proposal stands on its way to execution at the evidence time, per plugin adapter.
 * Pending votes and windows are states, not gaps: nothing here is incomplete for being early.
 * Null means not knowable from what the adapter reads; an unsupported plugin says so.
 */
export interface IReadiness {
  plugin: string
  supported: boolean
  /** Unix seconds when execution could first be allowed, when knowable. */
  earliestExecution: number | null
  executableNow: boolean | null
  /** What still has to happen before execution, each with a stable id. */
  remaining: Array<{ id: string; description: string }>
  /** Time limits that end something, each with a stable id. */
  deadlines: Array<{ id: string; at: number; description: string }>
  /** A terminal outcome proven from the indexed state. */
  outcome: 'executed' | 'cancelled' | 'expired' | 'defeated' | null
  /** The next moment the answer can change on time alone. */
  nextBoundary: number | null
  limits: string[]
}

/**
 * The token vote as the plugin holds it at the evidence block, next to what the index recorded:
 * the tally, the eligible supply at the snapshot (not the token's total supply), the dates and
 * the thresholds frozen into the proposal. `status` says whether the read happened at all.
 */
export interface IVotingEvidence {
  status: 'ok' | 'unsupported' | 'failed'
  reason: string | null
  block: number
  chain: {
    open: boolean
    executed: boolean
    votingMode: number
    supportThreshold: string
    startDate: number
    endDate: number
    snapshotBlock: number
    minVotingPower: string
    eligibleSupply: string | null
    tally: { yes: string; no: string; abstain: string }
  } | null
  indexed: {
    votingMode: number | null
    supportThreshold: string | null
    minParticipation: string | null
    startDate: number | null
    endDate: number | null
    totalSupply: string | null
    tally: { yes: string; no: string; abstain: string } | null
  }
}

/** One body of the current stage of a staged proposal: its child proposal on chain and what the index knows of it. */
export interface IStageBodyEvidence {
  body: string
  isManual: boolean
  chainChildId: string | null
  chainResult: 'none' | 'approval' | 'veto' | null
  indexedChildIndex: string | null
  indexedResult: 'none' | 'approval' | 'veto' | null
}

/** The staged proposal as the processor holds it at the evidence block, next to the index. */
export interface IStageEvidence {
  status: 'ok' | 'unsupported' | 'failed'
  reason: string | null
  block: number
  chain: {
    currentStage: number
    lastStageTransition: number
    executed: boolean
    canceled: boolean
    approvals: string
    vetoes: string
  } | null
  indexed: { stageIndex: number | null; lastStageTransition: number | null }
  stage: { approvalThreshold: string; vetoThreshold: string } | null
  bodies: IStageBodyEvidence[]
}

/** The proposal's explanation as indexed and as fetched from its metadata reference, within limits. */
export interface IMetadataFacts {
  uri: string | null
  /** What the metadata field holds: an IPFS reference, a web address, free text, or nothing. */
  uriKind: 'ipfs' | 'http' | 'text' | 'empty'
  indexed: { title: string | null; summary: string | null; description: string | null }
  fetched: { title: string | null; summary: string | null; description: string | null; hash: string } | null
  fetchStatus: 'ok' | 'failed' | 'skipped'
}

/**
 * The three context lines every message carries about who proposes and who votes. Unknown
 * values stay null and are said to be unknown; a count of zero votes gives no largest share.
 */
export interface ICreatorContext {
  address: string | null
  /** Proposals by the same creator on this DAO before the evidence block. */
  priorProposals: number | null
  /** When the creator's voting power first appeared, as a delegation to them, in unix seconds. */
  powerAppearedAt: number | null
  /** Seconds between the power appearing and the proposal's creation; negative never. */
  powerAgeSeconds: number | null
  votesCast: number
  /** The largest single voter's share of the voting power cast so far, as a decimal string in [0, 1]. */
  largestVoterShare: string | null
  largestVoter: string | null
  limits: string[]
}

/** The request that came before this one for the same proposal, so an edit can be described as a difference. */
export interface IPreviousRevision {
  generation: number
  revisionId: string
  causeId: string
  captured: IAssessmentCaptured
}

export interface IAssessmentEvidence {
  /** The action tree exactly as the rules read it: decoded, expanded through wrappers, with the account each call runs as. */
  actions: IAssessmentFlatAction[]
  simulation: ISimulationFacts
  validation: IExecutionValidation
  readiness: IReadiness
}

export interface IAssessmentEngineResult {
  status: Exclude<IAssessmentRequestStatus, 'pending' | 'running'>
  findings: IAssessmentFinding[]
  checks: Record<string, IAssessmentCheckStatus>
  reasons: Record<string, string>
  coverage: { implemented: string[]; missing: string[] }
}
