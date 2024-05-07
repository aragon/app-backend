import { type FunctionFragment } from 'ethers'

export enum IAragonContract {
  TokenVoting = 'TokenVoting',
  DAOFactory = 'DAOFactory',
}

export interface IDecodeTransaction {
  contract: IAragonContract
  functionFragment: FunctionFragment | null
  args: any
}
