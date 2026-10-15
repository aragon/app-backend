import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import { type IMigration } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: dedupeSelectorPermissions' })

const migration = '20260819141224-dedupeSelectorPermissions'

// The build reads the whole collection, so one pass is enough unless a pod that still runs the old
// code writes a duplicate while it is running. One extra pass covers that, and a second failure
// means the old pods are still up, which the deploy has to solve.
const MAX_ATTEMPTS = 2

const removeDuplicates = async () => {
  const duplicates = await Models.SelectorPermission.aggregate([
    {
      $group: {
        _id: '$id',
        count: { $sum: 1 },
        docs: { $push: { _id: '$_id', isAllowed: '$isAllowed' } },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]).allowDiskUse(true)

  // A revoked copy carries the disallow that the racing writer never saw, so it wins over the
  // older row. Otherwise the oldest wins — ObjectIds are time ordered, so string order is age.
  const idsToDelete = duplicates.flatMap((group: any) =>
    [...group.docs]
      .sort((left, right) => {
        if (left.isAllowed !== right.isAllowed) return left.isAllowed ? 1 : -1
        return String(left._id).localeCompare(String(right._id))
      })
      .slice(1)
      .map(doc => doc._id),
  )

  if (idsToDelete.length) {
    await Models.SelectorPermission.deleteMany({ _id: { $in: idsToDelete } })
  }

  return { duplicatedIds: duplicates.length, deleted: idsToDelete.length }
}

/**
 * `SelectorPermission` was the only collection whose entity id had no unique index, so two workers
 * handling the same log both passed the "does this log already exist" check and both wrote a row.
 * The API then lists the same allowed selector twice, and revoking it only flips one of the copies
 * because the disallow lookup reads a single document.
 *
 * Keep one row per id — the revoked copy when the group has one, otherwise the oldest — drop the
 * rest, then build the unique index the model now declares. Safe to run again.
 */
export const dedupeSelectorPermissionsMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration }))

    try {
      let removed = { duplicatedIds: 0, deleted: 0 }

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        removed = await removeDuplicates()

        logger.verbose('Duplicate selector permissions removed', llo({ ...removed, attempt }))

        try {
          await Models.SelectorPermission.syncIndexes()
          break
        } catch (error) {
          if (!DbTx.isErrorDuplicateKey(error) || attempt === MAX_ATTEMPTS) throw error

          logger.warn('Unique index rejected a duplicate written mid build, cleaning up again', llo({ attempt }))
        }
      }

      const indexes = await Models.SelectorPermission.collection.indexes()

      logger.info(
        'Migration completed successfully',
        llo({
          migration,
          ...removed,
          indexes: indexes.map((index: any) => index.name),
        }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default dedupeSelectorPermissionsMigration
