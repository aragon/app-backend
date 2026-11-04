import { type ICrossChainGasEstimate, type IQueueCrossChainGasLimit } from './crossChainGas'
import { type IDispatchSimulationSummary } from './dispatchSimulation'
import { type ErrorKeyEnum } from './error'
import { type NetworksEnum } from './networks'

export enum ITenderlyCallCacheKind {
  cache = 'cache',
  budget = 'budget',
}

export enum ITenderlyOperation {
  pluginActions = 'pluginActions',
  directExecute = 'directExecute',
  proposal = 'proposal',
  dispatch = 'dispatch',
  crossChainGas = 'crossChainGas',
}

export type ITenderlyBudgetContext = { network: NetworksEnum } & (
  | { operation: ITenderlyOperation.crossChainGas; controllerAddress: string }
  | { operation: Exclude<ITenderlyOperation, ITenderlyOperation.crossChainGas>; daoAddress: string }
)

export type ITenderlySendContext = ITenderlyBudgetContext & { deadlineAt: number }

export interface ITenderlyPayload extends TenderlySimulationSimulationItem {
  block_number?: number | null
  estimate_gas?: boolean
}

export interface ITenderlyResultMap {
  [ITenderlyOperation.pluginActions]: ISimulationResult
  [ITenderlyOperation.directExecute]: ISimulationResult
  [ITenderlyOperation.proposal]: ISimulationResult
  [ITenderlyOperation.dispatch]: IDispatchSimulationSummary
  [ITenderlyOperation.crossChainGas]: ICrossChainGasEstimate
}

export type ITenderlyResult<K extends keyof ITenderlyResultMap> = ITenderlyResultMap[K]

export interface ISimulationResult {
  status: ISimulationStatus
  url: string
  runAt: number
  network: NetworksEnum
}

export interface ITenderlyAction {
  to: string
  value: string
  data: string
}

export interface ITenderlyActionInput {
  network: NetworksEnum
  daoAddress: string
  from: string
  actions: ITenderlyAction[]
  proposalId?: string
}

export interface ITenderlyRequestMap {
  [ITenderlyOperation.crossChainGas]: Omit<IQueueCrossChainGasLimit, 'sentAt'>
  [ITenderlyOperation.pluginActions]: { network: NetworksEnum; pluginAddress: string; actions: ITenderlyAction[] }
  [ITenderlyOperation.directExecute]: {
    network: NetworksEnum
    daoAddress: string
    from: string
    actions: ITenderlyAction[]
  }
  [ITenderlyOperation.proposal]: { proposalId: string }
  [ITenderlyOperation.dispatch]: { network: NetworksEnum; policyAddress: string; from: string; data?: string }
}

export type ITenderlyRequest<K extends keyof ITenderlyRequestMap = keyof ITenderlyRequestMap> = {
  [P in K]: ITenderlyRequestMap[P] & { operation: P; sentAt: number }
}[K]

export type ISimulationQueueResponse =
  | ITenderlyResult<keyof ITenderlyRequestMap>
  | { error: string; errorKey: ErrorKeyEnum; status?: number }

export interface TenderlySimulationSimulationItem {
  network_id: string
  save?: boolean
  save_if_fails?: boolean
  simulation_type?: string
  from?: string
  to: string
  input?: string
  value?: string
  gas?: number
  gas_price?: string
  state_objects?: Record<
    string,
    {
      storage?: Record<string, string>
      balance?: string
      code?: string
      nonce?: number
    }
  >
}

export enum ISimulationStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
}

// ============================================================================
// Full Tenderly Response Types (for dispatch simulation summary)
// ============================================================================

export interface ITenderlyTokenInfo {
  standard: 'ERC20' | 'ERC721' | 'Native'
  type: 'Fungible' | 'NonFungible'
  contract_address: string
  symbol: string
  name: string
  decimals: number
  dollar_value?: string
  logo?: string
}

export interface ITenderlyAssetChange {
  type: 'Transfer' | 'Mint' | 'Burn'
  from: string
  to: string
  amount: string
  raw_amount: string
  dollar_value?: string
  from_before_balance?: string
  to_before_balance?: string
  token_info: ITenderlyTokenInfo
}

export interface ITenderlyBalanceChange {
  address: string
  dollar_value: string
  transfers: number[]
}

export interface ITenderlyCallTrace {
  from: string
  to: string
  function_name?: string
  input?: string
  output?: string
  gas_used?: number
  error?: string
  /** Tenderly's own rendering of `error`, when it could decode one. */
  error_reason?: string
  calls?: ITenderlyCallTrace[]
}

export interface ITenderlyRawLog {
  address?: string
  topics?: string[]
  data?: string
}

export interface ITenderlyLog {
  /** Only present for contracts whose ABI Tenderly holds. */
  name?: string
  address?: string
  /**
   * Present regardless of whether Tenderly holds the contract ABI. Match on `raw.topics[0]`,
   * never on the decoded `name`, which only appears for verified contracts.
   */
  raw?: ITenderlyRawLog
  decoded?: {
    name: string
    inputs: Array<{
      name: string
      value: string
    }>
  }
}

export interface ITenderlyContract {
  address: string
  contract_name?: string
  standard?: string
}

export interface ITenderlyFullSimulationResponse {
  simulation?: {
    id: string
    project_id: string
    status: boolean
    block_number: number
    network_id: string
    created_at: string
  }
  transaction?: {
    hash?: string
    from?: string
    to?: string
    gas_used?: number
    /** Whether the transaction itself succeeded. Note a `try/catch`ing receiver can swallow an
     * out-of-gas payload and still report `true` - the logs, not this flag, are the verdict. */
    status?: boolean
    error_info?: {
      error_message?: string
    }
    transaction_info?: {
      asset_changes?: ITenderlyAssetChange[]
      balance_changes?: ITenderlyBalanceChange[]
      call_trace?: ITenderlyCallTrace
      logs?: ITenderlyLog[]
    }
  }
  contracts?: ITenderlyContract[]
}

export interface ITenderlyFullResult {
  status: ISimulationStatus
  shareUrl?: string
  assetChanges: ITenderlyAssetChange[]
  balanceChanges: ITenderlyBalanceChange[]
  callTrace?: ITenderlyCallTrace
  contracts: ITenderlyContract[]
  error?: string
}
