import { type HexAddress } from '@src/types/networks'

export interface IAlchemyTokenBalance {
  contractAddress: HexAddress
  tokenBalance: string
}

export interface IAlchemyTokenBalancesResponse {
  address: HexAddress
  tokenBalances: IAlchemyTokenBalance[]
}
