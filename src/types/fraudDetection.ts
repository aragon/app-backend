export type IFraudAttackClass = 'transfer' | 'mint' | 'permission' | 'upgrade'

export type IFraudRiskLevel = 'critical' | 'high' | 'medium' | 'low'

/**
 * `reverted` is not innocence — these execute at `endDate`, against a different state.
 * `unconfirmed` (unavailable, unconfigured, or an unsimulated network) is never clean.
 */
export type IFraudSimulationStatus = 'confirmed' | 'noEffect' | 'reverted' | 'unconfirmed'

/** `usd` is null whenever Tenderly could not price the token. */
export interface IFraudMovement {
  type: string
  from: string
  to: string
  token: string
  symbol: string | null
  amount: string
  usd: number | null
}

/** The delayed-drain shape: nothing moves now, the spender takes it in a later tx. */
export interface IFraudApproval {
  token: string
  owner: string
  spender: string
  amount: string
  isUnlimited: boolean
}

/** `functionName` is only set for verified contracts. */
export interface IFraudSimCall {
  to: string
  functionName: string | null
  depth: number
}

/** What the simulation observed. Scoring lives in `simulationSignals`. */
export interface IFraudSimulationFacts {
  status: IFraudSimulationStatus
  shareUrl: string | null
  runAt: number
  movements: IFraudMovement[]
  approvals: IFraudApproval[]
  calls: IFraudSimCall[]
  error: string | null
}

export interface IFraudPermissionOp {
  operation: string
  where: string
  who: string
  permissionId: string
  permissionName: string
  dangerous: boolean
}

export interface IFraudTransfer {
  token: string
  to: string
  amount: string
}

export interface IFraudUpgrade {
  /** Proxy being upgraded — the plugin itself in the takeover shape */
  target: string
  implementation: string
  /** Selector of the call the proxy makes into the new code, null for a bare upgradeTo */
  initSelector: string | null
  /** Addresses read out of the init payload, which is where the new controller shows up */
  initAddresses: string[]
}

export interface IFraudSignal {
  name: string
  weight: number
  detail: string
  /**
   * Whether this signal is knowable when the proposal is CREATED. Anything derived from votes
   * is not, and the distinction matters: an alert is only useful while the voting window is
   * still open, so `creationScore` is the number a live detector actually sees.
   */
  atCreation: boolean
}

export interface IFraudRawAction {
  to: string
  value?: string | null
  data?: string | null
}

/**
 * Everything the scorer needs, resolved by the caller. Addresses must be checksummed —
 * comparisons are exact matches.
 */
export interface IFraudRiskContext {
  actions: IFraudRawAction[]
  daoAddress: string
  pluginAddress: string
  creatorAddress: string
  title?: string | null
  description?: string | null
  metadataUri?: string | null
  /** Proposal creation time, unix seconds */
  blockTimestamp: number
  minParticipation?: number | null
  /** Seconds */
  minDuration?: number | null
  /** Creator's proposals in this DAO before this one */
  priorProposals: number
  /** Creator's votes in this DAO before this proposal */
  priorVotes: number
  isSubPlugin: boolean
  /** DAO creation time, unix seconds; null when unknown */
  daoBlockTimestamp?: number | null
  daoAssetCount: number
  /** Governance-token holders, for the recipientOutsider signal */
  tokenHolders?: Set<string>
  /**
   * Legitimate endpoints beyond the DAO and this plugin (always included): plugins of the
   * SAME dao. Grants and payments to these are wiring, not extraction. Never fill this
   * with unrelated DAOs or DB-wide addresses — that is gameable.
   */
  systemAddresses?: Set<string>
  /** Voter addresses so far; empty at creation time */
  voters?: string[]
  /** Null when the lookup failed — never scored as a negative. */
  creatorIsContract?: boolean | null
  /** Null when we could not tell, explorer failures included — an outage is not an attack. */
  creatorUnverified?: boolean | null
  /** Nonce of the EOA that sent the creation transaction, at that block. Null when unknown. */
  originNonce?: number | null
  /** Creation tx had `from == to` and that address has code: the delegated-EOA shape. */
  originIsSelfCall?: boolean | null
}

export interface IFraudAssessment {
  /** True when at least one attack class matched; nothing else is meaningful when false */
  matched: boolean
  attackClass: IFraudAttackClass[]
  permissionOps: IFraudPermissionOp[]
  transfers: IFraudTransfer[]
  mints: IFraudTransfer[]
  upgrades: IFraudUpgrade[]
  nativeValue: string | null
  signals: IFraudSignal[]
  score: number
  creationScore: number
  level: IFraudRiskLevel
  creationLevel: IFraudRiskLevel
  suppressedAs: string | null
}
