import { type Model } from 'mongoose'
import type Dao from '@models/schema/dao'
import type Network from '@models/schema/network'
import { type IDao } from '@src/types/daos'
import type Token from '@models/schema/token'

export interface IMongoModel {
  Network: Model<InstanceType<typeof Network>>
  Dao: Model<InstanceType<typeof Dao>>
  Token: Model<InstanceType<typeof Token>>
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
