import { Models } from '@dbModels'
import { ICrossChainGasCacheKind, ICrossChainGasStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model: CrossChainGasCache', () => {
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
      expect(Models.CrossChainGasCache.hourBucket(now)).to.equal(new Date(now).toISOString().slice(0, 13))
    })

    it('Should keep the same bucket inside one hour and change it on the next hour', () => {
      const halfHourLater = now + 30 * 60 * 1000
      const twoHoursLater = now + 2 * 60 * 60 * 1000

      expect(Models.CrossChainGasCache.globalBudgetId(now)).to.equal(
        Models.CrossChainGasCache.globalBudgetId(halfHourLater),
      )
      expect(Models.CrossChainGasCache.globalBudgetId(now)).to.not.equal(
        Models.CrossChainGasCache.globalBudgetId(twoHoursLater),
      )
    })

    it('Should give every controller its own bucket', () => {
      const other = '0x2222222222222222222222222222222222222222'

      expect(Models.CrossChainGasCache.controllerBudgetId(network, controller, now)).to.not.equal(
        Models.CrossChainGasCache.controllerBudgetId(network, other, now),
      )
    })
  })

  describe('consumeBudget', () => {
    it('Should allow up to the limit and refuse after it', async () => {
      const id = Models.CrossChainGasCache.controllerBudgetId(network, controller, now)

      expect(await Models.CrossChainGasCache.consumeBudget(id, 3, now)).to.equal(true)
      expect(await Models.CrossChainGasCache.consumeBudget(id, 3, now)).to.equal(true)
      expect(await Models.CrossChainGasCache.consumeBudget(id, 3, now)).to.equal(true)
      expect(await Models.CrossChainGasCache.consumeBudget(id, 3, now)).to.equal(false)
    })

    it('Should not allow more than the limit when many calls come together', async () => {
      const id = Models.CrossChainGasCache.controllerBudgetId(network, controller, now)
      const limit = 5

      const results = await Promise.all(
        Array.from({ length: 25 }, () => Models.CrossChainGasCache.consumeBudget(id, limit, now)),
      )

      expect(results.filter(Boolean)).to.have.length(limit)
    })

    it('Should stop writing once the bucket is full', async () => {
      const id = Models.CrossChainGasCache.controllerBudgetId(network, controller, now)

      for (let i = 0; i < 10; i++) await Models.CrossChainGasCache.consumeBudget(id, 2, now)

      // Without the read before the write, someone spamming us would keep writing to this one
      // document on every refused request.
      const doc = await Models.CrossChainGasCache.findOne({ id })
      expect(doc?.count).to.equal(2)
    })

    it('Should count every bucket on its own', async () => {
      const controllerId = Models.CrossChainGasCache.controllerBudgetId(network, controller, now)
      const globalId = Models.CrossChainGasCache.globalBudgetId(now)

      await Models.CrossChainGasCache.consumeBudget(controllerId, 1, now)

      expect(await Models.CrossChainGasCache.consumeBudget(controllerId, 1, now)).to.equal(false)
      expect(await Models.CrossChainGasCache.consumeBudget(globalId, 1, now)).to.equal(true)
    })

    it('Should keep the budget document longer than the hour it counts', async () => {
      const id = Models.CrossChainGasCache.globalBudgetId(now)
      await Models.CrossChainGasCache.consumeBudget(id, 10, now)

      const doc = await Models.CrossChainGasCache.findOne({ id })

      expect(doc?.kind).to.equal(ICrossChainGasCacheKind.budget)
      expect(doc?.count).to.equal(1)
      expect(doc!.purgeAt.getTime()).to.be.greaterThan(now + 60 * 60 * 1000)
    })
  })

  describe('estimates', () => {
    const key = 'ethereumMainnet|0x1111|8453|0xdeadbeef'
    const ttl = 60_000
    const staleWindow = 600_000

    it('Should return null when nothing is saved', async () => {
      expect(await Models.CrossChainGasCache.readEstimate(key, now)).to.equal(null)
    })

    it('Should read the saved measurement as fresh inside the ttl', async () => {
      await Models.CrossChainGasCache.writeEstimate(key, estimate as any, now, ttl, staleWindow)

      const stored = await Models.CrossChainGasCache.readEstimate(key, now + ttl / 2)

      expect(stored?.fresh).to.equal(true)
      expect(stored?.result.requiredGas).to.equal('250000')
    })

    it('Should still return the measurement as old after the ttl', async () => {
      await Models.CrossChainGasCache.writeEstimate(key, estimate as any, now, ttl, staleWindow)

      const stored = await Models.CrossChainGasCache.readEstimate(key, now + ttl + 1000)

      expect(stored?.fresh).to.equal(false)
      expect(stored?.result.requiredGas).to.equal('250000')
    })

    it('Should set purgeAt after expiresAt so we can still return the old one', async () => {
      await Models.CrossChainGasCache.writeEstimate(key, estimate as any, now, ttl, staleWindow)

      const doc = await Models.CrossChainGasCache.findOne({ id: key })

      expect(doc?.kind).to.equal(ICrossChainGasCacheKind.cache)
      expect(doc!.purgeAt.getTime() - doc!.expiresAt!.getTime()).to.equal(staleWindow)
    })

    it('Should replace the old measurement of the same key', async () => {
      await Models.CrossChainGasCache.writeEstimate(key, estimate as any, now, ttl, staleWindow)
      await Models.CrossChainGasCache.writeEstimate(
        key,
        { ...estimate, requiredGas: '999999' } as any,
        now + 1000,
        ttl,
        staleWindow,
      )

      const stored = await Models.CrossChainGasCache.readEstimate(key, now + 1000)

      expect(stored?.result.requiredGas).to.equal('999999')
      expect(await Models.CrossChainGasCache.countDocuments({ id: key })).to.equal(1)
    })

    it('Should not return a measurement after the stale window', async () => {
      await Models.CrossChainGasCache.writeEstimate(key, estimate as any, now, ttl, staleWindow)

      // The TTL index only runs in the background, and it is created only when SYNC_MODELS is on,
      // so the read itself has to check `purgeAt`.
      expect(await Models.CrossChainGasCache.readEstimate(key, now + ttl + staleWindow + 1000)).to.equal(null)
    })

    it('Should not read a budget document as a measurement', async () => {
      const budgetId = Models.CrossChainGasCache.globalBudgetId(now)
      await Models.CrossChainGasCache.consumeBudget(budgetId, 10, now)

      expect(await Models.CrossChainGasCache.readEstimate(budgetId, now)).to.equal(null)
    })
  })
})
