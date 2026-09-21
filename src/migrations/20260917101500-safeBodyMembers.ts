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
import { mapLimit } from 'async'

type SeedTarget = { daoAddress: HexAddress; network: NetworksEnum }

/** Each seed waits on a chain read, and the node limiter is what caps the real concurrency. */
const SEED_CONCURRENCY = 5

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

    // Only the DAOs that actually have a Safe. Matching every DAO with any stage body and leaving
    // `seedDao` to work out which were Safes made every DAO on every network pay for two queries
    // and a metrics message, one after another - and most of them have no Safe at all. On a full
    // database that is the difference between a deploy that waits and one that does not.
    const [bodies, processes] = await Promise.all([
      Models.Setting.aggregate([
        { $match: { status: ISettingStatus.active, 'stages.plugins.brandId': VotingBodyBrandIdentity.SAFE } },
        { $group: { _id: { daoAddress: '$daoAddress', network: '$network' } } },
      ]) as Promise<{ _id: { daoAddress: HexAddress; network: NetworksEnum } }[]>,
      // A Safe can also reach a DAO by holding execute permission, which is a plugin row and no
      // setting at all.
      Models.Plugin.find({ interfaceType: IPluginInterfaceType.safe, status: IPluginStatus.installed })
        .select('daoAddress network')
        .lean(),
    ])

    const targets = new Map<string, SeedTarget>()
    for (const { _id } of bodies) {
      if (_id.daoAddress) targets.set(`${_id.network}-${_id.daoAddress}`, _id)
    }
    for (const plugin of processes) {
      const daoAddress = plugin.daoAddress as HexAddress
      const network = plugin.network as NetworksEnum
      if (daoAddress) targets.set(`${network}-${daoAddress}`, { daoAddress, network })
    }

    let seeded = 0
    // Each seed is a chain read behind the node limiter, which is what actually caps concurrency -
    // running them one at a time only serialises the waiting.
    await mapLimit([...targets.values()], SEED_CONCURRENCY, async (target: SeedTarget) => {
      // seedDao never throws, but the migration boundary must not wedge on a contract slip either.
      try {
        await SafeBodyMembersModule.seedDao(target.daoAddress, target.network)
        seeded++
      } catch (error) {
        logger.error('Seed failed for DAO', llo({ migration: MIGRATION, daoAddress: target.daoAddress, error }))
      }
    })

    logger.info('Migration completed successfully', llo({ migration: MIGRATION, daos: targets.size, seeded }))
  },

  stop: async () => {},
}

export default safeBodyMembersMigration
