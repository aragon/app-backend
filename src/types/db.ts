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
import type DaoPermission from '@models/schema/daoPermission'
import type Jwt from '@models/schema/jwt'
import type PluginSlug from '@models/schema/pluginSlug'
import type TokenMember from '@models/schema/tokenMember'
import type PluginMember from '@models/schema/pluginMember'
import type PluginMetrics from '@models/schema/pluginMetrics'
import type Lock from '@models/schema/lock'
import type SelectorPermission from '@models/schema/selectorPermission'
import type Campaign from '@models/schema/campaign'
import type CampaignReward from '@models/schema/campaignReward'
import type LockToVoteMember from '@models/schema/lockToVoteMember'
import type Migration from '@models/schema/migration'
import type CampaignMerkleRoot from '@models/schema/campaignMerkleRoot'
import type Gauge from '@helpers/gauge'
import type VoteEpoch from '@models/schema/voteEpoch'

export interface IMongoModel {
  Migration: typeof Migration
  Asset: typeof Asset
  ConfigIndexer: typeof ConfigIndexer
  Campaign: typeof Campaign
  CampaignReward: typeof CampaignReward
  Dao: typeof Dao
  DaoPermission: typeof DaoPermission
  Jwt: typeof Jwt
  LogMetadata: typeof LogMetadata
  LogPluginSetupProcessor: typeof LogPluginSetupProcessor
  Member: typeof Member
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
  SelectorPermission: typeof SelectorPermission
  Lock: typeof Lock
  TokenMember: typeof TokenMember
  PluginMember: typeof PluginMember
  PluginMetrics: typeof PluginMetrics
  LockToVoteMember: typeof LockToVoteMember
  CampaignMerkleRoot: typeof CampaignMerkleRoot
  Gauge: typeof Gauge
  VoteEpoch: typeof VoteEpoch
}

export enum ICollectionNames {
  Migration = 'Migration',
  Asset = 'Asset',
  Campaign = 'Campaign',
  ConfigIndexer = 'ConfigIndexer',
  Dao = 'Dao',
  DaoPermission = 'DaoPermission',
  Jwt = 'Jwt',
  LogMetadata = 'LogMetadata',
  LogPluginSetupProcessor = 'LogPluginSetupProcessor',
  Member = 'Member',
  CampaignMerkleRoot = 'CampaignMerkleRoot',
  Plugin = 'Plugin',
  PluginRepo = 'PluginRepo',
  PluginSlug = 'PluginSlug',
  Proposal = 'Proposal',
  CampaignReward = 'CampaignReward',
  Setting = 'Setting',
  TaskRun = 'TaskRun',
  TaskService = 'TaskService',
  Token = 'Token',
  Transaction = 'Transaction',
  Vote = 'Vote',
  SelectorPermission = 'SelectorPermission',
  Lock = 'Lock',
  TokenMember = 'TokenMember',
  PluginMember = 'PluginMember',
  PluginMetrics = 'PluginMetrics',
  LockToVoteMember = 'LockToVoteMember',
  Gauge = 'Gauge',
  VoteEpoch = 'VoteEpoch',
}

export enum ITransactionIndexCheckType {
  DAO_CREATE = 'daoCreate',
  PROPOSAL_CREATE = 'proposalCreate',
  PROPOSAL_REPORT_RESULTS = 'proposalReportResults',
  PROPOSAL_ADVANCE_STAGE = 'proposalAdvanceStage',
  PROPOSAL_VOTE = 'proposalVote',
  PROPOSAL_EXECUTE = 'proposalExecute',
  LOCK_CREATE = 'lockCreate',
  EXIT_CREATE = 'exitCreate',
  WITHDRAW_CREATE = 'withdrawCreate',
  PLUGIN_CREATE = 'pluginCreate',
}

export const IndexCheckTypeToModel: Record<ITransactionIndexCheckType, ICollectionNames> = {
  [ITransactionIndexCheckType.DAO_CREATE]: ICollectionNames.Dao,
  [ITransactionIndexCheckType.PROPOSAL_CREATE]: ICollectionNames.Proposal,
  [ITransactionIndexCheckType.PROPOSAL_ADVANCE_STAGE]: ICollectionNames.Proposal,
  [ITransactionIndexCheckType.PROPOSAL_VOTE]: ICollectionNames.Vote,
  [ITransactionIndexCheckType.PROPOSAL_EXECUTE]: ICollectionNames.Proposal,
  [ITransactionIndexCheckType.PROPOSAL_REPORT_RESULTS]: ICollectionNames.Proposal,
  [ITransactionIndexCheckType.LOCK_CREATE]: ICollectionNames.Lock,
  [ITransactionIndexCheckType.EXIT_CREATE]: ICollectionNames.Lock,
  [ITransactionIndexCheckType.WITHDRAW_CREATE]: ICollectionNames.Lock,
  [ITransactionIndexCheckType.PLUGIN_CREATE]: ICollectionNames.Plugin,
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

// New clean transaction side enum
export enum ITransactionSide {
  deposit = 'deposit',
  withdraw = 'withdraw',
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

export enum IMigrationStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ICampaignType {
  MERKLE_ROOT = 'MERKLE_ROOT',
}
