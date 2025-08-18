import { type IMigration } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import mongoose from 'mongoose'
import * as pLimit from 'p-limit'

const llo = logger.logMeta.bind(null, { service: 'Migration: lockToVoteMember' })

export const lockToVoteMemberMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250811180419-lockToVoteMember' }))

    try {
      const limit = pLimit.default(50) // Process 50 documents concurrently
      const memberManagerCollection = mongoose.connection.collection('LockManagerMember')

      const members = await memberManagerCollection.find().toArray()

      if (members.length === 0) {
        logger.info('No MemberBalance documents to migrate', llo({}))
        return
      }

      const promises = members.map(async memberManager =>
        limit(async () => {
          try {
            const plugin = await Models.Plugin.findOne({
              network: memberManager.network,
              pluginAddress: memberManager.pluginAddress,
              lockManagerAddress: { $exists: true },
            })
            if (plugin?.lockManagerAddress) {
              await Models.LockManagerMember.create({
                id: Models.LockManagerMember.getEntityId({
                  network: memberManager.network,
                  lockManagerAddress: plugin.lockManagerAddress,
                  memberAddress: memberManager.memberAddress,
                }),
                network: memberManager.network,
                lockManagerAddress: plugin.lockManagerAddress,
                memberAddress: memberManager.memberAddress,
                votingPower: memberManager.votingPower,
                pluginAddress: undefined,
                daoAddress: undefined,
                transactionHash: undefined,
                blockNumber: undefined,
                blockTimestamp: undefined,
              })
            }
          } catch (e) {
            logger.error(
              'updating lockToVoteMember',
              llo({
                migration: '20250811180419-lockToVoteMember',
                pluginAddress: memberManager.pluginAddress,
                memberAddress: memberManager.memberAddress,
              }),
            )
          }
        }),
      )

      // Wait for all promises to complete
      await Promise.all(promises)

      logger.info('Migration completed successfully', llo({ migration: '20250811180419-lockToVoteMember' }))
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
