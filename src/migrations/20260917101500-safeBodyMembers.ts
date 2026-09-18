import { Models } from '@dbModels'
import logger from '@logger'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import { type HexAddress, type IMigration, ISettingStatus, type NetworksEnum } from '@types'

const MIGRATION = '20260917101500-safeBodyMembers'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

/**
 * Brings Safe-body membership into an existing database.
 *
 * Two things that only happen here:
 *  1. Builds `Setting`'s reverse body-address index. Model index synchronization is off by default,
 *     and without that index every Safe owner event on the network scans the collection.
 *  2. Seeds the owners of Safe bodies configured before this existed. Owner events are only
 *     followed from now on, so a Safe made a body last year would otherwise stay invisible until
 *     its next owner change.
 *
 * `seedDao` is the SAFE-only, never-throwing seed the module already uses on settings updates: it
 * reads and writes at the seed boundary and swallows/logs its own failures. A provider outage
 * therefore no longer wedges the deploy - a DAO that could not be read is simply left for a later
 * settings update or explicit operational backfill, and this migration completes. Re-running is
 * safe because the seed upserts by tuple.
 */
export const safeBodyMembersMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    await Models.Setting.syncIndexes()

    // Every DAO with at least one stage body. Which of those bodies are Safes is decided per body
    // inside `seedDao`, which seeds SAFE-branded bodies only.
    const daos: { _id: { daoAddress: HexAddress; network: NetworksEnum } }[] = await Models.Setting.aggregate([
      { $match: { status: ISettingStatus.active, 'stages.plugins.address': { $ne: null } } },
      { $group: { _id: { daoAddress: '$daoAddress', network: '$network' } } },
    ])

    let seeded = 0
    for (const { _id } of daos) {
      if (!_id.daoAddress) continue
      // seedDao never throws, but the migration boundary must not wedge on a contract slip either.
      try {
        await SafeBodyMembersModule.seedDao(_id.daoAddress, _id.network)
        seeded++
      } catch (error) {
        logger.error('Seed failed for DAO', llo({ migration: MIGRATION, daoAddress: _id.daoAddress, error }))
      }
    }

    logger.info('Migration completed successfully', llo({ migration: MIGRATION, daos: daos.length, seeded }))
  },

  stop: async () => {},
}

export default safeBodyMembersMigration
