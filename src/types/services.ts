export enum EnumConnection {
  MONGODB = 'MONGODB',
  BLOCKCHAIN = 'BLOCKCHAIN',
  RABBITMQ = 'RABBITMQ',
}

export interface IService {
  NEED_CONNECTIONS: EnumConnection[]

  start: () => Promise<any>

  stop: () => void | Promise<void>
}

export enum IEnumTaskStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  DONE = 'DONE',
  ERROR = 'ERROR',
}

export enum IEnumIndexerService {
  // logStageProposalProcessor = 'logStageProposalProcessor',
  logPluginRepoRegistry = 'logPluginRepoRegistry',
  logDaoRegistry = 'logDaoRegistry',
  logPluginSetupProcessor = 'logPluginSetupProcessor',
  logMetadata = 'logMetadata',
  logMultisig = 'logMultisig',
  logTokenVoting = 'logTokenVoting',
  logGovernanceErc20 = 'logGovernanceErc20',
  depositTxs = 'depositTxs',
  withdrawTxs = 'withdrawTxs',
}

export type IEnumIndexerServiceStatic = `${'Token' | 'TokenVoting' | 'Multisig'}-${string}-${string}`
