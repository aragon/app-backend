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
