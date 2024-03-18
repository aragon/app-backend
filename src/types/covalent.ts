import { type HexAddress } from '@src/types/networks'

// Token
export interface IContractMetadata {
  contract_decimals: number
  contract_name: string
  contract_ticker_symbol: string
  contract_address: HexAddress
  supports_erc: string[] // erc20
  logo_url: string
}

export interface IPriceResponse {
  contract_metadata: IContractMetadata
  date: string
  price: number // this will be price at 23:59 on the date unless this is today's date in which case it's the price now
  pretty_price: string
}

export interface ILogoUrls {
  token_logo_url: string
  protocol_logo_url: string | null
  chain_logo_url: string
}

export interface ITokenCovalentResponse {
  contract_decimals: number
  contract_name: string
  contract_ticker_symbol: string
  contract_address: HexAddress
  supports_erc: string[] // erc20
  logo_url: string
  update_at: string
  quote_currency: string
  logo_urls: ILogoUrls
  prices: IPriceResponse[]
  items: IPriceResponse[]
}

// Token Balance
export interface ITokenBalanceResponse {
  address: HexAddress
  updated_at: string
  next_update_at: string
  quote_currency: string
  chain_id: number
  chain_name: string
  items: Item[]
  pagination: any
}

interface Item {
  contract_decimals: number
  contract_name: string
  contract_ticker_symbol: string
  contract_address: HexAddress
  supports_erc: string[] // erc20
  logo_url: string
  contract_display_name: string
  logo_urls: ILogoUrls
  last_transferred_at: string
  native_token: boolean
  type: string
  is_spam: boolean
  balance: string
  balance_24h: string
  quote_rate: number
  quote_rate_24h: number
  quote: number
  pretty_quote: string
  quote_24h: number
  pretty_quote_24h: string
  protocol_metadata: any
  nft_data: any
}

// TokenHolder
export interface ITokenHolderResponse {
  address: HexAddress
  balance: string
  contract_address: HexAddress
  contract_decimals: number
  contract_name: string
  contract_ticker_symbol: string
  supports_erc: string[]
  logo_url: string
  total_supply: number
  block_height: number
}

export interface ITokenHoldersPaginationResponse {
  has_more: boolean
  page_number: number
  page_size: number
  total_count: number
}

export interface ITokenHoldersResponse {
  updated_at: string
  chain_id: number
  chain_name: string
  items: ITokenHolderResponse[]
  pagination: ITokenHoldersPaginationResponse
}
