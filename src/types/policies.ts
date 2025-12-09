import { type NetworksEnum } from '@src/types/networks'

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
  cowSwapRouter = 'cowSwapRouter',
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

export interface IPolicySwapData {
  targetTokenAddress: string | null
  cowSwapSettlement: string | null
  cowSwapRelayer: string | null
  uniswapRouter: string | null
}

/**
 * Policy setting structure - supports different plugin types:
 * - RouterPlugin/ClaimerPlugin: has source + model
 * - BurnRouterPlugin: has source only (no model)
 * - UniswapRouterPlugin/CowSwapRouterPlugin: has source + swap (no model)
 * - MultiRouterPlugin/MultiDispatchPlugin: has subRouters[] only
 * - MultiClaimerPlugin: has subClaimers[] only
 */
export interface IPolicySetting {
  policyId: string
  strategyType: IPolicyStrategyType
  source?: IPolicySourceData | null
  model?: IPolicyModelData | null
  swap?: IPolicySwapData | null
  subRouters?: string[] | null
  subClaimers?: string[] | null
}

export enum IEventLogPolicyType {
  // Source factory events
  DrainBalanceSourceDeployed = 'DrainBalanceSourceDeployed',
  RequiredBalanceSourceDeployed = 'RequiredBalanceSourceDeployed',
  StreamBalanceSourceDeployed = 'StreamBalanceSourceDeployed',
  FixedBalanceSourceDeployed = 'FixedBalanceSourceDeployed',
  // Model factory events
  RatioModelDeployed = 'RatioModelDeployed',
  EqualRatioModelDeployed = 'EqualRatioModelDeployed',
  BracketsModelDeployed = 'BracketsModelDeployed',
  AddressGaugeRatioModelDeployed = 'AddressGaugeRatioModelDeployed',
  TokenGaugeRatioModelDeployed = 'TokenGaugeRatioModelDeployed',
}

export interface ILogPolicyIdParams {
  network: NetworksEnum
  transactionHash: string
  transactionIndex: number
  logIndex: number
  event: IEventLogPolicyType
}
