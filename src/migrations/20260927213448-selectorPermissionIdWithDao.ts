import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: selectorPermissionIdWithDao' })

const migration = '20260927213448-selectorPermissionIdWithDao'

/**
 * The `SelectorPermission` id now ends with the DAO and plugin address, as one condition can back grants
 * in several DAOs. Rewrite the old ids from each row's own fields. Safe to run again.
 */
export const selectorPermissionIdWithDaoMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration }))

    try {
      const rows = await Models.SelectorPermission.find(
        {},
        {
          id: 1,
          network: 1,
          transactionHash: 1,
          transactionIndex: 1,
          logIndex: 1,
          conditionAddress: 1,
          daoAddress: 1,
          pluginAddress: 1,
        },
      ).lean()

      const updates = rows
        .map(row => ({ row, newId: Models.SelectorPermission.getEntityId(row) }))
        .filter(({ row, newId }) => row.id !== newId)
        .map(({ row, newId }) => ({ updateOne: { filter: { _id: row._id }, update: { $set: { id: newId } } } }))

      if (updates.length) await Models.SelectorPermission.bulkWrite(updates)

      logger.info('Migration completed successfully', llo({ migration, rows: rows.length, rewritten: updates.length }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default selectorPermissionIdWithDaoMigration
