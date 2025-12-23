import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import DbTx from '@modules/dbTx'
import {
  EnumQueueName,
  type HexAddress,
  type IGovernanceParamsOpts,
  type IMemberExtraParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
} from '@types'
import { type ClientSession } from 'mongoose'
import { BaseGovernance } from './baseGovernance'

/**
 * PluginGovernance provides default member governance implementation using PluginMember model.
 * Used for plugin-based governance types like multisig and admin.
 */
export class PluginGovernance extends BaseGovernance {
  protected plugin?: Plugin

  /**
   * Get the plugin associated with this governance
   */
  protected async getPlugin(session?: ClientSession): Promise<Plugin | undefined> {
    if (!this.plugin) {
      this.plugin = await Models.Plugin.findOne({ address: this.address, network: this.network }, null, { session })
    }
    return this.plugin
  }

  // Default implementation using PluginMember model
  async getOrCreate(memberAddress: HexAddress, params?: IGovernanceParamsOpts, session?: ClientSession): Promise<any> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    try {
      // Check if plugin member exists first
      const existingMember = await this.findOne(parsedAddress, session)
      if (existingMember) {
        return existingMember
      }
      // Ensure base member exists
      await BaseGovernance.ensureBaseMember(parsedAddress, params?.lastActivity, session)

      const plugin = await this.getPlugin(session)
      // Create new plugin member
      const newPluginMember = await Models.PluginMember.create(
        {
          memberAddress: parsedAddress,
          pluginAddress: this.address,
          daoAddress: plugin?.daoAddress,
          network: this.network,
        },
        { session },
      )

      // Create plugin metrics if lastActivity is provided
      if (params?.lastActivity) {
        await this.getOrCreatePluginMetrics(
          {
            memberAddress: parsedAddress,
            pluginAddress: this.address,
            daoAddress: plugin?.daoAddress,
            network: this.network,
            lastActivity: params.lastActivity,
          },
          session,
        )
      }

      logger.verbose(
        'Created new PluginMember',
        this.llo({
          memberAddress: parsedAddress,
          pluginAddress: this.address,
        }),
      )

      return newPluginMember
    } catch (error) {
      logger.error('Error in getOrCreate', this.llo({ error, memberAddress: parsedAddress }))
      return null
    }
  }

  async create(memberAddress: HexAddress, params?: IGovernanceParamsOpts, session?: ClientSession): Promise<any> {
    // Simply delegate to getOrCreate since it handles creation when member doesn't exist
    return this.getOrCreate(memberAddress, params, session)
  }

  async update(_memberAddress: HexAddress, _params?: IGovernanceParamsOpts): Promise<any> {
    // not implemented
    throw new Error('Update not implemented')
  }

  async delete(memberAddress: HexAddress): Promise<boolean> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return false

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const pluginMember = await this.findOne(parsedAddress, session)

        if (!pluginMember) {
          logger.verbose('PluginMember not found for deletion', this.llo({ memberAddress: parsedAddress }))
          return false
        }

        await pluginMember.deleteOne({ session })
        await session.commitTransaction()
        await session.endSession()

        logger.verbose('Deleted PluginMember', this.llo({ memberAddress: parsedAddress }))
        return true
      })
    } catch (error) {
      logger.error('Error deleting PluginMember', this.llo({ error, memberAddress: parsedAddress }))
      return false
    }
  }

  async findOne(memberAddress: HexAddress, session?: ClientSession): Promise<any> {
    const parsedMemberAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedMemberAddress) return null

    return await Models.PluginMember.findOne(
      {
        memberAddress: parsedMemberAddress,
        pluginAddress: this.address,
        network: this.network,
      },
      null,
      { session },
    )
  }

  async findAndPaginateMembers(params: {
    paginationParams?: IPaginationParams
    extraParams?: IMemberExtraParams
  }): Promise<IPaginatedResult<IMembersResponse>> {
    const { paginationParams = {}, extraParams = {} } = params

    const enrichedExtraParams: IMemberExtraParams = {
      ...extraParams,
      pluginAddress: this.address,
      network: this.network,
    }

    return Models.PluginMember.findAndPaginate({
      extraParams: enrichedExtraParams,
      paginationParams,
    })
  }

  async updateDaoMetrics(): Promise<void> {
    const plugin = await this.getPlugin()
    await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
      id: plugin!.daoAddress,
      params: { address: plugin!.daoAddress, network: plugin!.network },
    })
  }
}
