import { EnumConnection, type IService } from '@types'
import { Models } from '@dbModels'
import dayjs from '@helpers/dayjs'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'tools:CleanUpTasks' })

export const CleanUpTasks: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],
  start: async () => {
    const BATCH_SIZE = 10000
    const DAYS_TO_KEEP = 7

    async function cleanupOldTaskRuns() {
      const cutoffDate = dayjs().utc().subtract(DAYS_TO_KEEP, 'days').toDate()

      logger.info(`Cleaning up task runs older than ${DAYS_TO_KEEP} days...`)

      let deletedTotal = 0

      // Delete in batches - find IDs first, then delete
      while (true) {
        // Find old records
        const oldRuns = await Models.TaskRun.find({ createdAt: { $lt: cutoffDate } })
          .select('_id')
          .limit(BATCH_SIZE)
          .lean()

        if (oldRuns.length === 0) break

        // Extract IDs
        const ids = oldRuns.map(run => run._id)

        // Delete by IDs
        const result = await Models.TaskRun.deleteMany({ _id: { $in: ids } })

        deletedTotal += result.deletedCount
        logger.info(`Deleted ${deletedTotal} task runs...`)

        // Small delay to prevent overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      logger.info(`Cleanup complete. Deleted ${deletedTotal} task runs.`)
    }

    try {
      await cleanupOldTaskRuns()
      logger.info('Migration completed successfully')
    } catch (error) {
      logger.error('Migration failed', { error })
      throw error
    }
  },

  stop: () => {},
}
