import type Dao from '@models/schema/dao'
import type Token from '@models/schema/token'
import type LogDaoRegistry from '@models/schema/logDaoRegistry'
import type LogDaoMetadata from '@models/schema/logDaoMetadata'
import type LogProposalMetadata from '@models/schema/logProposalMetadata'
import type LogPluginSetupProcessor from '@models/schema/logPluginSetupProcessor'
import type LogPluginRepo from '@models/schema/logPluginRepo'
import type LogProposal from '@models/schema/logProposal'
import type LogPluginSetting from '@models/schema/logPluginSetting'
import type LogMember from '@models/schema/logMember'
import type Member from '@models/schema/member'
import type Plugin from '@models/schema/plugin'
import type Setting from '@models/schema/setting'
import type Asset from '@models/schema/asset'
import type Transaction from '@models/schema/transaction'
import type Proposal from '@models/schema/proposal'
import type ConfigIndexer from '@models/schema/configIndexer'
import type Delegate from '@models/schema/delegate'

export interface IMongoModel {
  Dao: typeof Dao
  Token: typeof Token
  LogDaoRegistry: typeof LogDaoRegistry
  LogDaoMetadata: typeof LogDaoMetadata
  LogProposalMetadata: typeof LogProposalMetadata
  LogPluginSetupProcessor: typeof LogPluginSetupProcessor
  LogPluginRepo: typeof LogPluginRepo
  LogProposal: typeof LogProposal
  LogPluginSetting: typeof LogPluginSetting
  LogMember: typeof LogMember
  Member: typeof Member
  Plugin: typeof Plugin
  Setting: typeof Setting
  Asset: typeof Asset
  Proposal: typeof Proposal
  Transaction: typeof Transaction
  ConfigIndexer: typeof ConfigIndexer
  Delegate: typeof Delegate
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
