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
 * Builds `Setting`'s reverse body-address index (model index sync is off) and seeds the owners of
 * Safe bodies configured before owner events were followed. `seedDao` never throws and upserts by
 * tuple, so re-running is safe.
 */
export const safeBodyMembersMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    await Models.Setting.syncIndexes()

    // Only the DAOs that have a Safe, as a stage body or as a process.
    const [bodies, processes] = await Promise.all([
      Models.Setting.aggregate([
        { $match: { status: ISettingStatus.active, 'stages.plugins.brandId': VotingBodyBrandIdentity.SAFE } },
        { $group: { _id: { daoAddress: '$daoAddress', network: '$network' } } },
      ]) as Promise<{ _id: { daoAddress: HexAddress; network: NetworksEnum } }[]>,
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
    await mapLimit([...targets.values()], SEED_CONCURRENCY, async (target: SeedTarget) => {
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
