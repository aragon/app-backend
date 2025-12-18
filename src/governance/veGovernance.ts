import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import utils from '@helpers/utils'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import type Lock from '@models/schema/lock'
import type Plugin from '@models/schema/plugin'
import DbTx from '@modules/dbTx'
import {
  EnumQueueName,
  ErrorKeyEnum,
  type HexAddress,
  type IGovernanceParamsOpts,
  type IMemberExtraParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type NetworksEnum,
} from '@types'
import { type ClientSession } from 'mongoose'
import { BaseGovernance } from './baseGovernance'

/**
 * VE governance implementation using a Lock model.
 * Used for VE token governance types.
 */
export class VeGovernance extends BaseGovernance {
  protected readonly escrowAddress: HexAddress // lockManager - user lock the tokes
  protected readonly escrowAdapterAddress: HexAddress | null // used as token of the plugin
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

  async getOrCreate(
    memberAddress: HexAddress,
    params?: IGovernanceParamsOpts,
    session?: ClientSession,
  ): Promise<Lock | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    try {
      // Ensure base member exists
      await BaseGovernance.ensureBaseMember(parsedAddress, params?.lastActivity, session)

      const plugins = await this.getPlugins(session)
      const { transactionHash, transactionIndex, logIndex, blockNumber } = params?.info!
      const tokenAddress = plugins[0].tokenAddress

      const { nftLockAddress, exitQueueAddress } = plugins[0].votingEscrow
      const { tokenId, value, startTs, newTotalLocked } = params?.parsedEvent?.args!

      // Check if a lock member exists using findOne
      const existingLockMember = await this.findOne(parsedAddress, session, {
        transactionHash,
        transactionIndex,
        logIndex,
        tokenAddress,
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

      logger.verbose(
        'Created new LockMember',
        this.llo({
          memberAddress: parsedAddress,
          escrowAddress: this.escrowAddress,
        }),
      )

      return newLockMember
    } catch (error) {
      logger.error('Error in getOrCreate', this.llo({ error, memberAddress: parsedAddress }))
      return null
    }
  }

  async create(
    memberAddress: HexAddress,
    params: IGovernanceParamsOpts,
    session?: ClientSession,
  ): Promise<Lock | null> {
    // Simply delegate to getOrCreate since it handles creation when member doesn't exist
    return this.getOrCreate(memberAddress, params, session)
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

        const locks = await Models.Lock.find(
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
        const exitDateAt =
          parsedEvent.args.exitDate || parsedEvent.args.queuedAt
            ? Number(parsedEvent.args.exitDate || parsedEvent.args.queuedAt)
            : null

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
              holder: holderAddress,
              tokenId,
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
    throw new Error('Update not implemented')
  }

  async findOne(
    memberAddress: HexAddress,
    session?: ClientSession,
    params?: {
      transactionHash?: string
      transactionIndex?: number
      logIndex?: number
      tokenAddress?: HexAddress
      tokenId?: string
    },
  ): Promise<Lock | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    // Return null if required params are not provided
    if (
      !params?.transactionHash ||
      params?.transactionIndex === undefined ||
      params?.logIndex === undefined ||
      !params?.tokenAddress ||
      !params?.tokenId
    ) {
      return null
    }

    // All params are provided, use findExistingLog
    const existingLockMember = await Models.Lock.findExistingLog(
      {
        network: this.network,
        escrowAddress: this.escrowAddress,
        transactionHash: params.transactionHash,
        transactionIndex: params.transactionIndex,
        logIndex: params.logIndex,
        tokenAddress: params.tokenAddress,
        memberAddress: parsedAddress,
        tokenId: params.tokenId,
      },
      { session },
    )
    return existingLockMember
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
    assertExposable(settings, ErrorKeyEnum.notFound)

    const token = await Models.Token.findOne({
      address: settings.tokenAddress || extraParams.tokenAddress,
      network: extraParams.network,
    })
    assertExposable(token, ErrorKeyEnum.notFound)

    return Models.Lock.getMembersOfVeLockPlugin({
      paginationParams,
      pluginAddress: settings.pluginAddress,
      settings: {
        currentTime: Math.floor(Date.now() / 1000),
        maxTime: settings.votingEscrow.maxTime,
        slope: settings.votingEscrow.slope,
        bias: settings.votingEscrow.bias,
        decimals: (BigInt(10) ** BigInt(token.decimals)).toString(),
      },
      tokenAddress: token.address,
      network: settings.network,
    })
  }

  async updateDaoMetrics(): Promise<any> {
    const plugins = await this.getPlugins()
    const uniqueDaoList = utils.getUniqueValuesByKey(plugins, 'daoAddress')
    await Promise.all(
      uniqueDaoList.map(async (daoAddress: string) => {
        await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
          id: daoAddress,
          params: { address: daoAddress, network: plugins[0].network },
        })
      }),
    )
  }
}
