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
import type DaoPermission from '@models/schema/daoPermission'
import type Jwt from '@models/schema/jwt'
import type PluginSlug from '@models/schema/pluginSlug'

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
  PluginSlug = 'PluginSlug',
  TaskRun = 'TaskRun',
  TaskService = 'TaskService',
  Token = 'Token',
  Transaction = 'Transaction',
  Vote = 'Vote',
  DaoPermission = 'DaoPermission',
  Jwt = 'Jwt',
}

export enum ITransactionIndexCheckType {
  DAO_CREATE = 'daoCreate',
  PROPOSAL_CREATE = 'proposalCreate',
  PROPOSAL_ADVANCE_STAGE = 'proposalAdvanceStage',
  PROPOSAL_VOTE = 'proposalVote',
  PROPOSAL_EXECUTE = 'proposalExecute',
}

export const IndexCheckTypeToModel: Record<ITransactionIndexCheckType, ICollectionNames> = {
  [ITransactionIndexCheckType.DAO_CREATE]: ICollectionNames.Dao,
  [ITransactionIndexCheckType.PROPOSAL_CREATE]: ICollectionNames.Proposal,
  [ITransactionIndexCheckType.PROPOSAL_ADVANCE_STAGE]: ICollectionNames.Proposal,
  [ITransactionIndexCheckType.PROPOSAL_VOTE]: ICollectionNames.Vote,
  [ITransactionIndexCheckType.PROPOSAL_EXECUTE]: ICollectionNames.Proposal,
}

export interface IMongoModel {
  Asset: typeof Asset
  ConfigIndexer: typeof ConfigIndexer
  Dao: typeof Dao
  DaoMemberMapping: typeof DaoMemberMapping
  DaoPermission: typeof DaoPermission
  Jwt: typeof Jwt
  LogMetadata: typeof LogMetadata
  LogPluginSetupProcessor: typeof LogPluginSetupProcessor
  Member: typeof Member
  MemberBalance: typeof MemberBalance
  MemberMetrics: typeof MemberMetrics
  MemberTransaction: typeof MemberTransaction
  Plugin: typeof Plugin
  PluginRepo: typeof PluginRepo
  PluginSlug: typeof PluginSlug
  Proposal: typeof Proposal
  Setting: typeof Setting
  TaskRun: typeof TaskRun
  TaskService: typeof TaskService
  Token: typeof Token
  Transaction: typeof Transaction
  Vote: typeof Vote
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
