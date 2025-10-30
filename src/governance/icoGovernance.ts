import {
  type HexAddress,
  type NetworksEnum,
  type IGovernanceParamsOpts,
  type IPaginationParams,
  type IMemberExtraParams,
  type IPaginatedResult,
  type IMembersResponse,
} from '@types'
import { BaseGovernance } from './baseGovernance'
import logger from '@logger'
import { type ClientSession } from 'mongoose'
import type PluginMetrics from '@models/schema/pluginMetrics'

const llo = logger.logMeta.bind(null, { service: 'IcoGovernance' })

/**
 * Special governance class for ICO plugins that don't have governance functionality.
 * This class implements the BaseGovernance interface but doesn't perform any actual governance operations.
 */
export class IcoGovernance extends BaseGovernance {
  constructor(address: HexAddress, network: NetworksEnum) {
    super(address, network)
    logger.verbose('Created IcoGovernance instance', llo({ address, network }))
  }

  /**
   * Override all methods to do nothing or return default values
   */
  async getOrCreate(
    memberAddress: HexAddress,
    _params?: IGovernanceParamsOpts,
    _session?: ClientSession,
  ): Promise<any> {
    logger.verbose('IcoGovernance.getOrCreate called - doing nothing', llo({ memberAddress }))
    return null
  }

  async create(memberAddress: HexAddress, _params: IGovernanceParamsOpts, _session?: ClientSession): Promise<any> {
    logger.verbose('IcoGovernance.create called - doing nothing', llo({ memberAddress }))
    return null
  }

  async update(memberAddress: HexAddress, _params: IGovernanceParamsOpts): Promise<any> {
    logger.verbose('IcoGovernance.update called - doing nothing', llo({ memberAddress }))
    return null
  }

  async delete(memberAddress: HexAddress): Promise<any> {
    logger.verbose('IcoGovernance.delete called - doing nothing', llo({ memberAddress }))
    return null
  }

  async findOne(memberAddress: HexAddress, _session?: ClientSession): Promise<any> {
    logger.verbose('IcoGovernance.findOne called - doing nothing', llo({ memberAddress }))
    return null
  }

  async findAndPaginateMembers(_params: {
    paginationParams?: IPaginationParams
    extraParams?: IMemberExtraParams
  }): Promise<IPaginatedResult<IMembersResponse>> {
    logger.verbose('IcoGovernance.findAndPaginateMembers called - doing nothing', llo())
    return {
      data: [],
      metadata: {
        page: 1,
        pageSize: 0,
        totalPages: 0,
        totalRecords: 0,
      },
    }
  }

  async updatePluginMetrics(_params: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    daoAddress?: HexAddress
    network: NetworksEnum
    lastActivity?: number
  }): Promise<PluginMetrics | null> {
    logger.verbose('IcoGovernance.updatePluginMetrics called - doing nothing', llo(_params))
    return null
  }

  async updateDaoMetrics(): Promise<void> {
    logger.verbose('IcoGovernance.updateDaoMetrics called - doing nothing', llo({}))
  }
}
