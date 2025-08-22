import { type IMigration, IPluginInterfaceType } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import mongoose from 'mongoose'
import * as pLimit from 'p-limit'
import { MemberGovernanceFactory } from '@src/governance'

const llo = logger.logMeta.bind(null, { service: 'Migration: lockToVoteMember' })

export const lockToVoteMemberMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250811180419-lockToVoteMember' }))

    try {
      const limit = pLimit.default(50) // Process 50 documents concurrently
      const memberManagerCollection = mongoose.connection.collection('LockToVoteMember')

      const members = await memberManagerCollection.find().toArray()
      const total = members.length

      logger.info('Found LockToVoteMember documents to migrate', llo({ total }))

      if (total === 0) {
        logger.info('No LockToVoteMember documents to migrate', llo({}))
        return
      }

      let processedCount = 0
      let errorCount = 0
      let skippedCount = 0

      const promises = members.map(async memberManager =>
        limit(async () => {
          try {
            const plugin = await Models.Plugin.findOne({
              network: memberManager.network,
              address: memberManager.pluginAddress,
              lockManagerAddress: { $exists: true },
            })

            if (plugin?.lockManagerAddress) {
              await MemberGovernanceFactory.createBaseMember(memberManager.memberAddress, memberManager.blockNumber)

              const governance = MemberGovernanceFactory.create({
                address: plugin.lockManagerAddress,
                network: plugin.network,
                interfaceType: IPluginInterfaceType.lockToVote,
              })

              await governance.update(memberManager.memberAddress, {
                votingPower: memberManager.votingPower,
                lastActivity: memberManager.blockNumber,
              })

              await governance.updatePluginMetrics({
                memberAddress: memberManager.memberAddress,
                pluginAddress: plugin.address,
                daoAddress: plugin.daoAddress,
                network: plugin.network,
                lastActivity: memberManager.blockNumber,
              })

              // clean up existing data
              await Models.LockToVoteMember.deleteOne({
                _id: memberManager._id,
              })

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
            } else {
              skippedCount++
            }
          } catch (e) {
            logger.error(
              'Error processing LockToVoteMember document',
              llo({
                migration: '20250811180419-lockToVoteMember',
                pluginAddress: memberManager.pluginAddress,
                memberAddress: memberManager.memberAddress,
                error: e,
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
          migration: '20250811180419-lockToVoteMember',
          totalProcessed: processedCount,
          total,
          skipped: skippedCount,
          errors: errorCount,
        }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250811180419-lockToVoteMember', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default lockToVoteMemberMigration
