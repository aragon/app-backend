import { Models } from '@dbModels'
import logger from '@logger'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import {
  type HexAddress,
  type IMigration,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  type NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'

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

    const groupByDao = { $group: { _id: { daoAddress: '$daoAddress', network: '$network' } } }
    const rows: { _id: { daoAddress: HexAddress; network: NetworksEnum } }[][] = await Promise.all([
      Models.Setting.aggregate([
        {
          $match: {
            status: ISettingStatus.active,
            stages: {
              $elemMatch: {
                plugins: { $elemMatch: { address: { $ne: null }, brandId: VotingBodyBrandIdentity.SAFE } },
              },
            },
          },
        },
        groupByDao,
      ]),
      Models.Plugin.aggregate([
        { $match: { interfaceType: IPluginInterfaceType.safe, status: IPluginStatus.installed } },
        groupByDao,
      ]),
    ])

    const daos = new Map<string, { daoAddress: HexAddress; network: NetworksEnum }>()
    for (const { _id } of rows.flat()) {
      if (_id.daoAddress) daos.set(`${_id.network}-${_id.daoAddress}`, _id)
    }

    let seeded = 0
    for (const { daoAddress, network } of daos.values()) {
      // seedDao never throws, but the migration boundary must not wedge on a contract slip either.
      try {
        await SafeBodyMembersModule.seedDao(daoAddress, network)
        seeded++
      } catch (error) {
        logger.error('Seed failed for DAO', llo({ migration: MIGRATION, daoAddress, error }))
      }
    }

    logger.info('Migration completed successfully', llo({ migration: MIGRATION, daos: daos.size, seeded }))
  },

  stop: async () => {},
}

export default safeBodyMembersMigration
