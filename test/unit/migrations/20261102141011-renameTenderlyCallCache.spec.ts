import { Models } from '@dbModels'
import logger from '@logger'
import renameTenderlyCallCacheMigration from '@src/migrations/20261102141011-renameTenderlyCallCache'
import { ICollectionNames, ICrossChainGasStatus, ITenderlyCallCacheKind, ITenderlyOperation } from '@types'
import { expect } from 'chai'
import mongoose from 'mongoose'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const SOURCE = 'CrossChainGasCache'
const TARGET = ICollectionNames.TenderlyCallCache

const db = () => mongoose.connection.db!

const exists = async (name: string) => db().listCollections({ name }, { nameOnly: true }).hasNext()

const dropCollection = async (name: string) => {
  if (await exists(name)) await db().dropCollection(name)
}

const indexesByKey = async (name: string) => {
  const byKey: Record<string, any> = {}
  for (const index of await db().collection(name).indexes()) byKey[JSON.stringify(index.key)] = index
  return byKey
}

const rowsById = async (name: string) => {
  const byId: Record<string, any> = {}
  for (const row of await db().collection(name).find().toArray()) byId[row.id] = { ...row, _id: String(row._id) }
  return byId
}

describe('migration: rename TenderlyCallCache', () => {
  let sandbox: SinonSandbox

  const now = Date.now()
  const hour = new Date(now).toISOString().slice(0, 13)
  const previousHour = new Date(now - 60 * 60 * 1000).toISOString().slice(0, 13)
  const createdAt = new Date(now - 120_000)
  const controller = '0x1111111111111111111111111111111111111111'

  const freshId = 'ethereumMainnet|0xaaa|8453|0xfresh'
  const staleId = 'ethereumMainnet|0xaaa|8453|0xstale'
  const expiredId = 'ethereumMainnet|0xaaa|8453|0xexpired'
  const revertedId = 'ethereumMainnet|0xaaa|8453|0xreverted'
  const globalId = `budget|global|${hour}`
  const previousGlobalId = `budget|global|${previousHour}`
  const controllerId = `budget|ethereumMainnet|${controller}|${hour}`

  const cacheRow = (id: string, result: any, expiresAt: number, purgeAt: number) => ({
    id,
    kind: ITenderlyCallCacheKind.cache,
    result,
    expiresAt: new Date(expiresAt),
    purgeAt: new Date(purgeAt),
    createdAt,
    updatedAt: createdAt,
  })

  const budgetRow = (id: string, count: number) => ({
    id,
    kind: ITenderlyCallCacheKind.budget,
    count,
    purgeAt: new Date(now + 2 * 60 * 60 * 1000),
    createdAt,
    updatedAt: createdAt,
  })

  const legacyRows = () => [
    cacheRow(
      freshId,
      { status: ICrossChainGasStatus.SUCCESS, requiredGas: '250000', runAt: now - 10_000 },
      now + 50_000,
      now + 650_000,
    ),
    cacheRow(
      staleId,
      { status: ICrossChainGasStatus.SUCCESS, requiredGas: '180000', runAt: now - 90_000 },
      now - 30_000,
      now + 570_000,
    ),
    cacheRow(
      expiredId,
      { status: ICrossChainGasStatus.SUCCESS, requiredGas: '120000', runAt: now - 900_000 },
      now - 840_000,
      now - 240_000,
    ),
    cacheRow(revertedId, { status: ICrossChainGasStatus.REVERTED, runAt: now - 5_000 }, now + 55_000, now + 655_000),
    budgetRow(globalId, 7),
    budgetRow(previousGlobalId, 20),
    budgetRow(controllerId, 3),
  ]

  const seedSource = async (withIndexes = true) => {
    await db().createCollection(SOURCE)
    if (withIndexes) {
      await db().collection(SOURCE).createIndex({ id: 1 }, { unique: true })
      await db().collection(SOURCE).createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0 })
    }
    await db().collection(SOURCE).insertMany(legacyRows())
    return rowsById(SOURCE)
  }

  const expectIndexes = async (name: string) => {
    const indexes = await indexesByKey(name)
    expect(indexes['{"id":1}']?.unique).to.equal(true)
    expect(indexes['{"purgeAt":1}']?.expireAfterSeconds).to.equal(0)
  }

  // Legacy and migrated rows carry a `purgeAt` that is already past. The ttl monitor must not
  // delete them while a test looks at them.
  before(async () => {
    await db().admin().command({ setParameter: 1, ttlMonitorEnabled: false })
  })

  after(async () => {
    await db().admin().command({ setParameter: 1, ttlMonitorEnabled: true })
  })

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    await dropCollection(TARGET)
    await dropCollection(SOURCE)
  })

  afterEach(async () => {
    sandbox?.restore()
    await Models.TenderlyCallCache.syncIndexes()
  })

  describe('only the old collection exists', () => {
    it('renames it and keeps every row as it was, with the operation added to cache rows', async () => {
      const before = await seedSource()

      await renameTenderlyCallCacheMigration.start()

      expect(await exists(SOURCE)).to.equal(false)
      const after = await rowsById(TARGET)
      expect(Object.keys(after)).to.have.length(7)
      for (const id of [freshId, staleId, expiredId, revertedId]) {
        expect(after[id]).to.deep.equal({ ...before[id], operation: ITenderlyOperation.crossChainGas })
      }
      for (const id of [globalId, previousGlobalId, controllerId]) {
        expect(after[id]).to.deep.equal(before[id])
        expect(after[id]).to.not.have.property('operation')
      }
    })

    it('keeps the unique id and ttl indexes', async () => {
      await seedSource()

      await renameTenderlyCallCacheMigration.start()

      await expectIndexes(TARGET)
    })

    it('builds the indexes when the old collection had none', async () => {
      await seedSource(false)

      await renameTenderlyCallCacheMigration.start()

      await expectIndexes(TARGET)
    })

    it('serves the migrated rows through the new model', async () => {
      await seedSource()

      await renameTenderlyCallCacheMigration.start()

      const fresh = await Models.TenderlyCallCache.readResult(ITenderlyOperation.crossChainGas, freshId, now)
      expect(fresh?.fresh).to.equal(true)
      expect(fresh?.result.requiredGas).to.equal('250000')

      const stale = await Models.TenderlyCallCache.readResult(ITenderlyOperation.crossChainGas, staleId, now)
      expect(stale?.fresh).to.equal(false)
      expect(stale?.result.requiredGas).to.equal('180000')

      expect(await Models.TenderlyCallCache.readResult(ITenderlyOperation.crossChainGas, expiredId, now)).to.equal(null)

      const reverted = await Models.TenderlyCallCache.readResult(ITenderlyOperation.crossChainGas, revertedId, now)
      expect(reverted?.result.status).to.equal(ICrossChainGasStatus.REVERTED)
    })

    it('keeps counting the current hour from where the old collection left it', async () => {
      await seedSource()

      await renameTenderlyCallCacheMigration.start()

      expect(await Models.TenderlyCallCache.consumeBudget(globalId, 10, now)).to.equal(true)
      expect(await Models.TenderlyCallCache.consumeBudget(controllerId, 3, now)).to.equal(false)

      const rows = await rowsById(TARGET)
      expect(rows[globalId].count).to.equal(8)
      expect(rows[controllerId].count).to.equal(3)
      expect(rows[previousGlobalId].count).to.equal(20)
    })

    it('runs again without changing rows or indexes', async () => {
      await seedSource()
      await renameTenderlyCallCacheMigration.start()
      const rows = await rowsById(TARGET)
      const indexes = await indexesByKey(TARGET)

      await renameTenderlyCallCacheMigration.start()

      expect(await exists(SOURCE)).to.equal(false)
      expect(await rowsById(TARGET)).to.deep.equal(rows)
      expect(await indexesByKey(TARGET)).to.deep.equal(indexes)
    })
  })

  describe('only the new collection exists', () => {
    it('fills in the operation on cache rows that miss it and leaves the rest alone', async () => {
      await db().createCollection(TARGET)
      await db()
        .collection(TARGET)
        .insertMany([
          cacheRow(
            freshId,
            { status: ICrossChainGasStatus.SUCCESS, requiredGas: '250000', runAt: now },
            now + 50_000,
            now + 650_000,
          ),
          {
            ...cacheRow(
              staleId,
              { status: ICrossChainGasStatus.SUCCESS, requiredGas: '1', runAt: now },
              now + 50_000,
              now + 650_000,
            ),
            operation: 'other',
          },
          budgetRow(globalId, 7),
        ])
      const before = await rowsById(TARGET)

      await renameTenderlyCallCacheMigration.start()

      expect(await exists(SOURCE)).to.equal(false)
      const after = await rowsById(TARGET)
      expect(after[freshId]).to.deep.equal({ ...before[freshId], operation: ITenderlyOperation.crossChainGas })
      expect(after[staleId]).to.deep.equal(before[staleId])
      expect(after[globalId]).to.deep.equal(before[globalId])
      await expectIndexes(TARGET)
    })
  })

  describe('neither collection exists', () => {
    it('creates the new collection with its indexes', async () => {
      await renameTenderlyCallCacheMigration.start()

      expect(await exists(SOURCE)).to.equal(false)
      expect(await exists(TARGET)).to.equal(true)
      expect(await db().collection(TARGET).countDocuments()).to.equal(0)
      await expectIndexes(TARGET)
    })
  })

  describe('both collections exist', () => {
    it('copies the old rows the new collection does not have, keeps the ones it has, and drops the old collection', async () => {
      const source = await seedSource()
      await Models.TenderlyCallCache.syncIndexes()
      await db()
        .collection(TARGET)
        .insertMany([
          budgetRow(globalId, 2),
          {
            ...cacheRow(
              'ethereumMainnet|0xbbb|8453|0xnew',
              { status: ICrossChainGasStatus.SUCCESS, requiredGas: '9', runAt: now },
              now + 50_000,
              now + 650_000,
            ),
            operation: ITenderlyOperation.crossChainGas,
          },
        ])
      const target = await rowsById(TARGET)

      await renameTenderlyCallCacheMigration.start()

      expect(await exists(SOURCE)).to.equal(false)
      const after = await rowsById(TARGET)
      expect(Object.keys(after)).to.have.length(8)
      for (const id of Object.keys(source)) expect(after, `old id ${id} is missing`).to.have.property(id)
      expect(after[globalId]).to.deep.equal(target[globalId])
      expect(after['ethereumMainnet|0xbbb|8453|0xnew']).to.deep.equal(target['ethereumMainnet|0xbbb|8453|0xnew'])
      expect(after[freshId]).to.deep.equal({ ...source[freshId], operation: ITenderlyOperation.crossChainGas })
      expect(after[previousGlobalId]).to.deep.equal(source[previousGlobalId])
      await expectIndexes(TARGET)
    })

    it('stops and drops nothing when a row cannot be copied', async () => {
      const source = await seedSource()
      await Models.TenderlyCallCache.syncIndexes()
      await db()
        .collection(TARGET)
        .insertOne({ ...budgetRow('budget|global|other', 1), _id: new mongoose.Types.ObjectId(source[globalId]._id) })
      sandbox.stub(logger, 'error')

      await expect(renameTenderlyCallCacheMigration.start()).to.be.rejectedWith('duplicate key')

      expect(await exists(SOURCE)).to.equal(true)
      expect(await rowsById(SOURCE)).to.deep.equal(source)
      expect((await rowsById(TARGET))['budget|global|other'].count).to.equal(1)
    })

    it('stops and drops nothing when an old id is missing from the new collection after the copy', async () => {
      const source = await seedSource()
      await Models.TenderlyCallCache.syncIndexes()
      await db().collection(TARGET).insertOne(budgetRow(globalId, 2))
      const check = renameTenderlyCallCacheMigration._dropCopiedSource
      sandbox.stub(renameTenderlyCallCacheMigration, '_dropCopiedSource').callsFake(async (database, from, to) => {
        await database.collection(to).deleteOne({ id: freshId })
        return check.call(renameTenderlyCallCacheMigration, database, from, to)
      })
      sandbox.stub(logger, 'error')

      await expect(renameTenderlyCallCacheMigration.start()).to.be.rejectedWith('missing')

      expect(await exists(SOURCE)).to.equal(true)
      expect(await rowsById(SOURCE)).to.deep.equal(source)
      expect(await exists(TARGET)).to.equal(true)
    })

    it('still drops the old collection when only an expired old row is gone from the new one', async () => {
      const source = await seedSource()
      await Models.TenderlyCallCache.syncIndexes()
      await db().collection(TARGET).insertOne(budgetRow(globalId, 2))
      const check = renameTenderlyCallCacheMigration._dropCopiedSource
      sandbox.stub(renameTenderlyCallCacheMigration, '_dropCopiedSource').callsFake(async (database, from, to) => {
        await database.collection(to).deleteOne({ id: expiredId })
        return check.call(renameTenderlyCallCacheMigration, database, from, to)
      })

      await renameTenderlyCallCacheMigration.start()

      expect(await exists(SOURCE)).to.equal(false)
      const after = await rowsById(TARGET)
      expect(after).to.not.have.property(expiredId)
      for (const id of [freshId, staleId, revertedId, previousGlobalId, controllerId]) {
        expect(after, `old id ${id} is missing`).to.have.property(id)
      }
      expect(after[freshId]).to.deep.equal({ ...source[freshId], operation: ITenderlyOperation.crossChainGas })
    })
  })

  describe('stop', () => {
    it('does nothing', async () => {
      await expect(renameTenderlyCallCacheMigration.stop()).to.not.be.rejected
    })
  })
})
