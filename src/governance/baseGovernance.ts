import { Models } from '@dbModels'
import {
  type HexAddress,
  type IGovernanceParamsOpts,
  type NetworksEnum,
  type IPaginationParams,
  type IPaginatedResult,
  type IMembersResponse,
  type IMemberExtraParams,
} from '@types'
import type PluginMetrics from '@models/schema/pluginMetrics'
import logger from '@logger'
import Web3Utils from '@helpers/web3Utils'
import DbTx from '@modules/dbTx'
import EnsHelper from '@helpers/ens'
import { type ClientSession } from 'mongoose'

/**
 * Abstract base class for all governance types.
 * Contains common functionality shared across different governance implementations.
 */
export abstract class BaseGovernance {
  protected address: HexAddress
  protected network: NetworksEnum
  protected llo: any

  constructor(address: HexAddress, network: NetworksEnum) {
    this.address = address
    this.network = network
    this.llo = logger.logMeta.bind(null, {
      service: 'MemberGovernance',
    })
  }

  // Abstract methods that must be implemented by subclasses
  abstract getOrCreate(memberAddress: HexAddress, params?: IGovernanceParamsOpts): Promise<any>

  abstract create(memberAddress: HexAddress, params: IGovernanceParamsOpts): Promise<any>

  abstract update(memberAddress: HexAddress, params: IGovernanceParamsOpts): Promise<any>

  abstract delete(memberAddress: HexAddress): Promise<boolean>

  abstract findOne(memberAddress: HexAddress, session?: ClientSession): Promise<any>

  abstract updateDaoMetrics(): Promise<any>

  abstract findAndPaginateMembers(params: {
    paginationParams?: IPaginationParams
    extraParams?: IMemberExtraParams
  }): Promise<IPaginatedResult<IMembersResponse>>

  // Protected helper to find existing plugin metrics
  protected async findExistingPluginMetricsByLog(
    params: {
      memberAddress: HexAddress
      pluginAddress: HexAddress
      network: NetworksEnum
    },
    session?: any,
  ): Promise<PluginMetrics | null> {
    const parsedAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!parsedAddress) return null

    return await Models.PluginMetrics.findExistingLog(
      {
        network: params.network,
        pluginAddress: params.pluginAddress,
        memberAddress: parsedAddress,
      },
      { session },
    )
  }

  // Public method to create plugin metrics - delegates to getOrCreatePluginMetrics
  async createPluginMetrics(
    params: {
      memberAddress: HexAddress
      pluginAddress: HexAddress
      daoAddress?: HexAddress
      network: NetworksEnum
      lastActivity?: number
    },
    session?: ClientSession,
  ): Promise<PluginMetrics | null> {
    // Simply delegate to getOrCreatePluginMetrics since it handles creation when metrics don't exist
    return this.getOrCreatePluginMetrics(params, session)
  }

  // Public method to get or create plugin metrics
  async getOrCreatePluginMetrics(
    params: {
      memberAddress: HexAddress
      pluginAddress: HexAddress
      daoAddress?: HexAddress
      network: NetworksEnum
      lastActivity?: number
    },
    session?: ClientSession,
  ): Promise<PluginMetrics | null> {
    const parsedAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!parsedAddress) return null

    try {
      const existingPluginMetrics = await this.findExistingPluginMetricsByLog(
        {
          memberAddress: parsedAddress,
          pluginAddress: params.pluginAddress,
          network: params.network,
        },
        session,
      )

      if (existingPluginMetrics) {
        return existingPluginMetrics
      }

      // Create new pluginMetrics document with counts
      const proposalCount = await Models.Proposal.countDocuments({
        creatorAddress: parsedAddress,
        pluginAddress: params.pluginAddress,
        network: params.network,
      })

      const voteCount = await Models.Vote.countDocuments({
        memberAddress: parsedAddress,
        pluginAddress: params.pluginAddress,
        network: params.network,
      })

      const newPluginMetrics = await Models.PluginMetrics.create(
        {
          memberAddress: parsedAddress,
          pluginAddress: params.pluginAddress,
          daoAddress: params.daoAddress,
          network: params.network,
          voteCount,
          proposalCount,
          firstActivity: params.lastActivity,
          lastActivity: params.lastActivity,
        },
        { session },
      )

      logger.verbose(
        'Created new PluginMetrics',
        this.llo({
          memberAddress: parsedAddress,
          pluginAddress: params.pluginAddress,
          daoAddress: params.daoAddress,
        }),
      )

      return newPluginMetrics
    } catch (error) {
      logger.error('Error getting or creating plugin metrics', this.llo({ error, params }))
      return null
    }
  }

  async updatePluginMetrics(params: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    daoAddress?: HexAddress
    network: NetworksEnum
    lastActivity?: number
  }): Promise<PluginMetrics | null> {
    const parsedAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!parsedAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        // First ensure the plugin metrics exists using getOrCreatePluginMetrics
        const pluginMetrics = await this.getOrCreatePluginMetrics(params, session)

        if (!pluginMetrics) {
          logger.warn('Failed to get or create PluginMetrics for update', this.llo({ params }))
          return null
        }

        // Query the database for current counts
        const proposalCount = await Models.Proposal.countDocuments({
          creatorAddress: parsedAddress,
          pluginAddress: params.pluginAddress,
          network: params.network,
        })

        const voteCount = await Models.Vote.countDocuments({
          memberAddress: parsedAddress,
          pluginAddress: params.pluginAddress,
          network: params.network,
        })

        const updateData: any = {
          voteCount,
          proposalCount,
        }

        if (params.lastActivity !== undefined) {
          updateData.lastActivity = params.lastActivity
        }
        if (params.daoAddress !== undefined) {
          updateData.daoAddress = params.daoAddress
        }

        const updated = await pluginMetrics.update(updateData, { session })

        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'Updated PluginMetrics',
          this.llo({
            memberAddress: parsedAddress,
            pluginAddress: params.pluginAddress,
            updates: updateData,
          }),
        )

        return updated
      })
    } catch (error) {
      logger.error('Error updating plugin metrics', this.llo({ error, params }))
      return null
    }
  }

  // Static helper to create/update base member (shared across all types)
  // This method handles session contexts for transaction management
  static async ensureBaseMember(memberAddress: HexAddress, lastActivity?: number, session?: ClientSession) {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    try {
      const existingMember = await Models.Member.findOne({ address: parsedAddress }, null, { session })

      if (!existingMember) {
        const rawMember = {
          address: parsedAddress,
          ens: await EnsHelper.getEnsWithUniversalResolver(parsedAddress),
          firstActivity: lastActivity,
          lastActivity,
        }
        const newMember = await Models.Member.create(rawMember, { session })
        logger.verbose(
          'Created base member',
          logger.logMeta.bind(null, { service: 'BaseGovernance' })({ address: parsedAddress }),
        )
        return newMember
      } else if (lastActivity && lastActivity > (existingMember.lastActivity || 0)) {
        const params: any = { lastActivity }
        if (!existingMember.firstActivity) {
          params.firstActivity = lastActivity
        }
        return await existingMember.update(params, { session })
      }

      return existingMember
    } catch (error) {
      logger.error(
        'Error ensuring base member',
        logger.logMeta.bind(null, { service: 'BaseGovernance' })({ error, memberAddress: parsedAddress }),
      )
      return null
    }
  }
}
