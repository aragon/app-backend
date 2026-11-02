import { Models } from '@dbModels'
import {
  ICollectionNames,
  ICrossChainGasStatus,
  ITenderlyCallCacheKind,
  ITenderlyOperation,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import mongoose from 'mongoose'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model: TenderlyCallCache', () => {
  let sandbox: SinonSandbox

  // Pinned to an exact hour. A bucket is one clock hour, it is not a sliding window, so a time in
  // the middle of an hour would make "half an hour later" jump to the next hour and prove nothing.
  const now = Date.UTC(2026, 7, 9, 12, 0, 0)
  const network = NetworksEnum.ethereumMainnet
  const controller = '0x1111111111111111111111111111111111111111'

  const estimate = {
    status: ICrossChainGasStatus.SUCCESS,
    requiredGas: '250000',
    runAt: now,
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('budget ids', () => {
    it('Should make one bucket per hour', () => {
      expect(Models.TenderlyCallCache.hourBucket(now)).to.equal(new Date(now).toISOString().slice(0, 13))
    })

    it('Should keep the same bucket inside one hour and change it on the next hour', () => {
      const halfHourLater = now + 30 * 60 * 1000
      const twoHoursLater = now + 2 * 60 * 60 * 1000

      expect(Models.TenderlyCallCache.globalBudgetId(now)).to.equal(
        Models.TenderlyCallCache.globalBudgetId(halfHourLater),
      )
      expect(Models.TenderlyCallCache.globalBudgetId(now)).to.not.equal(
        Models.TenderlyCallCache.globalBudgetId(twoHoursLater),
      )
    })

    it('Should give every controller its own bucket', () => {
      const other = '0x2222222222222222222222222222222222222222'

      expect(Models.TenderlyCallCache.controllerBudgetId(network, controller, now)).to.not.equal(
        Models.TenderlyCallCache.controllerBudgetId(network, other, now),
      )
    })
  })

  describe('consumeBudget', () => {
    it('Should allow up to the limit and refuse after it', async () => {
      const id = Models.TenderlyCallCache.controllerBudgetId(network, controller, now)

      expect(await Models.TenderlyCallCache.consumeBudget(id, 3, now)).to.equal(true)
      expect(await Models.TenderlyCallCache.consumeBudget(id, 3, now)).to.equal(true)
      expect(await Models.TenderlyCallCache.consumeBudget(id, 3, now)).to.equal(true)
      expect(await Models.TenderlyCallCache.consumeBudget(id, 3, now)).to.equal(false)
    })

    it('Should not allow more than the limit when many calls come together', async () => {
      const id = Models.TenderlyCallCache.controllerBudgetId(network, controller, now)
      const limit = 5

      const results = await Promise.all(
        Array.from({ length: 25 }, () => Models.TenderlyCallCache.consumeBudget(id, limit, now)),
      )

      expect(results.filter(Boolean)).to.have.length(limit)
    })

    it('Should stop writing once the bucket is full', async () => {
      const id = Models.TenderlyCallCache.controllerBudgetId(network, controller, now)

      for (let i = 0; i < 10; i++) await Models.TenderlyCallCache.consumeBudget(id, 2, now)

      // Without the read before the write, someone spamming us would keep writing to this one
      // document on every refused request.
      const doc = await Models.TenderlyCallCache.findOne({ id })
      expect(doc?.count).to.equal(2)
    })

    it('Should count every bucket on its own', async () => {
      const controllerId = Models.TenderlyCallCache.controllerBudgetId(network, controller, now)
      const globalId = Models.TenderlyCallCache.globalBudgetId(now)

      await Models.TenderlyCallCache.consumeBudget(controllerId, 1, now)

      expect(await Models.TenderlyCallCache.consumeBudget(controllerId, 1, now)).to.equal(false)
      expect(await Models.TenderlyCallCache.consumeBudget(globalId, 1, now)).to.equal(true)
    })

    it('Should keep the budget document longer than the hour it counts', async () => {
      const id = Models.TenderlyCallCache.globalBudgetId(now)
      await Models.TenderlyCallCache.consumeBudget(id, 10, now)

      const doc = await Models.TenderlyCallCache.findOne({ id })

      expect(doc?.kind).to.equal(ITenderlyCallCacheKind.budget)
      expect(doc?.count).to.equal(1)
      expect(doc!.purgeAt.getTime()).to.be.greaterThan(now + 60 * 60 * 1000)
    })
  })

  describe('estimates', () => {
    const key = 'ethereumMainnet|0x1111|8453|0xdeadbeef'
    const ttl = 60_000
    const staleWindow = 600_000

    it('Should return null when nothing is saved', async () => {
      expect(await Models.TenderlyCallCache.readResult(ITenderlyOperation.crossChainGas, key, now)).to.equal(null)
    })

    it('Should read the saved measurement as fresh inside the ttl', async () => {
      await Models.TenderlyCallCache.writeResult(
        ITenderlyOperation.crossChainGas,
        key,
        estimate as any,
        now,
        ttl,
        staleWindow,
      )

      const stored = await Models.TenderlyCallCache.readResult(ITenderlyOperation.crossChainGas, key, now + ttl / 2)

      expect(stored?.fresh).to.equal(true)
      expect(stored?.result.requiredGas).to.equal('250000')
    })

    it('Should still return the measurement as old after the ttl', async () => {
      await Models.TenderlyCallCache.writeResult(
        ITenderlyOperation.crossChainGas,
        key,
        estimate as any,
        now,
        ttl,
        staleWindow,
      )

      const stored = await Models.TenderlyCallCache.readResult(ITenderlyOperation.crossChainGas, key, now + ttl + 1000)

      expect(stored?.fresh).to.equal(false)
      expect(stored?.result.requiredGas).to.equal('250000')
    })

    it('Should set purgeAt after expiresAt so we can still return the old one', async () => {
      await Models.TenderlyCallCache.writeResult(
        ITenderlyOperation.crossChainGas,
        key,
        estimate as any,
        now,
        ttl,
        staleWindow,
      )

      const doc = await Models.TenderlyCallCache.findOne({ id: key })

      expect(doc?.kind).to.equal(ITenderlyCallCacheKind.cache)
      expect(doc!.purgeAt.getTime() - doc!.expiresAt!.getTime()).to.equal(staleWindow)
    })

    it('Should replace the old measurement of the same key', async () => {
      await Models.TenderlyCallCache.writeResult(
        ITenderlyOperation.crossChainGas,
        key,
        estimate as any,
        now,
        ttl,
        staleWindow,
      )
      await Models.TenderlyCallCache.writeResult(
        ITenderlyOperation.crossChainGas,
        key,
        { ...estimate, requiredGas: '999999' } as any,
        now + 1000,
        ttl,
        staleWindow,
      )

      const stored = await Models.TenderlyCallCache.readResult(ITenderlyOperation.crossChainGas, key, now + 1000)

      expect(stored?.result.requiredGas).to.equal('999999')
      expect(await Models.TenderlyCallCache.countDocuments({ id: key })).to.equal(1)
    })

    it('Should not return a measurement after the stale window', async () => {
      await Models.TenderlyCallCache.writeResult(
        ITenderlyOperation.crossChainGas,
        key,
        estimate as any,
        now,
        ttl,
        staleWindow,
      )

      // The TTL index only runs in the background, and it is created only when SYNC_MODELS is on,
      // so the read itself has to check `purgeAt`.
      expect(
        await Models.TenderlyCallCache.readResult(
          ITenderlyOperation.crossChainGas,
          key,
          now + ttl + staleWindow + 1000,
        ),
      ).to.equal(null)
    })

    it('Should not read a budget document as a measurement', async () => {
      const budgetId = Models.TenderlyCallCache.globalBudgetId(now)
      await Models.TenderlyCallCache.consumeBudget(budgetId, 10, now)

      expect(await Models.TenderlyCallCache.readResult(ITenderlyOperation.crossChainGas, budgetId, now)).to.equal(null)
    })

    it('Should store the operation on the row', async () => {
      await Models.TenderlyCallCache.writeResult(
        ITenderlyOperation.crossChainGas,
        key,
        estimate as any,
        now,
        ttl,
        staleWindow,
      )

      const doc = await Models.TenderlyCallCache.findOne({ id: key })
      expect(doc?.operation).to.equal(ITenderlyOperation.crossChainGas)
    })

    it('Should not read a row saved for another operation', async () => {
      await Models.TenderlyCallCache.collection.insertOne({
        id: key,
        kind: ITenderlyCallCacheKind.cache,
        operation: 'other',
        result: estimate,
        expiresAt: new Date(now + ttl),
        purgeAt: new Date(now + ttl + staleWindow),
      })

      expect(await Models.TenderlyCallCache.readResult(ITenderlyOperation.crossChainGas, key, now)).to.equal(null)
    })

    it('Should not read a legacy row that has no operation', async () => {
      await Models.TenderlyCallCache.collection.insertOne({
        id: key,
        kind: ITenderlyCallCacheKind.cache,
        result: estimate,
        expiresAt: new Date(now + ttl),
        purgeAt: new Date(now + ttl + staleWindow),
      })

      expect(await Models.TenderlyCallCache.readResult(ITenderlyOperation.crossChainGas, key, now)).to.equal(null)
    })
  })

  describe('consumeBudget limits and bad counters', () => {
    const id = 'budget|global|2026-08-09T12'

    it('Should refuse everything when the limit is zero and write nothing', async () => {
      expect(await Models.TenderlyCallCache.consumeBudget(id, 0, now)).to.equal(false)

      expect(await Models.TenderlyCallCache.countDocuments({ id })).to.equal(0)
    })

    it('Should throw on a negative, fractional or NaN limit', async () => {
      for (const limit of [-1, 2.5, Number.NaN]) {
        await expect(Models.TenderlyCallCache.consumeBudget(id, limit, now)).to.be.rejectedWith(
          'Invalid Tenderly budget limit',
        )
      }

      expect(await Models.TenderlyCallCache.countDocuments({ id })).to.equal(0)
    })

    it('Should throw when the stored count is not a whole number or is negative', async () => {
      await Models.TenderlyCallCache.collection.insertOne({
        id,
        kind: ITenderlyCallCacheKind.budget,
        count: '3',
        purgeAt: new Date(now + 7_200_000),
      })
      await expect(Models.TenderlyCallCache.consumeBudget(id, 10, now)).to.be.rejectedWith(
        'Invalid Tenderly budget counter',
      )

      await Models.TenderlyCallCache.collection.updateOne({ id }, { $set: { count: -1 } })
      await expect(Models.TenderlyCallCache.consumeBudget(id, 10, now)).to.be.rejectedWith(
        'Invalid Tenderly budget counter',
      )
    })

    it('Should throw when a cache row sits at the budget id', async () => {
      await Models.TenderlyCallCache.writeResult(
        ITenderlyOperation.crossChainGas,
        id,
        estimate as any,
        now,
        60_000,
        600_000,
      )

      await expect(Models.TenderlyCallCache.consumeBudget(id, 10, now)).to.be.rejectedWith(
        'Invalid Tenderly budget counter',
      )
    })

    it('Should throw when the update returns nothing', async () => {
      sandbox.stub(Models.TenderlyCallCache, 'findOneAndUpdate').returns({ lean: async () => null } as any)

      await expect(Models.TenderlyCallCache.consumeBudget(id, 10, now)).to.be.rejectedWith(
        'Invalid Tenderly budget update',
      )
    })

    it('Should start a new bucket at the top of the next utc hour', async () => {
      const lastMs = Date.UTC(2026, 7, 9, 12, 59, 59, 999)
      const nextHour = lastMs + 1
      const lastId = Models.TenderlyCallCache.globalBudgetId(lastMs)
      const nextId = Models.TenderlyCallCache.globalBudgetId(nextHour)

      expect(lastId).to.equal('budget|global|2026-08-09T12')
      expect(nextId).to.equal('budget|global|2026-08-09T13')
      expect(await Models.TenderlyCallCache.consumeBudget(lastId, 1, lastMs)).to.equal(true)
      expect(await Models.TenderlyCallCache.consumeBudget(lastId, 1, lastMs)).to.equal(false)
      expect(await Models.TenderlyCallCache.consumeBudget(nextId, 1, nextHour)).to.equal(true)
    })
  })

  describe('model boot', () => {
    it('Should not create the collection when the model is built', async () => {
      const name = ICollectionNames.TenderlyCallCache
      await mongoose.connection.dropCollection(name).catch(() => undefined)

      const booted = mongoose.connection.model('TenderlyCallCacheBoot', Models.TenderlyCallCache.schema)
      await booted.init()

      expect(await mongoose.connection.db!.listCollections({ name }, { nameOnly: true }).hasNext()).to.equal(false)

      mongoose.connection.deleteModel('TenderlyCallCacheBoot')
      await Models.TenderlyCallCache.syncIndexes()
    })
  })
})
