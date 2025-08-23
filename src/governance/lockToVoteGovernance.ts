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
import type LockToVoteMember from '@models/schema/lockToVoteMember'
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
  ): Promise<LockToVoteMember | null> {
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
      const newLockToVoteMember = await Models.LockToVoteMember.create(
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
        'Created new LockToVoteMember',
        this.llo({
          memberAddress: parsedAddress,
          lockManagerAddress: this.lockManagerAddress,
        }),
      )

      return newLockToVoteMember
    } catch (error) {
      logger.error('Error in getOrCreate', this.llo({ error, memberAddress: parsedAddress }))
      return null
    }
  }

  async create(
    memberAddress: HexAddress,
    params: IGovernanceParamsOpts,
    session?: ClientSession,
  ): Promise<LockToVoteMember | null> {
    // Simply delegate to getOrCreate since it handles creation when member doesn't exist
    return this.getOrCreate(memberAddress, params, session)
  }

  async update(memberAddress: HexAddress, params: IGovernanceParamsOpts): Promise<LockToVoteMember | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const lockToVoteMember = await this.getOrCreate(memberAddress, params, session)

        if (!lockToVoteMember) {
          logger.warn('Failed to get or create LockToVoteMember for update', this.llo({ memberAddress: parsedAddress }))
          return null
        }

        // Only update if block number is newer
        if (params.lastActivity && lockToVoteMember.lastVPBlockNumber >= params.lastActivity) {
          logger.verbose(
            'Skipping update - older block',
            this.llo({
              current: lockToVoteMember.lastVPBlockNumber,
              new: params.lastActivity,
            }),
          )

          await session.commitTransaction()
          await session.endSession()

          return lockToVoteMember
        }

        const updateData: any = {}
        if (params.votingPower !== undefined) {
          updateData.votingPower = params.votingPower.toString()
        }
        if (params.lastActivity !== undefined) {
          updateData.lastVPBlockNumber = params.lastActivity
        }

        const updated = await lockToVoteMember.update(updateData, { session })

        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'Updated LockToVoteMember',
          this.llo({
            memberAddress: parsedAddress,
            updates: updateData,
          }),
        )

        return updated
      })
    } catch (error) {
      logger.error('Error updating LockToVoteMember', this.llo({ error, memberAddress: parsedAddress }))
      return null
    }
  }

  async delete(memberAddress: HexAddress): Promise<boolean> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return false

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const lockToVoteMember = await this.findOne(parsedAddress, session)

        if (!lockToVoteMember) {
          logger.verbose('LockToVoteMember not found for deletion', this.llo({ memberAddress: parsedAddress }))
          return false
        }

        await lockToVoteMember.deleteOne({ session })
        await session.commitTransaction()
        await session.endSession()

        logger.verbose('Deleted LockToVoteMember', this.llo({ memberAddress: parsedAddress }))
        return true
      })
    } catch (error) {
      logger.error('Error deleting LockToVoteMember', this.llo({ error, memberAddress: parsedAddress }))
      return false
    }
  }

  async find(): Promise<LockToVoteMember[]> {
    return await Models.LockToVoteMember.findActiveMembers({
      network: this.network,
      lockManagerAddress: this.lockManagerAddress,
    })
  }

  async findOne(memberAddress: HexAddress, session?: any): Promise<LockToVoteMember | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    return await Models.LockToVoteMember.findExistingLog(
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

    return Models.LockToVoteMember.findAndPaginate({
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
