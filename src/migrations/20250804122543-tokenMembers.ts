import { type IMigration, IPluginStatus, IPluginInterfaceType } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import mongoose from 'mongoose'
import * as pLimit from 'p-limit'
import { MemberGovernanceFactory } from '@src/governance'

const llo = logger.logMeta.bind(null, { service: 'Migration: tokenMembers' })

export const tokenMembersMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250804122543-tokenMembers' }))

    try {
      const memberBalancesCollection = mongoose.connection.collection('MemberBalance')
      const memberMetricsCollection = mongoose.connection.collection('MemberMetric')
      const memberTransactionsCollection = mongoose.connection.collection('MemberTransaction')

      // Query all MemberBalance where votingPower !== '0' and tokenAddress exists
      const memberBalances = await memberBalancesCollection
        .find({
          votingPower: { $ne: '0' },
          tokenAddress: { $exists: true, $ne: null },
        })
        .toArray()

      const total = memberBalances.length
      logger.info('Found MemberBalance documents to migrate', llo({ total }))

      if (memberBalances.length === 0) {
        logger.info('No MemberBalance documents to migrate', llo({}))
        return
      }

      let processedCount = 0
      let errorCount = 0
      let skippedCount = 0
      const limit = pLimit.default(50) // Process 50 documents concurrently

      // Process memberBalances asynchronously with concurrency limit
      const promises = memberBalances.map(async memberBalance =>
        limit(async () => {
          const plugins = await Models.Plugin.find({
            tokenAddress: memberBalance.tokenAddress,
            network: memberBalance.network,
            isSupported: true,
            status: IPluginStatus.installed,
          }).lean()

          try {
            // Query the last memberTransaction for this member
            const lastMemberTransaction = await memberTransactionsCollection.findOne(
              {
                address: memberBalance.address,
                tokenAddress: memberBalance.tokenAddress,
                network: memberBalance.network,
              },
              {
                sort: { blockNumber: -1 },
              },
            )

            // Check if voting power matches
            if (lastMemberTransaction && lastMemberTransaction.memberVotingPower !== memberBalance.votingPower) {
              logger.warn(
                'Voting power mismatch detected',
                llo({
                  memberAddress: memberBalance.address,
                  tokenAddress: memberBalance.tokenAddress,
                  network: memberBalance.network,
                  memberBalanceVP: memberBalance.votingPower,
                  memberTransactionVP: lastMemberTransaction.memberVotingPower,
                  lastTransactionBlock: lastMemberTransaction.blockNumber,
                }),
              )
              // Skip this member
              skippedCount++
              return
            }

            // Create base member
            await MemberGovernanceFactory.createBaseMember(
              memberBalance.address,
              memberBalance.lastSyncVotingPowerBlockNumber,
            )

            // Create token governance and update voting power
            const governance = MemberGovernanceFactory.create({
              address: memberBalance.tokenAddress,
              network: memberBalance.network,
              interfaceType: IPluginInterfaceType.tokenVoting,
            })

            await governance.update(memberBalance.address, {
              votingPower: memberBalance.votingPower,
              lastActivity: memberBalance.lastSyncVotingPowerBlockNumber,
            })

            // Loop through all plugins and update plugin metrics
            for (const plugin of plugins) {
              // Query memberMetric where tokenAddress and memberAddress match
              const memberMetric = await memberMetricsCollection.findOne({
                pluginAddress: plugin.address,
                memberAddress: memberBalance.address,
                network: memberBalance.network,
              })

              const pluginMetrics = await governance.updatePluginMetrics({
                memberAddress: memberBalance.address,
                pluginAddress: plugin.address,
                network: plugin.network,
                daoAddress: plugin.daoAddress,
                lastActivity: memberMetric?.lastActivity,
              })

              if (pluginMetrics?.firstActivity !== memberMetric?.firstActivity) {
                await pluginMetrics?.update({
                  firstActivity: memberMetric?.firstActivity,
                })
              }
            }

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
          } catch (error) {
            logger.error(
              'Error processing MemberBalance document',
              llo({
                error,
                document: memberBalance,
              }),
            )
            errorCount++
          }
        }),
      )

      // Wait for all promises to complete
      await Promise.all(promises)

      logger.info(
        'Migration completed successfully',
        llo({
          migration: '20250804122543-tokenMembers',
          totalProcessed: processedCount,
          total,
          skipped: skippedCount,
          errors: errorCount,
        }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250804122543-tokenMembers', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default tokenMembersMigration
