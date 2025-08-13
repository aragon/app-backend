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
import type Lock from '@models/schema/lock'
import Web3Utils from '@helpers/web3Utils'
import DbTx from '@modules/dbTx'
import logger from '@logger'
import { type ClientSession } from 'mongoose'
import type Plugin from '@models/schema/plugin'

/**
 * VE governance implementation using a Lock model.
 * Used for VE token governance types.
 */
export class VeGovernance extends BaseGovernance {
  protected readonly escrowAddress: HexAddress
  protected readonly escrowAdapterAddress: HexAddress | null
  protected plugins?: Plugin[]

  constructor(
    escrowAddress: HexAddress,
    network: NetworksEnum,
    extraParams?: {
      escrowAdapterAddress?: HexAddress
    },
  ) {
    super(escrowAddress, network)
    this.escrowAddress = escrowAddress
    this.escrowAdapterAddress = extraParams?.escrowAdapterAddress || null
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

  async getOrCreate(memberAddress: HexAddress, params?: IGovernanceParamsOpts): Promise<Lock | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        // Ensure base member exists
        await BaseGovernance.ensureBaseMember(parsedAddress, params?.lastActivity, session)

        const plugins = await this.getPlugins()
        const { transactionHash, transactionIndex, logIndex, blockNumber } = params?.info!
        const tokenAddress = plugins[0].tokenAddress

        const { nftLockAddress, exitQueueAddress } = plugins[0].votingEscrow
        const { tokenId, value, startTs, newTotalLocked } = params?.parsedEvent?.args!
        // Check if a lock member exists
        const existingLockMember = await Models.Lock.findExistingLog({
          network: this.network,
          escrowAddress: this.escrowAddress,
          transactionHash,
          transactionIndex,
          logIndex,
          tokenAddress,
          memberAddress: parsedAddress,
          tokenId: tokenId.toString(),
        })

        if (existingLockMember) {
          return existingLockMember
        }

        // Create a new token member
        const newLockMember = await Models.Lock.create(
          {
            network: this.network,
            escrowAddress: this.escrowAddress,
            transactionHash,
            transactionIndex,
            logIndex,
            blockNumber,
            memberAddress: parsedAddress,
            nftAddress: nftLockAddress,
            tokenAddress,
            exitQueueAddress,
            tokenId: tokenId.toString(),
            amount: value.toString(),
            epochStartAt: Number(startTs),
            totalLocked: newTotalLocked.toString(),
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

  async create(memberAddress: HexAddress, params: IGovernanceParamsOpts): Promise<Lock | null> {
    return this.getOrCreate(memberAddress, params)
  }

  async update(memberAddress: HexAddress, params: IGovernanceParamsOpts): Promise<Lock[] | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const tokenIds = params.tokenIds
        if (!tokenIds) {
          logger.warn('TokenId required for VE governance update', this.llo({ memberAddress: parsedAddress }))
          return null
        }
        await BaseGovernance.ensureBaseMember(parsedAddress, params?.lastActivity, session)

        await Models.Lock.updateMany(
          {
            network: this.network,
            tokenAddress: this.escrowAdapterAddress,
            tokenId: { $in: tokenIds },
          },
          {
            $set: { delegateReceiverAddress: params.delegateReceiverAddress },
          },
          { session },
        )

        const locks = Models.Lock.find(
          {
            network: this.network,
            escrowAddress: this.escrowAddress,
            tokenId: { $in: tokenIds },
          },
          null,
          { session },
        )

        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'Updated Lock',
          this.llo({
            memberAddress: parsedAddress,
            tokenIds,
            updates: {
              delegateReceiverAddress: params.delegateReceiverAddress,
            },
          }),
        )

        return locks
      })
    } catch (e) {
      logger.error('Error updating Lock', this.llo({ error: e, memberAddress: parsedAddress }))
      return null
    }
  }

  async lockWithdrawn(memberAddress: HexAddress, params: IGovernanceParamsOpts): Promise<Lock | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const { info, parsedEvent } = params
        if (!info || !parsedEvent) {
          logger.error('Missing info or parsedEvent for withdraw', this.llo({ memberAddress: parsedAddress }))
          return null
        }

        const depositorAddress = parsedEvent.args.depositor
        const tokenId = parsedEvent.args.tokenId.toString()
        const amount = parsedEvent.args.value.toString()
        const epochEndAt = Number(parsedEvent.args.ts)
        const totalLocked = parsedEvent.args.newTotalLocked.toString()

        const memberLockParams = {
          escrowAddress: this.escrowAddress,
          network: this.network,
          memberAddress: depositorAddress,
          tokenId,
        }

        const existingLock = await Models.Lock.findLockMember(memberLockParams)
        if (!existingLock) {
          logger.error('Lock not found for withdraw', this.llo({ memberLockParams }))
          return null
        }

        if (existingLock.lockWithdraw?.status) {
          logger.warn('Lock already withdrawn', this.llo({ memberLockParams }))
          return existingLock
        }

        await existingLock.updateOne(
          {
            lockWithdraw: {
              status: true,
              transactionHash: info.transactionHash,
              blockNumber: info.blockNumber,
              totalLocked,
              amount,
              epochEndAt,
            },
            delegateReceiverAddress: null,
          },
          { session },
        )

        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'Withdraw processed in VeGovernance',
          this.llo({
            memberAddress: depositorAddress,
            tokenId,
            amount,
          }),
        )

        return existingLock
      })
    } catch (error) {
      logger.error('Error in withdraw', this.llo({ error, memberAddress: parsedAddress }))
      return null
    }
  }

  async exitQueued(memberAddress: HexAddress, params: IGovernanceParamsOpts): Promise<Lock | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const { info, parsedEvent } = params
        if (!info || !parsedEvent) {
          logger.error('Missing info or parsedEvent for exitQueued', this.llo({ memberAddress: parsedAddress }))
          return null
        }

        const holderAddress = parsedEvent.args.holder
        const tokenId = parsedEvent.args.tokenId.toString()
        const exitDateAt = Number(parsedEvent.args.exitDate)

        const memberLockParams = {
          network: this.network,
          exitQueueAddress: info.address,
          tokenId,
          memberAddress: holderAddress,
        }

        const existingLock = await Models.Lock.findLockMember(memberLockParams)
        if (!existingLock) {
          logger.error('Lock not found for exitQueued', this.llo({ memberLockParams }))
          return null
        }

        if (existingLock.lockExit?.status) {
          logger.warn('Lock already exit queued', this.llo({ memberLockParams }))
          return existingLock
        }

        await existingLock.updateOne(
          {
            lockExit: {
              status: true,
              transactionHash: info.transactionHash,
              blockNumber: info.blockNumber,
              exitDateAt,
            },
          },
          { session },
        )

        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'Exit queued processed in VeGovernance',
          this.llo({
            memberAddress: holderAddress,
            tokenId,
            exitDateAt,
          }),
        )

        return existingLock
      })
    } catch (error) {
      logger.error('Error in exitQueued', this.llo({ error, memberAddress: parsedAddress }))
      return null
    }
  }

  async delete(_memberAddress: HexAddress): Promise<boolean> {
    return false
  }

  async findOne(_memberAddress: HexAddress, _session?: ClientSession): Promise<Lock | null> {
    return null
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
      address: settings.tokenAddress || extraParams.tokenAddress,
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
