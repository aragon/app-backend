import { Models } from '@dbModels'
import { assert } from '@errors'
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
 * `syncDao` reconciles rather than inserts, so this is idempotent and safe to re-run. A DAO whose
 * owners could not be read fails the migration, which leaves it pending for the next deploy - a
 * provider outage must not pass for "nothing to seed" and retire the only backfill there is.
 */
export const safeBodyMembersMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    await Models.Setting.syncIndexes()

    // Every DAO with at least one stage body. Which of those bodies are Safes is decided per body
    // by `syncDao`, from the absence of a Plugin document plus a successful `getOwners()`.
    const daos: { _id: { daoAddress: HexAddress; network: NetworksEnum } }[] = await Models.Setting.aggregate([
      { $match: { status: ISettingStatus.active, 'stages.plugins.address': { $ne: null } } },
      { $group: { _id: { daoAddress: '$daoAddress', network: '$network' } } },
    ])

    let membershipsChanged = 0
    const unread: HexAddress[] = []
    for (const { _id } of daos) {
      if (!_id.daoAddress) continue
      const changed = await SafeBodyMembersModule.syncDao(_id.daoAddress, _id.network)
      if (changed === null) unread.push(_id.daoAddress)
      else membershipsChanged += changed
    }

    assert(!unread.length, 'Safe body owners unread', { description: `unread DAOs: ${unread.join(', ')}` })

    logger.info(
      'Migration completed successfully',
      llo({ migration: MIGRATION, daos: daos.length, membershipsChanged }),
    )
  },

  stop: async () => {},
}

export default safeBodyMembersMigration
