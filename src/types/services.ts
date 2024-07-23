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
  daoLog = 'daoLog',
  daoRegistryLog = 'daoRegistryLog',
  memberLog = 'memberLog',
  pluginRepoRegistryLog = 'pluginRepoRegistryLog',
  pluginSettingLog = 'pluginSettingLog',
  pluginSetupProcessorLog = 'pluginSetupProcessorLog',
  proposalLog = 'proposalLog',
  depositTxs = 'depositTxs',
  withdrawTxs = 'withdrawTxs',
}
