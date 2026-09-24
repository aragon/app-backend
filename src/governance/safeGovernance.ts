import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import Queue from '@helpers/queue'
import Web3Utils from '@helpers/web3Utils'
import SafeRelationsModule from '@modules/safe/safeRelations'
import {
  ErrorKeyEnum,
  type HexAddress,
  type IMemberExtraParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
} from '@types'
import { type ClientSession } from 'mongoose'
import { BaseGovernance } from './baseGovernance'

/**
 * Members of a Safe, whether it is a process of the DAO or a stage body of its SPP. Owner rows are
 * global per Safe and written only by `syncOwners` from a chain snapshot, so the write methods of
 * the contract are refused here. The DAO is the access rule, not a filter: a Safe answers for a DAO
 * only while it reaches it.
 */
export class SafeGovernance extends BaseGovernance {
  async getOrCreate(): Promise<never> {
    throw new Error('Safe owners are written by syncOwners')
  }

  async create(): Promise<never> {
    throw new Error('Safe owners are written by syncOwners')
  }

  async update(): Promise<never> {
    throw new Error('Safe owners are written by syncOwners')
  }

  async delete(): Promise<boolean> {
    throw new Error('Safe owners are written by syncOwners')
  }

  /** An owner row of a Safe nobody tracks is stale, so it does not count. */
  async findOne(memberAddress: HexAddress, session?: ClientSession): Promise<any> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null
    if (!(await SafeRelationsModule.isTracked(this.network, this.address))) return null

    return Models.SafeMember.findOne(
      { memberAddress: parsedAddress, safeAddress: this.address, network: this.network },
      null,
      { session },
    )
  }

  async findAndPaginateMembers(params: {
    paginationParams?: IPaginationParams
    extraParams?: IMemberExtraParams
  }): Promise<IPaginatedResult<IMembersResponse>> {
    const { paginationParams = {}, extraParams = {} } = params
    const relations = await SafeRelationsModule.resolve({
      network: this.network,
      daoAddress: extraParams.daoAddress,
      safeAddresses: [this.address],
    })
    assertExposable(relations.length > 0, ErrorKeyEnum.notFound)

    return Models.SafeMember.findAndPaginate({
      extraParams: { pluginAddress: this.address, network: this.network },
      paginationParams,
    })
  }

  async updateDaoMetrics(): Promise<void> {
    for (const { daoAddress } of await SafeRelationsModule.findDaos([this.address], this.network)) {
      await Queue.daoMetrics(daoAddress, this.network)
    }
  }
}
