import { Models } from '@dbModels'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import { MemberGovernanceFactory } from '@src/governance'
import { type IMigration, IPluginInterfaceType, ITokenType } from '@types'
import mongoose from 'mongoose'
import * as pLimit from 'p-limit'

const llo = logger.logMeta.bind(null, { service: 'Migration: veLocker' })

export const VeLockerMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250820095946-veLocker.ts' }))

    try {
      const limit = pLimit.default(50)
      const memberBalanceCollection = mongoose.connection.collection('MemberBalance')

      const veTokens = await Models.Lock.aggregate([
        {
          $group: {
            _id: '$tokenAddress',
            users: {
              $push: {
                memberAddress: '$memberAddress',
                tokenId: '$tokenId',
                escrowAddress: '$escrowAddress',
                network: '$network',
              },
            },
          },
        },
        {
          $project: {
            tokenAddress: '$_id',
            users: '$users',
          },
        },
      ])

      if (veTokens.length === 0) {
        logger.info('No Lock found', llo({}))
        return
      }

      // Count total users to process
      const totalUsers = veTokens.reduce((sum, veToken) => sum + veToken.users.length, 0)
      const total = totalUsers

      logger.info('Found Lock users to migrate', llo({ total, veTokens: veTokens.length }))

      let processedCount = 0
      let errorCount = 0
      let skippedCount = 0

      const promises = veTokens.map(async (veToken: any) =>
        limit(async () => {
          try {
            for (const lockData of veToken.users) {
              let userProcessed = false
              const { tokenId } = lockData
              const memberBalanceEntry = await memberBalanceCollection.findOne({
                tokenAddress: veToken.tokenAddress,
                tokenIds: {
                  $in: [tokenId],
                },
              })

              if (memberBalanceEntry?.tokenIds.includes(tokenId)) {
                const governance = MemberGovernanceFactory.create({
                  address: lockData.escrowAddress,
                  network: lockData.network,
                  interfaceType: IPluginInterfaceType.tokenVoting,
                  tokenType: ITokenType.escrowAdapter,
                  extraParams: {
                    escrowAdapterAddress: veToken.tokenAddress,
                  },
                })

                await governance.update(lockData.memberAddress, {
                  tokenIds: [tokenId],
                  delegateReceiverAddress: memberBalanceEntry.address,
                  lastActivity: memberBalanceEntry.lastSyncAmountBlockNumber,
                })

                const plugins = await Models.Plugin.find({
                  network: memberBalanceEntry.network,
                  tokenAddress: memberBalanceEntry.tokenAddress,
                })

                await Promise.all(
                  plugins.map(async (plugin: Plugin) => {
                    const governance = MemberGovernanceFactory.create({
                      address: plugin.tokenAddress,
                      network: plugin.network,
                      interfaceType: IPluginInterfaceType.tokenVoting,
                      tokenType: ITokenType.escrowAdapter,
                    })

                    await governance.updatePluginMetrics({
                      memberAddress: lockData.memberAddress,
                      pluginAddress: plugin.address,
                      daoAddress: plugin.daoAddress,
                      network: plugin.network,
                      lastActivity: memberBalanceEntry.lastSyncAmountBlockNumber,
                    })
                  }),
                )

                userProcessed = true
              } else {
                skippedCount++
              }

              if (userProcessed) {
                processedCount++

                if (processedCount % 100 === 0) {
                  logger.info(
                    'Migration progress',
                    llo({
                      totalProcessed: processedCount,
                      total,
                      remaining: total - processedCount - skippedCount - errorCount,
                      skipped: skippedCount,
                      errors: errorCount,
                      percentage: ((processedCount / total) * 100).toFixed(2),
                    }),
                  )
                }
              }
            }
          } catch (e) {
            logger.error(
              'Error processing veToken',
              llo({
                migration: '20250820095946-veLocker',
                tokenAddress: veToken.tokenAddress,
                error: e,
              }),
            )
            errorCount += veToken.users.length // Count all users as errors for this veToken
          }
        }),
      )

      await Promise.all(promises)

      logger.info(
        'Migration completed successfully',
        llo({
          migration: '20250820095946-veLocker',
          totalProcessed: processedCount,
          total,
          skipped: skippedCount,
          errors: errorCount,
        }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250820095946-veLocker', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default VeLockerMigration
