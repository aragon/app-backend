import { type Model } from 'mongoose'
import type Dao from '@models/schema/dao'
import type Network from '@models/schema/network'
import { type IDao } from '@src/types/daos'
import type Token from '@models/schema/token'
import type LogDaoRegistry from '@models/schema/logDaoRegistry'
import type LogDaoMetadata from '@models/schema/logDaoMetadata'
import type LogProposalMetadata from '@models/schema/logProposalMetadata'
import type LogPluginSetupProcessor from '@models/schema/logPluginSetupProcessor'
import type LogPluginRepo from '@models/schema/logPluginRepo'
import type LogProposal from '@models/schema/logProposal'
import type LogPluginSetting from '@models/schema/logPluginSetting'
import type LogTransaction from '@models/schema/logTransaction'
import type LogMember from '@models/schema/logMember'

export interface IMongoModel {
  Network: Model<InstanceType<typeof Network>>
  Dao: Model<InstanceType<typeof Dao>>
  Token: Model<InstanceType<typeof Token>>
  LogDaoRegistry: Model<InstanceType<typeof LogDaoRegistry>>
  LogDaoMetadata: Model<InstanceType<typeof LogDaoMetadata>>
  LogProposalMetadata: Model<InstanceType<typeof LogProposalMetadata>>
  LogPluginSetupProcessor: Model<InstanceType<typeof LogPluginSetupProcessor>>
  LogPluginRepo: Model<InstanceType<typeof LogPluginRepo>>
  LogProposal: Model<InstanceType<typeof LogProposal>>
  LogPluginSetting: Model<InstanceType<typeof LogPluginSetting>>
  LogTransaction: Model<InstanceType<typeof LogTransaction>>
  LogMember: Model<InstanceType<typeof LogMember>>
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
}

export enum IEventLogMember {
  MembersAdded = 'MembersAdded',
  MembersRemoved = 'MembersRemoved',
  DelegateChanged = 'DelegateChanged',
  DelegateVotesChanged = 'DelegateVotesChanged',
}

export interface IPaginationParams {
  search?: string
  fromDate?: string
  toDate?: string
  limit?: number
  skip?: number
  order?: string
  orderProp?: string
}

export interface IResponseWithPagination {
  data: IDao[]
  currentPage: number
  totPages: number
  totRecords: number
}

export enum PluginSubDomains {
  TokenVoting = 'token-voting',
  MultiSig = 'multisig',
}

export enum MemberChanges {
  Add = 'Add',
  Remove = 'Remove',
}
