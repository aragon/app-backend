import { Models } from '@dbModels'
import { type HexAddress, type NetworksEnum } from '@types'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import EnsHelper from '@helpers/ens'
import DbTx from '@modules/dbTx'
import type Member from '@models/schema/member'
import type LockManagerMember from '@models/schema/lockManagerMember'
import type TokenMember from '@models/schema/tokenMember'
import type PluginMember from '@models/schema/pluginMember'
import type PluginMetrics from '@models/schema/pluginMetrics'

const llo = logger.logMeta.bind(null, { service: 'modules:ProxyMember' })

export const ProxyMember = {
  createMember: async (memberAddress: HexAddress, lastActivity?: number): Promise<Member | null> => {
    const parsedMemberAddress = Web3Utils.parseAddress(memberAddress)
    if (!parsedMemberAddress) return null

    try {
      const member = await DbTx.executeTxFn(async ({ session }) => {
        const existingMember = await Models.Member.findExistingLog({ address: parsedMemberAddress }, { session })

        if (!existingMember) {
          const rawMember = {
            address: parsedMemberAddress,
            ens: await EnsHelper.getEnsWithUniversalResolver(parsedMemberAddress),
            firstActivity: lastActivity,
            lastActivity,
          }

          const newMember = await Models.Member.create(rawMember, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('Create document - New Member', llo({ documentId: newMember.id }))
          return newMember
        } else if (lastActivity) {
          // update lastActivity and firstActivity if not set

          const params: Partial<Member> = {
            lastActivity,
          }

          if (!existingMember?.firstActivity) {
            params.firstActivity = lastActivity
          }
          return await existingMember.update(params, { session })
        }

        return existingMember
      })
      return member
    } catch (error) {
      logger.error('Error creating new member', llo({ error, memberAddress: parsedMemberAddress }))
      return null
    }
  },

  getOrCreateTokenMember: async (params: {
    memberAddress: HexAddress
    tokenAddress: HexAddress
    network: NetworksEnum
  }): Promise<TokenMember | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const existingTokenMember = await Models.TokenMember.findExistingLog(
          {
            network: params.network,
            tokenAddress: params.tokenAddress,
            memberAddress,
          },
          { session },
        )

        if (existingTokenMember) {
          return existingTokenMember
        }

        // Create new tokenMember document with default voting power
        const newTokenMember = await Models.TokenMember.create(
          {
            memberAddress,
            tokenAddress: params.tokenAddress,
            votingPower: '0',
            tokenIds: [],
            network: params.network,
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
        logger.verbose(
          'Created new TokenMember',
          llo({
            memberAddress,
            tokenAddress: params.tokenAddress,
          }),
        )
        return newTokenMember
      })
    } catch (error) {
      logger.error('Error getting or creating voting power', llo({ error, params }))
      return null
    }
  },

  getOrCreateLockManagerMember: async (params: {
    memberAddress: HexAddress
    lockManagerAddress: HexAddress
    network: NetworksEnum
  }): Promise<LockManagerMember | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const existingLockManagerMember = await Models.LockManagerMember.findExistingLog(
          {
            network: params.network,
            lockManagerAddress: params.lockManagerAddress,
            memberAddress,
          },
          { session },
        )

        if (existingLockManagerMember) {
          return existingLockManagerMember
        }

        // Create new LockManagerMember document with default voting power
        const newTokenMember = await Models.LockManagerMember.create(
          {
            memberAddress,
            lockManagerAddress: params.lockManagerAddress,
            votingPower: '0',
            network: params.network,
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
        logger.verbose(
          'Created new LockManagerMember',
          llo({
            memberAddress,
            lockManagerAddress: params.lockManagerAddress,
          }),
        )
        return newTokenMember
      })
    } catch (error) {
      logger.error('Error getting or creating lock manager member', llo({ error, params }))
      return null
    }
  },

  getOrCreatePluginMember: async (params: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    daoAddress: HexAddress
    network: NetworksEnum
  }): Promise<PluginMember | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const existingPluginMember = await Models.PluginMember.findExistingLog(
          {
            network: params.network,
            pluginAddress: params.pluginAddress,
            memberAddress,
          },
          { session },
        )

        if (existingPluginMember) {
          return existingPluginMember
        }

        // Create new pluginMember document
        const newPluginMember = await Models.PluginMember.create(
          {
            memberAddress,
            pluginAddress: params.pluginAddress,
            daoAddress: params.daoAddress,
            network: params.network,
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
        logger.verbose(
          'Created new PluginMember',
          llo({
            memberAddress,
            pluginAddress: params.pluginAddress,
            daoAddress: params.daoAddress,
          }),
        )
        return newPluginMember
      })
    } catch (error) {
      logger.error('Error getting or creating plugin member', llo({ error, params }))
      return null
    }
  },

  updateLockManagerMemberVP: async (params: {
    memberAddress: HexAddress
    lockManagerAddress: HexAddress
    votingPower?: string
    network: NetworksEnum
    lastVPBlockNumber: number
  }): Promise<LockManagerMember | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        // Get or create the tokenMember document
        const lockManagerMember = await ProxyMember.getOrCreateLockManagerMember({
          memberAddress,
          lockManagerAddress: params.lockManagerAddress,
          network: params.network,
        })

        if (!lockManagerMember) {
          logger.error('Failed to get or create lockManagerMember', llo({ params }))
          return null
        }

        // Prepare update data
        const updateData: any = {}
        const oldVotingPower = lockManagerMember.votingPower
        if (params.votingPower !== undefined) {
          updateData.votingPower = params.votingPower.toString()
        }

        if (params.lastVPBlockNumber !== undefined) {
          updateData.lastVPBlockNumber = params.lastVPBlockNumber
        }

        // Update only if lastVPBlockNumber is greater than the current one, or if current one not exists and new one exists
        if (
          (!lockManagerMember.lastVPBlockNumber && updateData.lastVPBlockNumber) ||
          (updateData.lastVPBlockNumber && updateData.lastVPBlockNumber > lockManagerMember.lastVPBlockNumber)
        ) {
          const updated = await lockManagerMember.update(updateData, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose(
            'Updated LockManagerMember voting power',
            llo({
              memberAddress,
              lockManagerAddress: params.lockManagerAddress,
              oldVotingPower,
              newVotingPower: updated.votingPower,
            }),
          )
          return updated
        }

        return lockManagerMember
      })
    } catch (error) {
      logger.error('Error updating LockManagerMember voting power', llo({ error, params }))
      return null
    }
  },

  updateTokenMemberVP: async (params: {
    memberAddress: HexAddress
    tokenAddress: HexAddress
    votingPower?: string
    tokenIds?: string[]
    network: NetworksEnum
    lastVPBlockNumber: number
  }): Promise<TokenMember | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        // Get or create the tokenMember document
        const tokenMember = await ProxyMember.getOrCreateTokenMember({
          memberAddress,
          tokenAddress: params.tokenAddress,
          network: params.network,
        })

        if (!tokenMember) {
          logger.error('Failed to get or create TokenMember', llo({ params }))
          return null
        }

        // Prepare update data
        const updateData: any = {}
        const oldVotingPower = tokenMember.votingPower
        if (params.votingPower !== undefined) {
          updateData.votingPower = params.votingPower.toString()
          // If voting power is 0, always set tokenIds to empty array
          if (params.votingPower === '0') {
            updateData.tokenIds = []
          }
        }

        if (params.tokenIds !== undefined) {
          updateData.tokenIds = params.tokenIds
        }

        if (params.lastVPBlockNumber !== undefined) {
          updateData.lastVPBlockNumber = params.lastVPBlockNumber
        }

        // Update only if lastVPBlockNumber is greater than the current one, or if current one not exists and new one exists
        if (
          (!tokenMember.lastVPBlockNumber && updateData.lastVPBlockNumber) ||
          (updateData.lastVPBlockNumber && updateData.lastVPBlockNumber > tokenMember.lastVPBlockNumber)
        ) {
          const updated = await tokenMember.update(updateData, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose(
            'Updated TokenMember voting power',
            llo({
              memberAddress,
              tokenAddress: params.tokenAddress,
              oldVotingPower,
              newVotingPower: updated.votingPower,
            }),
          )
          return updated
        }

        return tokenMember
      })
    } catch (error) {
      logger.error('Error updating voting power', llo({ error, params }))
      return null
    }
  },

  addPluginMember: async (params: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    daoAddress: HexAddress
    network: NetworksEnum
  }): Promise<PluginMember | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    return await ProxyMember.getOrCreatePluginMember({
      memberAddress,
      pluginAddress: params.pluginAddress,
      daoAddress: params.daoAddress,
      network: params.network,
    })
  },

  removePluginMember: async (params: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    network: NetworksEnum
  }): Promise<boolean> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return false

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const pluginMember = await Models.PluginMember.findByPluginAndMember(
          params.network,
          params.pluginAddress,
          memberAddress,
          { session },
        )

        if (!pluginMember) {
          logger.verbose(
            'Plugin member not found for removal',
            llo({
              memberAddress,
              pluginAddress: params.pluginAddress,
              network: params.network,
            }),
          )
          return false
        }

        await pluginMember.deleteOne({ session })
        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'Removed plugin member',
          llo({
            memberAddress,
            pluginAddress: params.pluginAddress,
            network: params.network,
          }),
        )
        return true
      })
    } catch (error) {
      logger.error('Error removing plugin member', llo({ error, params }))
      return false
    }
  },

  getOrCreatePluginMetrics: async (params: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    daoAddress?: HexAddress
    network: NetworksEnum
    lastActivity?: number
  }): Promise<PluginMetrics | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const existingPluginMetrics = await Models.PluginMetrics.findExistingLog(
          {
            network: params.network,
            pluginAddress: params.pluginAddress,
            memberAddress,
          },
          { session },
        )

        if (existingPluginMetrics) {
          return existingPluginMetrics
        }

        // Create new pluginMetrics document with default counts
        const newPluginMetrics = await Models.PluginMetrics.create(
          {
            memberAddress,
            pluginAddress: params.pluginAddress,
            daoAddress: params.daoAddress,
            network: params.network,
            voteCount: 0,
            proposalCount: 0,
            firstActivity: params.lastActivity,
            lastActivity: params.lastActivity,
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
        logger.verbose(
          'Created new PluginMetrics',
          llo({
            memberAddress,
            pluginAddress: params.pluginAddress,
            daoAddress: params.daoAddress,
          }),
        )
        return newPluginMetrics
      })
    } catch (error) {
      logger.error('Error getting or creating plugin metrics', llo({ error, params }))
      return null
    }
  },

  updatePluginMetrics: async (params: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    daoAddress?: HexAddress
    network: NetworksEnum
    lastActivity?: number
  }): Promise<PluginMetrics | null> => {
    const memberAddress = Web3Utils.parseAddress(params.memberAddress)
    if (!memberAddress) return null

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        // Get or create the pluginMetrics document
        const pluginMetrics = await ProxyMember.getOrCreatePluginMetrics({
          memberAddress,
          pluginAddress: params.pluginAddress,
          daoAddress: params.daoAddress,
          network: params.network,
          lastActivity: params.lastActivity,
        })

        if (!pluginMetrics) {
          logger.error('Failed to get or create PluginMetrics', llo({ params }))
          return null
        }

        // Count proposals created by this member for this plugin
        const proposalCount = await Models.Proposal.countDocuments(
          {
            pluginAddress: params.pluginAddress,
            network: params.network,
            creatorAddress: memberAddress,
          },
          { session },
        )

        // Count votes by this member for this plugin
        const voteCount = await Models.Vote.countDocuments(
          {
            pluginAddress: params.pluginAddress,
            network: params.network,
            memberAddress,
          },
          { session },
        )

        const document: Partial<PluginMetrics> = { proposalCount, voteCount }
        if (params.lastActivity !== undefined) {
          document.lastActivity = params.lastActivity
        }

        // Update the pluginMetrics with the counts
        const updated = await pluginMetrics.update(document, { session })
        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'Updated PluginMetrics',
          llo({
            memberAddress,
            pluginAddress: params.pluginAddress,
            proposalCount,
            voteCount,
          }),
        )

        return updated
      })
    } catch (error) {
      logger.error('Error updating plugin metrics', llo({ error, params }))
      return null
    }
  },

  // Batch operations without transaction for parallel processing
  createMembersBatchNoTx: async (
    members: Array<{ memberAddress: HexAddress; lastActivity?: number }>,
  ): Promise<boolean> => {
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
                  ens: null, // Skip ENS for now, will be updated later
                },
              },
              upsert: true,
            },
          }
        })
        .filter(op => op !== null)

      if (bulkOps.length > 0) {
        await Models.Member.bulkWrite(bulkOps, { ordered: false })
      }

      logger.verbose('Batch created/updated members without transaction', llo({ count: bulkOps.length }))
      return true
    } catch (error) {
      logger.error('Error in batch member creation without transaction', llo({ error, memberCount: members.length }))
      return false
    }
  },

  // Batch operations with session wrapper (for fallback scenarios)
  createMembersBatch: async (
    members: Array<{ memberAddress: HexAddress; lastActivity?: number }>,
  ): Promise<boolean> => {
    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const result = await ProxyMember.createMembersBatchWithSession(members, session)
        await session.commitTransaction()
        await session.endSession()
        return result
      })
    } catch (error) {
      logger.error('Error in batch member creation', llo({ error, memberCount: members.length }))
      return false
    }
  },

  updateTokenMemberVPBatchNoTx: async (
    updates: Array<{
      memberAddress: HexAddress
      tokenAddress: HexAddress
      votingPower?: string
      tokenIds?: string[]
      network: NetworksEnum
      lastVPBlockNumber: number
    }>,
  ): Promise<boolean> => {
    try {
      // Group updates by unique id to get the latest update per member
      const updatesWithParsedAddress = updates
        .map(update => {
          const memberAddress = Web3Utils.parseAddress(update.memberAddress)
          if (!memberAddress) return null

          const id = Models.TokenMember.getEntityId({
            network: update.network,
            tokenAddress: update.tokenAddress,
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

      // Create bulk operations with proper handling for concurrent updates
      const bulkOps = latestUpdates.map(update => {
        const setFields: any = {
          lastVPBlockNumber: update.lastVPBlockNumber,
        }

        const setOnInsertFields: any = {
          id: update.id,
          memberAddress: update.memberAddress,
          tokenAddress: update.tokenAddress,
          network: update.network,
          delegateReceivedCount: 0,
        }

        if (update.votingPower !== undefined) {
          setFields.votingPower = update.votingPower.toString()
          // If voting power is 0, always set tokenIds to empty array
          if (update.votingPower === '0') {
            setFields.tokenIds = []
          }
        } else {
          setOnInsertFields.votingPower = '0'
        }

        if (update.tokenIds !== undefined) {
          setFields.tokenIds = update.tokenIds
        } else if (!setFields.tokenIds) {
          setOnInsertFields.tokenIds = []
        }

        // Use a filter that checks block number to ensure we only update with newer data
        // The upsert will create the document if it doesn't exist
        return {
          updateOne: {
            filter: {
              id: update.id,
              $or: [
                { lastVPBlockNumber: { $exists: false } },
                { lastVPBlockNumber: { $lt: update.lastVPBlockNumber } },
              ],
            },
            update: {
              $set: setFields,
              $setOnInsert: setOnInsertFields,
            },
            upsert: true,
          },
        }
      })

      if (bulkOps.length > 0) {
        try {
          // Use ordered: false to continue on errors and maximize throughput
          await Models.TokenMember.bulkWrite(bulkOps, { ordered: false })
        } catch (bulkError: any) {
          // Check if this is a bulk write error with duplicate key errors
          if (bulkError.code === 11000 || bulkError.writeErrors) {
            // Filter out duplicate key errors (code 11000) which are expected in parallel processing
            const nonDuplicateErrors = bulkError.writeErrors?.filter((err: any) => err.code !== 11000) || []

            if (nonDuplicateErrors.length > 0) {
              logger.error(
                'Non-duplicate write errors in batch voting power update without tx',
                llo({
                  errors: nonDuplicateErrors,
                  updateCount: updates.length,
                }),
              )
              throw new Error('Batch voting power update failed with non-duplicate errors')
            }

            // If only duplicate key errors, continue - these are expected when parallel batches
            // try to insert the same new document simultaneously
            logger.verbose(
              'Handled expected duplicate key errors in batch update without tx',
              llo({
                duplicateCount: bulkError.writeErrors?.filter((err: any) => err.code === 11000).length || 0,
              }),
            )
          } else {
            // Re-throw unexpected errors
            throw bulkError
          }
        }
      }

      logger.verbose('Batch updated voting powers without transaction', llo({ count: bulkOps.length }))
      return true
    } catch (error) {
      logger.error(
        'Error in batch voting power update without transaction',
        llo({ error, updateCount: updates.length }),
      )
      return false
    }
  },

  updateTokenMemberVPBatch: async (
    updates: Array<{
      memberAddress: HexAddress
      tokenAddress: HexAddress
      votingPower?: string
      tokenIds?: string[]
      network: NetworksEnum
      lastVPBlockNumber: number
    }>,
  ): Promise<boolean> => {
    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const result = await ProxyMember.updateTokenMemberVPBatchWithSession(updates, session)
        await session.commitTransaction()
        await session.endSession()
        return result
      })
    } catch (error) {
      logger.error('Error in batch voting power update', llo({ error, updateCount: updates.length }))
      return false
    }
  },

  updatePluginMetricsBatchNoTx: async (
    updates: Array<{
      memberAddress: HexAddress
      pluginAddress: HexAddress
      daoAddress?: HexAddress
      network: NetworksEnum
      lastActivity?: number
    }>,
  ): Promise<boolean> => {
    try {
      const bulkOps = updates
        .map(update => {
          const memberAddress = Web3Utils.parseAddress(update.memberAddress)
          if (!memberAddress) return null

          const id = Models.PluginMetrics.getEntityId({
            network: update.network,
            memberAddress,
            pluginAddress: update.pluginAddress,
          })

          const setFields: any = {}
          const setOnInsertFields: any = {
            id,
            memberAddress,
            pluginAddress: update.pluginAddress,
            network: update.network,
            voteCount: 0,
            proposalCount: 0,
          }

          if (update.daoAddress) {
            setFields.daoAddress = update.daoAddress
          }

          if (update.lastActivity !== undefined) {
            setFields.lastActivity = update.lastActivity
            setOnInsertFields.firstActivity = update.lastActivity
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
        await Models.PluginMetrics.bulkWrite(bulkOps, { ordered: false })
      }

      logger.verbose('Batch updated plugin metrics without transaction', llo({ count: bulkOps.length }))
      return true
    } catch (error) {
      logger.error(
        'Error in batch plugin metrics update without transaction',
        llo({ error, updateCount: updates.length }),
      )
      return false
    }
  },

  updatePluginMetricsBatch: async (
    updates: Array<{
      memberAddress: HexAddress
      pluginAddress: HexAddress
      daoAddress?: HexAddress
      network: NetworksEnum
      lastActivity?: number
    }>,
  ): Promise<boolean> => {
    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const result = await ProxyMember.updatePluginMetricsBatchWithSession(updates, session)
        await session.commitTransaction()
        await session.endSession()
        return result
      })
    } catch (error) {
      logger.error('Error in batch plugin metrics update', llo({ error, updateCount: updates.length }))
      return false
    }
  },

  // Batch operations with session (for transaction context)
  createMembersBatchWithSession: async (
    members: Array<{ memberAddress: HexAddress; lastActivity?: number }>,
    session: any,
  ): Promise<boolean> => {
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
                  ens: null, // Skip ENS for now, will be updated later
                },
              },
              upsert: true,
            },
          }
        })
        .filter(op => op !== null)

      if (bulkOps.length > 0) {
        await Models.Member.bulkWrite(bulkOps, { session, ordered: false })
      }

      logger.verbose('Batch created/updated members with session', llo({ count: bulkOps.length }))
      return true
    } catch (error) {
      logger.error('Error in batch member creation with session', llo({ error, memberCount: members.length }))
      throw error // Re-throw to trigger transaction rollback
    }
  },

  updateTokenMemberVPBatchWithSession: async (
    updates: Array<{
      memberAddress: HexAddress
      tokenAddress: HexAddress
      votingPower?: string
      tokenIds?: string[]
      network: NetworksEnum
      lastVPBlockNumber: number
    }>,
    session: any,
  ): Promise<boolean> => {
    try {
      // Group updates by unique id to get the latest update per member
      const updatesWithParsedAddress = updates
        .map(update => {
          const memberAddress = Web3Utils.parseAddress(update.memberAddress)
          if (!memberAddress) return null

          const id = Models.TokenMember.getEntityId({
            network: update.network,
            tokenAddress: update.tokenAddress,
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

      // Create bulk operations with proper handling for concurrent updates
      const bulkOps = latestUpdates.map(update => {
        const setFields: any = {
          lastVPBlockNumber: update.lastVPBlockNumber,
        }

        const setOnInsertFields: any = {
          id: update.id,
          memberAddress: update.memberAddress,
          tokenAddress: update.tokenAddress,
          network: update.network,
          delegateReceivedCount: 0,
        }

        if (update.votingPower !== undefined) {
          setFields.votingPower = update.votingPower.toString()
          // If voting power is 0, always set tokenIds to empty array
          if (update.votingPower === '0') {
            setFields.tokenIds = []
          }
        } else {
          setOnInsertFields.votingPower = '0'
        }

        if (update.tokenIds !== undefined) {
          setFields.tokenIds = update.tokenIds
        } else if (!setFields.tokenIds) {
          setOnInsertFields.tokenIds = []
        }

        // Use a filter that checks block number to ensure we only update with newer data
        // The upsert will create the document if it doesn't exist
        return {
          updateOne: {
            filter: {
              id: update.id,
              $or: [
                { lastVPBlockNumber: { $exists: false } },
                { lastVPBlockNumber: { $lt: update.lastVPBlockNumber } },
              ],
            },
            update: {
              $set: setFields,
              $setOnInsert: setOnInsertFields,
            },
            upsert: true,
          },
        }
      })

      if (bulkOps.length > 0) {
        try {
          // Use ordered: false to continue on errors and maximize throughput
          await Models.TokenMember.bulkWrite(bulkOps, { session, ordered: false })
        } catch (bulkError: any) {
          // Check if this is a bulk write error with duplicate key errors
          if (bulkError.code === 11000 || bulkError.writeErrors) {
            // Filter out duplicate key errors (code 11000) which are expected in parallel processing
            const nonDuplicateErrors = bulkError.writeErrors?.filter((err: any) => err.code !== 11000) || []

            if (nonDuplicateErrors.length > 0) {
              logger.error(
                'Non-duplicate write errors in batch voting power update',
                llo({
                  errors: nonDuplicateErrors,
                  updateCount: updates.length,
                }),
              )
              throw new Error('Batch voting power update failed with non-duplicate errors')
            }

            // If only duplicate key errors, continue - these are expected when parallel batches
            // try to insert the same new document simultaneously
            logger.verbose(
              'Handled expected duplicate key errors in batch update',
              llo({
                duplicateCount: bulkError.writeErrors?.filter((err: any) => err.code === 11000).length || 0,
              }),
            )
          } else {
            // Re-throw unexpected errors
            throw bulkError
          }
        }
      }

      logger.verbose('Batch updated voting powers with session', llo({ count: bulkOps.length }))
      return true
    } catch (error) {
      logger.error('Error in batch voting power update with session', llo({ error, updateCount: updates.length }))
      throw error // Re-throw to trigger transaction rollback
    }
  },

  updatePluginMetricsBatchWithSession: async (
    updates: Array<{
      memberAddress: HexAddress
      pluginAddress: HexAddress
      daoAddress?: HexAddress
      network: NetworksEnum
      lastActivity?: number
    }>,
    session: any,
  ): Promise<boolean> => {
    try {
      const bulkOps = updates
        .map(update => {
          const memberAddress = Web3Utils.parseAddress(update.memberAddress)
          if (!memberAddress) return null

          const id = Models.PluginMetrics.getEntityId({
            network: update.network,
            memberAddress,
            pluginAddress: update.pluginAddress,
          })

          const setFields: any = {}
          const setOnInsertFields: any = {
            id,
            memberAddress,
            pluginAddress: update.pluginAddress,
            network: update.network,
            voteCount: 0,
            proposalCount: 0,
          }

          if (update.daoAddress) {
            setFields.daoAddress = update.daoAddress
          }

          if (update.lastActivity !== undefined) {
            setFields.lastActivity = update.lastActivity
            setOnInsertFields.firstActivity = update.lastActivity
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
        await Models.PluginMetrics.bulkWrite(bulkOps, { session, ordered: false })
      }

      logger.verbose('Batch updated plugin metrics with session', llo({ count: bulkOps.length }))
      return true
    } catch (error) {
      logger.error('Error in batch plugin metrics update with session', llo({ error, updateCount: updates.length }))
      throw error // Re-throw to trigger transaction rollback
    }
  },
}
