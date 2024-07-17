export enum ProposalActionType {
  Transfer = 'Transfer',
  Unknown = 'Unknown',
  Mint = 'Mint',
}

export interface IRawAction {
  to: string
  data: string
  value: any
}
