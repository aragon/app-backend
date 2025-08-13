import { BaseGovernance } from './baseGovernance'
import { Models } from '@dbModels'
import {
  type HexAddress,
  type IGovernanceParamsOpts,
  type NetworksEnum,
  type IPaginationParams,
  type IPaginatedResult,
  type IMembersResponse,
  type IMemberExtraParams,
  EnumQueueName,
} from '@types'
import Web3Utils from '@helpers/web3Utils'
import DbTx from '@modules/dbTx'
import type LockManagerMember from '@models/schema/lockManagerMember'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import { type ClientSession } from 'mongoose'
import RabbitMQHelper from '@helpers/rabbitMQ'

export class LockToVoteGovernance extends BaseGovernance {
  private readonly lockManagerAddress: HexAddress
  protected plugin?: Plugin

  constructor(lockManagerAddress: HexAddress, network: NetworksEnum) {
    super(lockManagerAddress, network)
    this.lockManagerAddress = lockManagerAddress
  }

  /**
   * Get the plugin associated with this governance
   */
  protected async getPlugin(session?: any): Promise<Plugin | undefined> {
    if (!this.plugin) {
      this.plugin = await Models.Plugin.findOne(
        {
          lockManagerAddress: this.lockManagerAddress,
          network: this.network,
        },
        null,
        { session },
      )
    }
    return this.plugin
  }

  async getOrCreate(
    memberAddress: HexAddress,
    params?: IGovernanceParamsOpts,
    session?: ClientSession,
  ): Promise<LockManagerMember | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    try {
      // Check if lock manager member exists first
      const existingLockMember = await this.findOne(parsedAddress, session)
      if (existingLockMember) {
        return existingLockMember
      }

      // Ensure base member exists
      await BaseGovernance.ensureBaseMember(parsedAddress, params?.lastActivity, session)

      // Create new lock manager member
      const newLockManagerMember = await Models.LockManagerMember.create(
        {
          memberAddress: parsedAddress,
          lockManagerAddress: this.lockManagerAddress,
          votingPower: params?.votingPower || '0',
          network: this.network,
          lastVPBlockNumber: params?.lastActivity || 0,
        },
        { session },
      )

      logger.verbose(
        'Created new LockManagerMember',
        this.llo({
          memberAddress: parsedAddress,
          lockManagerAddress: this.lockManagerAddress,
        }),
      )

      return newLockManagerMember
    } catch (error) {
      logger.error('Error in getOrCreate', this.llo({ error, memberAddress: parsedAddress }))
      return null
    }
  }

  async create(
    memberAddress: HexAddress,
    params: IGovernanceParamsOpts,
    session?: ClientSession,
  ): Promise<LockManagerMember | null> {
    // Simply delegate to getOrCreate since it handles creation when member doesn't exist
    return this.getOrCreate(memberAddress, params, session)
  }

  async update(memberAddress: HexAddress, params: IGovernanceParamsOpts): Promise<LockManagerMember | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        // First ensure the member exists using getOrCreate
        const lockManagerMember = await this.getOrCreate(memberAddress, params, session)

        if (!lockManagerMember) {
          logger.warn(
            'Failed to get or create LockManagerMember for update',
            this.llo({ memberAddress: parsedAddress }),
          )
          return null
        }

        // Only update if block number is newer
        if (params.lastActivity && lockManagerMember.lastVPBlockNumber >= params.lastActivity) {
          logger.verbose(
            'Skipping update - older block',
            this.llo({
              current: lockManagerMember.lastVPBlockNumber,
              new: params.lastActivity,
            }),
          )
          return lockManagerMember
        }

        const updateData: any = {}
        if (params.votingPower !== undefined) {
          updateData.votingPower = params.votingPower.toString()
        }
        if (params.lastActivity !== undefined) {
          updateData.lastVPBlockNumber = params.lastActivity
        }

        const updated = await lockManagerMember.update(updateData, { session })

        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'Updated LockManagerMember',
          this.llo({
            memberAddress: parsedAddress,
            updates: updateData,
          }),
        )

        return updated
      })
    } catch (error) {
      logger.error('Error updating LockManagerMember', this.llo({ error, memberAddress: parsedAddress }))
      return null
    }
  }

  async delete(memberAddress: HexAddress): Promise<boolean> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return false

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const lockManagerMember = await this.findOne(parsedAddress, session)

        if (!lockManagerMember) {
          logger.verbose('LockManagerMember not found for deletion', this.llo({ memberAddress: parsedAddress }))
          return false
        }

        await lockManagerMember.deleteOne({ session })
        await session.commitTransaction()
        await session.endSession()

        logger.verbose('Deleted LockManagerMember', this.llo({ memberAddress: parsedAddress }))
        return true
      })
    } catch (error) {
      logger.error('Error deleting LockManagerMember', this.llo({ error, memberAddress: parsedAddress }))
      return false
    }
  }

  async find(): Promise<LockManagerMember[]> {
    return await Models.LockManagerMember.findActiveMembers({
      network: this.network,
      lockManagerAddress: this.lockManagerAddress,
    })
  }

  async findOne(memberAddress: HexAddress, session?: any): Promise<LockManagerMember | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    return await Models.LockManagerMember.findExistingLog(
      {
        network: this.network,
        lockManagerAddress: this.lockManagerAddress,
        memberAddress: parsedAddress,
      },
      { session },
    )
  }

  async findAndPaginateMembers(params: {
    paginationParams?: IPaginationParams
    extraParams?: IMemberExtraParams
  }): Promise<IPaginatedResult<IMembersResponse>> {
    const { paginationParams = {}, extraParams = {} } = params

    // Enrich extraParams with lockManagerAddress and network from the governance instance
    const enrichedExtraParams: IMemberExtraParams = {
      ...extraParams,
      lockManagerAddress: this.lockManagerAddress,
      network: this.network,
    }

    return Models.LockManagerMember.findAndPaginate({
      paginationParams,
      extraParams: enrichedExtraParams,
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
