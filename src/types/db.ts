import { type Model } from 'mongoose'
import type Dao from '@models/schema/dao'
import type Network from '@models/schema/network'
import { type IDao } from '@src/types/daos'
import type Token from '@models/schema/token'
import type DuneDaoLog from '@models/schema/duneDaoLog'
import type LogDao from '@models/schema/logDao'
import type LogDaoMetadata from '@models/schema/logDaoMetadata'
import type LogProposalMetadata from '@models/schema/logProposalMetadata'
import type LogPlugin from '@models/schema/logPlugin'
import type LogPluginRepo from '@models/schema/logPluginRepo'

export interface IMongoModel {
  Network: Model<InstanceType<typeof Network>>
  Dao: Model<InstanceType<typeof Dao>>
  Token: Model<InstanceType<typeof Token>>
  DuneDaoLog: Model<InstanceType<typeof DuneDaoLog>>
  LogDao: Model<InstanceType<typeof LogDao>>
  LogDaoMetadata: Model<InstanceType<typeof LogDaoMetadata>>
  LogProposalMetadata: Model<InstanceType<typeof LogProposalMetadata>>
  LogPlugin: Model<InstanceType<typeof LogPlugin>>
  LogPluginRepo: Model<InstanceType<typeof LogPluginRepo>>
}

export enum IEventLogPluginType {
  InstallationPrepared = 'InstallationPrepared',
  InstallationApplied = 'InstallationApplied',
  UninstallationPrepared = 'UninstallationPrepared',
  UninstallationApplied = 'UninstallationApplied',
  UpdatePrepared = 'UpdatePrepared',
  UpdateApplied = 'UpdateApplied',
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
