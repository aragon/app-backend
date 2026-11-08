import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration, NetworksEnum } from '@types'
import { type Model } from 'mongoose'

const MIGRATION_NAME = '20261108125533-removeJunkTransfers'
const BATCH = 500
const llo = logger.logMeta.bind(null, { service: 'Migration: removeJunkTransfers' })

export const removeJunkTransfersMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION_NAME }))

    try {
      for (const network of Object.values(NetworksEnum)) {
        const daosAndSafes = await removeJunkTransfersMigration._daosAndSafes(network)
        await removeJunkTransfersMigration._purge(Models.Transaction, network, daosAndSafes)
        await removeJunkTransfersMigration._purge(Models.Asset, network, daosAndSafes)
      }

      logger.info('Migration completed successfully', llo({ migration: MIGRATION_NAME }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION_NAME, error }))
      throw error
    }
  },

  stop: async () => {},

  async _daosAndSafes(network: NetworksEnum): Promise<Set<string>> {
    const [daos, safes] = await Promise.all([
      Models.Dao.find({ network }, { address: 1 }).lean(),
      Models.SafeAccount.find({ network }, { safeAddress: 1 }).lean(),
    ])
    return new Set([...daos.map(dao => dao.address), ...safes.map(safe => safe.safeAddress)])
  },

  async _purge(model: Model<any>, network: NetworksEnum, daosAndSafes: Set<string>) {
    const junk: string[] = []
    const cursor = model
      .aggregate<{ _id: string }>([{ $match: { network } }, { $group: { _id: '$daoAddress' } }])
      .allowDiskUse(true)
      .cursor()

    for await (const row of cursor) {
      if (!daosAndSafes.has(row._id)) junk.push(row._id)
    }

    let counted = 0
    for (let i = 0; i < junk.length; i += BATCH) {
      counted += await model.countDocuments({ network, daoAddress: { $in: junk.slice(i, i + BATCH) } })
    }
    logger.info('Junk rows found', llo({ collection: model.collection.name, network, addresses: junk.length, counted }))

    let deleted = 0
    for (let i = 0; i < junk.length; i += BATCH) {
      const result = await model.deleteMany({ network, daoAddress: { $in: junk.slice(i, i + BATCH) } })
      deleted += result.deletedCount
    }
    logger.info('Junk rows deleted', llo({ collection: model.collection.name, network, deleted }))
  },
}

export default removeJunkTransfersMigration satisfies IMigration
