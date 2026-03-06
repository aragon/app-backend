/**
 * Types for dispatch simulation summary
 */

// ============================================================================
// Flow Node Types
// ============================================================================

export type FlowNodeRole = 'dao' | 'linkedaccount' | 'burn' | 'wallet' | 'contract'

export interface IFlowAddress {
  address: string
  label: string
  role: FlowNodeRole
  isKnown: boolean
  avatar?: string | null
  ens?: string | null
}

export interface IFlowToken {
  address: string
  symbol: string
  name: string
  decimals: number
  logo?: string
  dollarValue?: string
}

// ============================================================================
// Address Delta Types
// ============================================================================

export interface IAddressTokenDelta {
  token: IFlowToken
  amount: string
  rawAmount?: string
  dollarValue?: string
}

export interface IAddressDelta {
  address: string
  label: string
  role: FlowNodeRole
  isKnown: boolean
  avatar?: string | null
  ens?: string | null
  tokens: IAddressTokenDelta[]
}

// ============================================================================
// Summary Group Types
// ============================================================================

export type SummaryGroupKind = 'dao' | 'external'

export interface ISummaryGroup {
  kind: SummaryGroupKind
  title: string
  items: IAddressDelta[]
}

// ============================================================================
// Dispatch Simulation Summary Response
// ============================================================================

export interface IDispatchSimulationSummary {
  status: 'success' | 'failed'
  error?: string
  tenderlyUrl?: string
  summaryGroups: ISummaryGroup[]
}
