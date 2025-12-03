export enum IPolicySourceType {
  drain = 'drain',
  required = 'required',
  streamBalance = 'streamBalance',
  fixed = 'fixed',
}

export enum IPolicyModelType {
  ratio = 'ratio',
  equalRatio = 'equalRatio',
  brackets = 'brackets',
  addressGauge = 'addressGauge',
  tokenGauge = 'tokenGauge',
}

export enum IPolicyStrategyType {
  router = 'router',
  burnRouter = 'burnRouter',
  claimer = 'claimer',
  multiDispatch = 'multiDispatch',
  multiRouter = 'multiRouter',
  multiClaimer = 'multiClaimer',
  uniswapRouter = 'uniswapRouter',
}

export interface IPolicySourceData {
  address: string
  type: IPolicySourceType
  vaultAddress: string | null
  tokenAddress: string | null
  amountPerEpoch: string | null
  maxSourceBalance: string | null
  epochInterval: number | null
  requiredBalance: string | null
  targetAmount: string | null
}

export interface IPolicyModelBracket {
  threshold: string
  routerModelAddress: string | null
  claimerModelAddress: string | null
}

export interface IPolicyModelData {
  address: string
  type: IPolicyModelType
  recipients: string[]
  ratios: number[]
  gaugeVoterAddress: string | null
  brackets: IPolicyModelBracket[]
}

/**
 * Policy setting structure - supports different plugin types:
 * - RouterPlugin/ClaimerPlugin: has source + model
 * - BurnRouterPlugin: has source only (no model)
 * - MultiRouterPlugin/MultiDispatchPlugin: has subRouters[] only
 * - MultiClaimerPlugin: has subClaimers[] only
 */
export interface IPolicySetting {
  policyId: string
  strategyType: IPolicyStrategyType
  source?: IPolicySourceData | null
  model?: IPolicyModelData | null
  subRouters?: string[] | null
  subClaimers?: string[] | null
}
