import type Dao from '@models/schema/dao'
import type Token from '@models/schema/token'
import type LogMetadata from '@models/schema/logMetadata'
import type LogPluginSetupProcessor from '@models/schema/logPluginSetupProcessor'
import type PluginRepo from '@models/schema/pluginRepo'
import type Member from '@models/schema/member'
import type Plugin from '@models/schema/plugin'
import type Setting from '@models/schema/setting'
import type Asset from '@models/schema/asset'
import type Transaction from '@models/schema/transaction'
import type Proposal from '@models/schema/proposal'
import type ConfigIndexer from '@models/schema/configIndexer'
import type Vote from '@models/schema/vote'
import type TaskService from '@models/schema/taskService'
import type TaskRun from '@models/schema/taskRun'
import type MemberBalance from '@models/schema/memberBalance'
import type MemberTransaction from '@models/schema/memberTransaction'
import type DaoMemberMapping from '@models/schema/daoMemberMapping'
import type MemberMetrics from '@models/schema/memberMetrics'

export enum ICollectionNames {
  Asset = 'Asset',
  ConfigIndexer = 'ConfigIndexer',
  Dao = 'Dao',
  DaoMemberMapping = 'DaoMemberMapping',
  LogMetadata = 'LogMetadata',
  LogPluginSetupProcessor = 'LogPluginSetupProcessor',
  Member = 'Member',
  MemberBalance = 'MemberBalance',
  MemberMetrics = 'MemberMetrics',
  MemberTransaction = 'MemberTransaction',
  Plugin = 'Plugin',
  PluginRepo = 'PluginRepo',
  Proposal = 'Proposal',
  Setting = 'Setting',
  TaskRun = 'TaskRun',
  TaskService = 'TaskService',
  Token = 'Token',
  Transaction = 'Transaction',
  Vote = 'Vote',
  DaoPermission = 'DaoPermission',
}

export interface IMongoModel {
  Dao: typeof Dao
  Token: typeof Token
  LogMetadata: typeof LogMetadata
  LogPluginSetupProcessor: typeof LogPluginSetupProcessor
  PluginRepo: typeof PluginRepo
  Member: typeof Member
  MemberBalance: typeof MemberBalance
  MemberMetrics: typeof MemberMetrics
  MemberTransaction: typeof MemberTransaction
  DaoMemberMapping: typeof DaoMemberMapping
  Plugin: typeof Plugin
  Setting: typeof Setting
  Asset: typeof Asset
  Proposal: typeof Proposal
  Transaction: typeof Transaction
  ConfigIndexer: typeof ConfigIndexer
  Vote: typeof Vote
  TaskService: typeof TaskService
  TaskRun: typeof TaskRun
}

export enum IEventLogPluginMembership {
  MembershipContractAnnounced = 'MembershipContractAnnounced',
}

export enum IEventLogPluginType {
  InstallationPrepared = 'InstallationPrepared',
  InstallationApplied = 'InstallationApplied',
  UninstallationPrepared = 'UninstallationPrepared',
  UninstallationApplied = 'UninstallationApplied',
  UpdatePrepared = 'UpdatePrepared',
  UpdateApplied = 'UpdateApplied',
}

export enum ITransactionType {
  deposit = 'deposit',
  withdraw = 'withdraw',
  externalTransfer = 'externalTransfer',
}

export enum IEventLogMember {
  MembersAdded = 'MembersAdded',
  MembersRemoved = 'MembersRemoved',
  DelegateChanged = 'DelegateChanged',
  DelegateVotesChanged = 'DelegateVotesChanged',
}

export enum IEventLogPermission {
  Granted = 'Granted',
  Revoked = 'Revoked',
}
