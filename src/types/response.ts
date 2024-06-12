export interface IMembersResponse {
  address: string
  ens: string | null
  votingPower?: string
  fromBlockNumber: number
  toBlockNumber?: number
}
