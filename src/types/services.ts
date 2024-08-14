export enum EnumConnection {
  MONGODB = 'MONGODB',
  BLOCKCHAIN = 'BLOCKCHAIN',
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
  logDao = 'logDao',
  logDaoRegistry = 'logDaoRegistry',
  logMember = 'logMember',
  logMemberGovernance = 'logMemberGovernance',
  logPluginRepoRegistry = 'logPluginRepoRegistry',
  logPluginSettingMultisig = 'logPluginSettingMultisig',
  logPluginSettingTokenVoting = 'logPluginSettingTokenVoting',
  logPluginSetupProcessor = 'logPluginSetupProcessor',
  logProposal = 'logProposal',
  logProposalMultisig = 'logProposalMultisig',
  logMetadata = 'logMetadata',
  depositTxs = 'depositTxs',
  withdrawTxs = 'withdrawTxs',
}
