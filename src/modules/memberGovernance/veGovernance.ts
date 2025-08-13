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
} from '@types'
import type TokenMember from '@models/schema/tokenMember'
import Web3Utils from '@helpers/web3Utils'
import DbTx from '@modules/dbTx'
import logger from '@logger'
import { type ClientSession } from 'mongoose'
import type Plugin from '@models/schema/plugin'

/**
 * VE governance implementation using TokenMember model.
 * Used VE token governance types.
 */
export class VeGovernance extends BaseGovernance {
  protected readonly escrowAddress: HexAddress
  protected plugins?: Plugin[]

  constructor(escrowAddress: HexAddress, network: NetworksEnum) {
    super(escrowAddress, network)
    this.escrowAddress = escrowAddress
  }

  async getPlugins(session?: any): Promise<any[]> {
    return await Models.Plugin.find(
      {
        'votingEscrow.escrowAddress': this.escrowAddress,
        network: this.network,
      },
      null,
      { session },
    )
  }

  async getOrCreate(memberAddress: HexAddress, params?: IGovernanceParamsOpts): Promise<TokenMember | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        // Ensure base member exists
        await BaseGovernance.ensureBaseMember(parsedAddress, params?.lastActivity, session)

        const plugins = await this.getPlugins()
        // Check if token member exists
        const existingTokenMember = await Models.Lock.findExistingLog({
          network: this.network,
          escrowAddress: this.escrowAddress,
          transactionHash: params?.info?.transactionHash,
          transactionIndex: params?.info?.transactionIndex,
          logIndex: params?.info?.logIndex,
          tokenAddress: plugins[0].tokenAddress,
          memberAddress: parsedAddress,
          tokenId: params?.parsedEvent?.args?.tokenId?.toString(),
        })

        if (existingTokenMember) {
          return existingTokenMember
        }

        // Create new token member
        const newLockMember = await Models.Lock.create(
          {
            network: this.network,
            escrowAddress: this.escrowAddress,
            transactionHash: params?.info?.transactionHash,
            transactionIndex: params?.info?.transactionIndex,
            logIndex: params?.info?.logIndex,
            blockNumber: params?.info?.blockNumber,
            memberAddress: parsedAddress,
            nftAddress: plugins[0].nftLockAddress,
            tokenAddress: plugins[0].tokenAddress,
            exitQueueAddress: plugins[0].exitQueueAddress,
            tokenId: params?.parsedEvent?.args?.tokenId?.toString(),
            amount: params?.parsedEvent?.args?.value?.toString(),
            epochStartAt: Number(params?.parsedEvent?.args?.startTs),
            totalLocked: params?.parsedEvent?.args?.newTotalLocked?.toString(),
          },
          { session },
        )

        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'Created new LockMember',
          this.llo({
            memberAddress: parsedAddress,
            escrowAddress: this.escrowAddress,
          }),
        )

        return newLockMember
      })
    } catch (error) {
      logger.error('Error in getOrCreate', this.llo({ error, memberAddress: parsedAddress }))
      return null
    }
  }

  async create(memberAddress: HexAddress, params: IGovernanceParamsOpts): Promise<TokenMember | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        // Ensure base member exists
        await BaseGovernance.ensureBaseMember(parsedAddress, params?.lastActivity, session)

        const plugins = await this.getPlugins()
        // Create token member
        const lockMember = await Models.Lock.create(
          {
            network: this.network,
            escrowAddress: this.escrowAddress,
            transactionHash: params?.info?.transactionHash,
            transactionIndex: params?.info?.transactionIndex,
            logIndex: params?.info?.logIndex,
            blockNumber: params?.info?.blockNumber,
            memberAddress: parsedAddress,
            nftAddress: plugins[0].nftLockAddress,
            tokenAddress: plugins[0].tokenAddress,
            exitQueueAddress: plugins[0].exitQueueAddress,
            tokenId: params?.parsedEvent?.args?.tokenId?.toString(),
            amount: params?.parsedEvent?.args?.value?.toString(),
            epochStartAt: Number(params?.parsedEvent?.args?.startTs),
            totalLocked: params?.parsedEvent?.args?.newTotalLocked?.toString(),
          },
          { session },
        )

        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'Created LockMember',
          this.llo({
            memberAddress: parsedAddress,
            votingPower: params.votingPower,
          }),
        )

        return lockMember
      })
    } catch (error) {
      logger.error('Error creating LockMember', this.llo({ error, memberAddress: parsedAddress }))
      return null
    }
  }

  // TODO:
  async update(memberAddress: HexAddress, params: IGovernanceParamsOpts): Promise<TokenMember | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const plugins = await this.getPlugins()
        // Check if token member exists
        const lockMember = await Models.Lock.findExistingLog({
          network: this.network,
          escrowAddress: this.escrowAddress,
          transactionHash: params?.info?.transactionHash,
          transactionIndex: params?.info?.transactionIndex,
          logIndex: params?.info?.logIndex,
          tokenAddress: plugins[0].tokenAddress,
          memberAddress: parsedAddress,
          tokenId: params?.parsedEvent?.args?.tokenId?.toString(),
        })

        if (!lockMember) {
          logger.warn('LockMember not found for update', this.llo({ memberAddress: parsedAddress }))
          return null
        }

        // Only update if block number is newer
        if (params.lastActivity && lockMember.lastVPBlockNumber >= params.lastActivity) {
          logger.verbose(
            'Skipping update - older block',
            this.llo({
              current: tokenMember.lastVPBlockNumber,
              new: params.lastActivity,
            }),
          )
          return tokenMember
        }

        const updateData: any = {}
        if (params.votingPower !== undefined) {
          updateData.votingPower = params.votingPower.toString()
          // Clear tokenIds if voting power is 0
          if (params.votingPower === '0') {
            updateData.tokenIds = []
          }
        }
        if (params.tokenIds !== undefined) {
          updateData.tokenIds = params.tokenIds
        }
        if (params.lastActivity !== undefined) {
          updateData.lastVPBlockNumber = params.lastActivity
        }
        if (params.delegateReceivedCount !== undefined) {
          updateData.delegateReceivedCount = params.delegateReceivedCount
        }

        const updated = await tokenMember.update(updateData, { session })
        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'Updated TokenMember',
          this.llo({
            memberAddress: parsedAddress,
            updates: updateData,
          }),
        )

        return updated
      })
    } catch (error) {
      logger.error('Error updating TokenMember', this.llo({ error, memberAddress: parsedAddress }))
      return null
    }
  }

  // TODO:
  async delete(memberAddress: HexAddress): Promise<boolean> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return false

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const tokenMember = await Models.TokenMember.findExistingLog(
          {
            network: this.network,
            tokenAddress: this.tokenAddress,
            memberAddress: parsedAddress,
          },
          { session },
        )

        if (!tokenMember) {
          logger.verbose('TokenMember not found for deletion', this.llo({ memberAddress: parsedAddress }))
          return false
        }

        await tokenMember.deleteOne({ session })
        await session.commitTransaction()
        await session.endSession()

        logger.verbose('Deleted TokenMember', this.llo({ memberAddress: parsedAddress }))
        return true
      })
    } catch (error) {
      logger.error('Error deleting TokenMember', this.llo({ error, memberAddress: parsedAddress }))
      return false
    }
  }

  async findOne(memberAddress: HexAddress, session?: ClientSession): Promise<TokenMember | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    return await Models.TokenMember.findExistingLog(
      {
        network: this.network,
        tokenAddress: this.tokenAddress,
        memberAddress: parsedAddress,
      },
      { session },
    )
  }

  /**
   * findAndPaginateMembers
   */
  async findAndPaginateMembers(params: {
    paginationParams?: IPaginationParams
    extraParams?: IMemberExtraParams
  }): Promise<IPaginatedResult<IMembersResponse>> {
    const { paginationParams = {}, extraParams = {} } = params

    const settings = await Models.Setting.findActive({
      network: extraParams.network,
      pluginAddress: extraParams.pluginAddress,
      tokenAddress: extraParams.tokenAddress,
    })

    const token = await Models.Token.findOne({
      address: extraParams.tokenAddress,
      network: extraParams.network,
    })

    return Models.Lock.getMembersOfVeLockPlugin({
      paginationParams,
      pluginAddress: extraParams.pluginAddress,
      settings: {
        currentTime: Math.floor(Date.now() / 1000),
        maxTime: settings.votingEscrow.maxTime,
        slope: settings.votingEscrow.slope,
        bias: settings.votingEscrow.bias,
        decimals: (BigInt(10) ** BigInt(token.decimals)).toString(),
      },
      tokenAddress: extraParams.tokenAddress,
      network: extraParams.network,
    })
  }
}
