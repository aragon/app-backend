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
  type IMemberLockResponse,
} from '@types'
import type Token from '@models/schema/token'
import type TokenMember from '@models/schema/tokenMember'
import Web3Utils from '@helpers/web3Utils'
import DbTx from '@modules/dbTx'
import logger from '@logger'
import { type ClientSession } from 'mongoose'

/**
 * Token-based governance implementation using TokenMember model.
 * Used for ERC20 and VE token governance types.
 */
export class TokenGovernance extends BaseGovernance {
  protected token?: Token
  protected readonly tokenAddress: HexAddress

  constructor(tokenAddress: HexAddress, network: NetworksEnum) {
    super(tokenAddress, network)
    this.tokenAddress = tokenAddress
  }

  /**
   * Get the token associated with this governance
   */
  protected async getToken(session?: any): Promise<Token | undefined> {
    if (!this.token) {
      this.token = await Models.Token.findOne({ address: this.tokenAddress, network: this.network }, null, { session })
    }
    return this.token
  }

  async getPlugins(session?: any): Promise<any[]> {
    return await Models.Plugin.find({ tokenAddress: this.tokenAddress, network: this.network }, null, { session })
  }

  async getOrCreate(memberAddress: HexAddress, params?: IGovernanceParamsOpts): Promise<TokenMember | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        // Ensure base member exists
        await BaseGovernance.ensureBaseMember(parsedAddress, params?.lastActivity, session)

        // Check if token member exists
        const existingTokenMember = await Models.TokenMember.findExistingLog(
          {
            network: this.network,
            tokenAddress: this.tokenAddress,
            memberAddress: parsedAddress,
          },
          { session },
        )

        if (existingTokenMember) {
          return existingTokenMember
        }

        // Create new token member
        const newTokenMember = await Models.TokenMember.create(
          {
            memberAddress: parsedAddress,
            tokenAddress: this.tokenAddress,
            votingPower: params?.votingPower || '0',
            tokenIds: params?.tokenIds || [],
            network: this.network,
            delegateReceivedCount: 0,
            lastVPBlockNumber: params?.lastActivity || 0,
          },
          { session },
        )

        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'Created new TokenMember',
          this.llo({
            memberAddress: parsedAddress,
            tokenAddress: this.tokenAddress,
          }),
        )

        return newTokenMember
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

        // Create token member
        const tokenMember = await Models.TokenMember.create(
          {
            memberAddress: parsedAddress,
            tokenAddress: this.tokenAddress,
            votingPower: params.votingPower || '0',
            tokenIds: params.tokenIds || [],
            network: this.network,
            delegateReceivedCount: 0,
            lastVPBlockNumber: params.lastActivity || 0,
          },
          { session },
        )

        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'Created TokenMember',
          this.llo({
            memberAddress: parsedAddress,
            votingPower: params.votingPower,
          }),
        )

        return tokenMember
      })
    } catch (error) {
      logger.error('Error creating TokenMember', this.llo({ error, memberAddress: parsedAddress }))
      return null
    }
  }

  async update(memberAddress: HexAddress, params: IGovernanceParamsOpts): Promise<TokenMember | null> {
    const parsedAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedAddress) return null

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
          logger.warn('TokenMember not found for update', this.llo({ memberAddress: parsedAddress }))
          return null
        }

        // Only update if block number is newer
        if (params.lastActivity && tokenMember.lastVPBlockNumber >= params.lastActivity) {
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
  async findAndPaginateMembers(_params: {
    paginationParams?: IPaginationParams
    extraParams?: IMemberExtraParams
  }): Promise<IPaginatedResult<IMembersResponse | IMemberLockResponse>> {
    throw new Error('findAndPaginateMembers not implemented in TokenGovernance - must be implemented in subclass')
  }

  /**
   * Batch operations for high-performance bulk updates
   */
  /**
   * Create multiple members in batch without transaction
   */
  static async createMembersBatchNoTx(
    members: Array<{ memberAddress: HexAddress; lastActivity?: number }>,
  ): Promise<boolean> {
    try {
      const bulkOps = members
        .map(({ memberAddress, lastActivity }) => {
          const parsedAddress = Web3Utils.parseAddress(memberAddress)
          if (!parsedAddress) return null
          return {
            updateOne: {
              filter: { id: parsedAddress },
              update: {
                $set: {
                  address: parsedAddress,
                  ...(lastActivity && { lastActivity }),
                },
                $setOnInsert: {
                  id: parsedAddress,
                  firstActivity: lastActivity || null,
                  ens: null,
                },
              },
              upsert: true,
            },
          }
        })
        .filter(op => op !== null)

      if (bulkOps.length > 0) {
        await Models.Member.bulkWrite(bulkOps as any)
      }
      return true
    } catch (error) {
      logger.error('Error in batch member creation (no tx)', { error, memberCount: members.length })
      return false
    }
  }

  /**
   * Update voting power for multiple token members in batch without transaction
   * Instance method since it needs tokenAddress and network from the instance
   */
  async updateTokenMemberVPBatchNoTx(
    updates: Array<{
      memberAddress: HexAddress
      votingPower?: string
      tokenIds?: string[]
      lastVPBlockNumber: number
    }>,
  ): Promise<boolean> {
    try {
      // Group updates by unique id to get the latest update per member
      const updatesWithParsedAddress = updates
        .map(update => {
          const memberAddress = Web3Utils.parseAddress(update.memberAddress)
          if (!memberAddress) return null
          const id = Models.TokenMember.getEntityId({
            network: this.network,
            tokenAddress: this.tokenAddress,
            memberAddress,
          })
          return { ...update, memberAddress, id }
        })
        .filter(update => update !== null)

      // Sort by block number descending and reduce to get only latest per id
      const latestUpdates = updatesWithParsedAddress
        .sort((a, b) => b.lastVPBlockNumber - a.lastVPBlockNumber)
        .reduce<typeof updatesWithParsedAddress>((acc, update) => {
          if (!acc.some(u => u.id === update.id)) {
            acc.push(update)
          }
          return acc
        }, [])

      const bulkOps = latestUpdates.map(update => {
        const setFields: any = {
          votingPower: update.votingPower?.toString() || '0',
          lastVPBlockNumber: update.lastVPBlockNumber,
        }

        if (update.tokenIds !== undefined) {
          setFields.tokenIds = update.tokenIds
        } else if (update.votingPower === '0') {
          setFields.tokenIds = []
        }

        return {
          updateOne: {
            filter: {
              id: update.id,
              network: this.network,
            },
            update: {
              $set: setFields,
              $setOnInsert: {
                id: update.id,
                memberAddress: update.memberAddress,
                tokenAddress: this.tokenAddress,
                network: this.network,
                delegateReceivedCount: 0,
              },
            },
            upsert: true,
          },
        }
      })

      if (bulkOps.length > 0) {
        await Models.TokenMember.bulkWrite(bulkOps as any)
      }
      return true
    } catch (error) {
      logger.error('Error in batch voting power update (no tx)', this.llo({ error, updateCount: updates.length }))
      return false
    }
  }

  /**
   * Update plugin metrics for multiple members in batch without transaction
   */
  async updatePluginMetricsBatchNoTx(
    updates: Array<{
      memberAddress: HexAddress
      pluginAddress: HexAddress
      daoAddress?: HexAddress
      lastActivity?: number
    }>,
  ): Promise<boolean> {
    try {
      const bulkOps = updates
        .map(update => {
          const memberAddress = Web3Utils.parseAddress(update.memberAddress)
          if (!memberAddress) return null
          const id = Models.PluginMetrics.getEntityId({
            network: this.network,
            memberAddress,
            pluginAddress: update.pluginAddress,
          })
          const setFields: any = {}
          const setOnInsertFields: any = {
            id,
            memberAddress,
            pluginAddress: update.pluginAddress,
            network: this.network,
            voteCount: 0,
            proposalCount: 0,
          }

          if (update.lastActivity) {
            setFields.lastActivity = update.lastActivity
            setOnInsertFields.firstActivity = update.lastActivity
          }
          if (update.daoAddress) {
            setFields.daoAddress = update.daoAddress
            setOnInsertFields.daoAddress = update.daoAddress
          }

          return {
            updateOne: {
              filter: { id },
              update: {
                $set: setFields,
                $setOnInsert: setOnInsertFields,
              },
              upsert: true,
            },
          }
        })
        .filter(op => op !== null)

      if (bulkOps.length > 0) {
        await Models.PluginMetrics.bulkWrite(bulkOps as any)
      }
      return true
    } catch (error) {
      logger.error('Error in batch plugin metrics update (no tx)', this.llo({ error, updateCount: updates.length }))
      return false
    }
  }
}
