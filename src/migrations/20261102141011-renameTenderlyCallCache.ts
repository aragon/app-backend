import { Models } from '@dbModels'
import logger from '@logger'
import { ICollectionNames, type IMigration, ITenderlyCallCacheKind, ITenderlyOperation } from '@types'
import { type mongo } from 'mongoose'

const llo = logger.logMeta.bind(null, { service: 'Migration: renameTenderlyCallCache' })

export const renameTenderlyCallCacheMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20261102141011-renameTenderlyCallCache' }))

    try {
      const db: mongo.Db = Models.TenderlyCallCache.db.db
      const sourceName = 'CrossChainGasCache'
      const targetName = ICollectionNames.TenderlyCallCache
      const now = Date.now()
      const [source, target] = await Promise.all([
        renameTenderlyCallCacheMigration._inspectCollection(db, sourceName, now),
        renameTenderlyCallCacheMigration._inspectCollection(db, targetName, now),
      ])
      logger.info('Tenderly cache before migration', llo({ source, target }))

      if (source.exists && !target.exists) {
        await db.collection(sourceName).rename(targetName, { dropTarget: false })
      } else if (!target.exists) {
        await db.createCollection(targetName)
      }

      const collection = db.collection(targetName)
      const indexes = await collection.indexes()
      const hasUniqueId = indexes.some(
        index =>
          JSON.stringify(index.key) === '{"id":1}' && index.unique && !index.sparse && !index.partialFilterExpression,
      )
      if (!hasUniqueId) await collection.createIndex({ id: 1 }, { unique: true })

      const hasTtl = indexes.some(
        index =>
          JSON.stringify(index.key) === '{"purgeAt":1}' &&
          index.expireAfterSeconds === 0 &&
          !index.partialFilterExpression,
      )
      if (!hasTtl) await collection.createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0 })

      if (source.exists && target.exists) {
        let copied = 0
        let skipped = 0
        for await (const row of db.collection(sourceName).find()) {
          const result = await collection.updateOne({ id: row.id }, { $setOnInsert: row }, { upsert: true })
          copied += result.upsertedCount
          skipped += result.matchedCount
        }
        logger.info('Tenderly cache rows copied', llo({ copied, skipped }))
      }

      await collection.updateMany(
        { kind: ITenderlyCallCacheKind.cache, operation: { $exists: false } },
        { $set: { operation: ITenderlyOperation.crossChainGas } },
      )

      if (source.exists && target.exists) {
        await renameTenderlyCallCacheMigration._dropCopiedSource(db, sourceName, targetName)
      }
      if (await db.listCollections({ name: sourceName }, { nameOnly: true }).hasNext()) {
        throw new Error('CrossChainGasCache still exists after the rename')
      }
      logger.info('Migration completed successfully', llo({ migration: '20261102141011-renameTenderlyCallCache' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20261102141011-renameTenderlyCallCache', error }))
      throw error
    }
  },

  stop: async () => {},

  async _dropCopiedSource(db: mongo.Db, sourceName: string, targetName: string) {
    const missing = await db
      .collection(sourceName)
      .aggregate([
        { $match: { purgeAt: { $not: { $lte: new Date() } } } },
        { $lookup: { from: targetName, localField: 'id', foreignField: 'id', as: 'target' } },
        { $match: { 'target.0': { $exists: false } } },
        { $limit: 1 },
      ])
      .hasNext()
    if (missing) throw new Error('CrossChainGasCache has ids missing from TenderlyCallCache')

    await db.collection(sourceName).drop()
  },

  async _inspectCollection(db: mongo.Db, name: string, now: number) {
    const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext()
    if (!exists) return { name, exists }

    const collection = db.collection(name)
    const hour = Models.TenderlyCallCache.hourBucket(now)
    const [rowsByKind, stats, counters, indexes] = await Promise.all([
      collection.aggregate([{ $group: { _id: '$kind', count: { $sum: 1 } } }]).toArray(),
      db.command({ collStats: name }),
      collection
        .find(
          { kind: ITenderlyCallCacheKind.budget, id: { $regex: `\\|${hour}$` } },
          { projection: { _id: 0, id: 1, count: 1, purgeAt: 1 } },
        )
        .toArray(),
      collection.indexes(),
    ])

    return { name, exists, rowsByKind, size: stats.size, storageSize: stats.storageSize, counters, indexes }
  },
}

export default renameTenderlyCallCacheMigration satisfies IMigration
