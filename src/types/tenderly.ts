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

export interface TenderlySimulationBundleRequest {
  simulations: TenderlySimulationSimulationItem[]
}

export interface TenderlySimulationRequest {
  network_id?: string
  actions: Array<{
    to: string
    value: string
    data: string
  }>
}

export interface TenderlySimulationResponse {
  simulation_id: string
  status: 'success' | 'failed'
  share_url?: string
  [key: string]: any // Allow additional response fields
}

export interface TenderlyShareResponse {
  share_url?: string
  [key: string]: any // Allow additional response fields
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
  calls?: ITenderlyCallTrace[]
}

export interface ITenderlyLog {
  name: string
  address: string
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
