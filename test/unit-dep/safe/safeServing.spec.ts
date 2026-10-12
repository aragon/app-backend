import SafeController from '@api/controllers/safe'
import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import SafeTxServiceModule from '@modules/safeTxService'
import SafeFixture from '@test/lib/unit-dep/safe'
import {
  type IExposableError,
  type ISafeQueueResponse,
  ISafeCacheKind,
  ISafeReadKind,
  ISafeSource,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import { getAddress } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox, type SinonSpy, type SinonStub } from 'sinon'

const network = NetworksEnum.ethereumMainnet
const safeAddress = '0x27CE7C8c1675c3b57046Cf56d96061693B6123e8'
const historyFilters = { limit: 20, offset: 0 }

describe('Safe reads', () => {
  let sandbox: SinonSandbox
  let get: SinonSpy

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
    sandbox.stub(logger, 'warn')
    SafeFixture.stubSafeRead(sandbox)
    get = sandbox.spy(SafeTxServiceModule, 'get')
  })

  afterEach(() => sandbox.restore())

  it('reads the Safe history and caches the page', async function () {
    this.timeout(120_000)
    const history = await SafeController.getHistory(network, safeAddress, historyFilters)
    const now = Date.now()
    const key = Models.SafeCache.cacheKey(
      network,
      safeAddress,
      ISafeReadKind.history,
      Models.SafeCache.historyPage(historyFilters),
    )
    const cache = await Models.SafeCache.findOne({ id: key })
    const budget = await Models.SafeCache.findOne({ id: Models.SafeCache.globalBudgetId(now) })

    expect(get.callCount).to.equal(1)
    expect(budget?.count).to.equal(1)
    expect(cache?.kind).to.equal(ISafeCacheKind.cache)
    expect((cache?.result as ISafeQueueResponse).meta.fetchedAt).to.equal(history.meta.fetchedAt)
    expect(cache?.expiresAt?.getTime()).to.be.greaterThan(now)
    expect(cache?.expiresAt?.getTime()).to.be.at.most(now + config.SAFE_API.HISTORY_CACHE_TTL)
    expect(cache?.purgeAt.getTime()).to.equal(cache!.expiresAt!.getTime() + config.SAFE_API.HISTORY_STALE_WINDOW)

    expect(history.results.length).to.be.at.least(2)
    let previousNonce = Number.POSITIVE_INFINITY
    for (const transaction of history.results) {
      expect(Number(transaction.nonce)).to.be.at.most(previousNonce)
      previousNonce = Number(transaction.nonce)
    }
    for (const nonce of ['1', '0']) {
      let found = false
      for (const transaction of history.results) {
        if (transaction.nonce !== nonce) continue
        found = true
        expect(transaction.isExecuted).to.equal(true)
        expect(transaction.transactionHash).to.match(/^0x[0-9a-fA-F]{64}$/)
        expect(transaction.safeTxHash).to.match(/^0x[0-9a-fA-F]{64}$/)
      }
      expect(found).to.equal(true)
    }
    const cached = cache?.result as ISafeQueueResponse
    expect(cached.results.length).to.equal(history.results.length)
    for (let index = 0; index < history.results.length; index += 1) {
      expect(cached.results[index].safeTxHash).to.equal(history.results[index].safeTxHash)
    }

    expect(await SafeController.getHistory(network, safeAddress, historyFilters)).to.deep.equal(history)
    expect(get.callCount).to.equal(1)
    expect((await Models.SafeCache.findOne({ id: Models.SafeCache.globalBudgetId(now) }))?.count).to.equal(1)
  })

  it('reads the Safe queue and caches the page', async function () {
    this.timeout(120_000)
    const queue = await SafeController.getQueue(network, safeAddress, 20, 0)
    const now = Date.now()
    const key = Models.SafeCache.cacheKey(network, safeAddress, ISafeReadKind.queue, Models.SafeCache.queuePage(20, 0))
    const cache = await Models.SafeCache.findOne({ id: key })
    const budgetId = Models.SafeCache.globalBudgetId(now)

    expect(queue.results).to.deep.equal([])
    expect(queue.meta.source).to.equal(ISafeSource.safeApi)
    expect(get.callCount).to.equal(1)
    expect((await Models.SafeCache.findOne({ id: budgetId }))?.count).to.equal(1)
    expect(cache?.kind).to.equal(ISafeCacheKind.cache)
    expect((cache?.result as ISafeQueueResponse).meta.fetchedAt).to.equal(queue.meta.fetchedAt)
    expect((cache?.result as ISafeQueueResponse).results).to.deep.equal(queue.results)
    expect(cache?.expiresAt?.getTime()).to.be.greaterThan(now)
    expect(cache?.expiresAt?.getTime()).to.be.at.most(now + config.SAFE_API.QUEUE_CACHE_TTL)
    expect(cache?.purgeAt.getTime()).to.equal(cache!.expiresAt!.getTime() + config.SAFE_API.QUEUE_STALE_WINDOW)

    expect(await SafeController.getQueue(network, safeAddress, 20, 0)).to.deep.equal(queue)
    expect(get.callCount).to.equal(1)
    expect((await Models.SafeCache.findOne({ id: budgetId }))?.count).to.equal(1)
  })

  it('reads the Safe info from the chain', async function () {
    this.timeout(120_000)
    const info = await SafeController.getInfo(network, safeAddress)
    const key = Models.SafeCache.cacheKey(network, safeAddress, ISafeReadKind.info)
    const cache = await Models.SafeCache.findOne({ id: key })

    expect(info.address).to.equal(safeAddress)
    expect(info.owners.length).to.be.greaterThan(0)
    for (const owner of info.owners) expect(owner).to.equal(getAddress(owner))
    expect(info.threshold).to.be.greaterThan(0)
    expect(info.threshold).to.be.at.most(info.owners.length)
    expect(info.version).to.be.a('string')
    expect(info.nonce).to.match(/^\d+$/)
    expect(info.meta.source).to.equal(ISafeSource.chain)
    expect(get.callCount).to.equal(0)
    expect(await Models.SafeCache.findOne({ id: Models.SafeCache.globalBudgetId(Date.now()) })).to.equal(null)
    expect(cache?.kind).to.equal(ISafeCacheKind.cache)
    expect(cache?.result).to.deep.equal(info)
  })

  it('never caches the next nonce', async function () {
    this.timeout(120_000)
    const first = await SafeController.getNextNonce(network, safeAddress)
    const second = await SafeController.getNextNonce(network, safeAddress)
    const now = Date.now()

    expect(first.nextNonce).to.equal(first.currentNonce)
    expect(second.nextNonce).to.equal(second.currentNonce)
    expect(get.callCount).to.equal(2)
    expect((await Models.SafeCache.findOne({ id: Models.SafeCache.globalBudgetId(now) }))?.count).to.equal(2)
    expect(
      await Models.SafeCache.findOne({ id: Models.SafeCache.cacheKey(network, safeAddress, ISafeReadKind.nextNonce) }),
    ).to.equal(null)
  })

  it('keeps a next nonce read when page reads are used up', async function () {
    this.timeout(120_000)
    sandbox.stub(config.SAFE_API, 'BUDGET_GLOBAL_PER_HOUR').value(5)
    const now = Date.now()
    const budgetId = Models.SafeCache.globalBudgetId(now)
    for (let count = 0; count < 4; count += 1) {
      expect(await Models.SafeCache.consumeBudget(budgetId, 5, now)).to.equal(true)
    }

    try {
      await SafeController.getHistory(network, safeAddress, historyFilters)
      expect.fail('expected rate limit')
    } catch (error) {
      expect((error as IExposableError).status).to.equal(429)
    }
    expect(get.callCount).to.equal(0)

    const nonce = await SafeController.getNextNonce(network, safeAddress)
    expect(nonce.nextNonce).to.equal(nonce.currentNonce)
    expect(get.callCount).to.equal(1)
    expect((await Models.SafeCache.findOne({ id: budgetId }))?.count).to.equal(5)

    try {
      await SafeController.getNextNonce(network, safeAddress)
      expect.fail('expected rate limit')
    } catch (error) {
      expect((error as IExposableError).status).to.equal(429)
    }
    expect(get.callCount).to.equal(1)
    expect((await Models.SafeCache.findOne({ id: budgetId }))?.count).to.equal(5)
  })

  it('returns an old page when the budget is out', async function () {
    this.timeout(120_000)
    sandbox.stub(config.SAFE_API, 'BUDGET_GLOBAL_PER_HOUR').value(5)
    const history = await SafeController.getHistory(network, safeAddress, historyFilters)
    const now = Date.now()
    const key = Models.SafeCache.cacheKey(
      network,
      safeAddress,
      ISafeReadKind.history,
      Models.SafeCache.historyPage(historyFilters),
    )
    await Models.SafeCache.write(
      key,
      history,
      now - config.SAFE_API.HISTORY_CACHE_TTL - 1000,
      config.SAFE_API.HISTORY_CACHE_TTL,
      config.SAFE_API.HISTORY_STALE_WINDOW,
    )
    const budgetId = Models.SafeCache.globalBudgetId(now)
    for (let count = 1; count < 4; count += 1) {
      expect(await Models.SafeCache.consumeBudget(budgetId, 5, now)).to.equal(true)
    }
    get.resetHistory()

    const stale = await SafeController.getHistory(network, safeAddress, historyFilters)
    expect(stale.meta.stale).to.equal(true)
    expect(stale.meta.fetchedAt).to.equal(history.meta.fetchedAt)
    expect(stale.results).to.deep.equal(history.results)
    expect(get.callCount).to.equal(0)
    expect((await Models.SafeCache.findOne({ id: budgetId }))?.count).to.equal(4)
  })

  it('shows a pending transaction in the queue and drops it once deleted', async function () {
    this.timeout(300_000)
    const ledger: string[] = []

    try {
      await SafeFixture.removeLeftovers()
      get.resetHistory()
      const firstNonce = await SafeController.getNextNonce(SafeFixture.network, SafeFixture.safeAddress)
      const nonce = BigInt(firstNonce.currentNonce)
      expect(firstNonce.nextNonce).to.equal(nonce.toString())

      const value = BigInt(Date.now())
      const a = await SafeFixture.propose(nonce, value.toString(), ledger)
      const c = await SafeFixture.propose(nonce + 1n, (value + 1n).toString(), ledger)
      const queue = await SafeFixture.waitFor(
        async () => {
          const page = await SafeController.getQueue(SafeFixture.network, SafeFixture.safeAddress, 20, 0)
          let hasA = false
          let hasC = false
          for (const transaction of page.results) {
            if (transaction.safeTxHash === a.safeTxHash) hasA = true
            if (transaction.safeTxHash === c.safeTxHash) hasC = true
          }
          return hasA && hasC ? page : null
        },
        120_000,
        2_000,
      )
      if (!queue) throw new Error('Queue did not show the proposals')

      for (const proposal of [a, c]) {
        let found = false
        for (const transaction of queue.results) {
          if (transaction.safeTxHash !== proposal.safeTxHash) continue
          found = true
          expect(transaction.nonce).to.equal(proposal.nonce)
          expect(transaction.isExecuted).to.equal(false)
          expect(transaction.confirmationsRequired).to.equal(2)
          expect(transaction.confirmations).to.have.length(1)
          expect(transaction.confirmations[0].owner).to.equal(SafeFixture.owners[0])
        }
        expect(found).to.equal(true)
      }

      const next = await SafeController.getNextNonce(SafeFixture.network, SafeFixture.safeAddress)
      expect(next.nextNonce).to.equal((nonce + 2n).toString())

      await SafeFixture.remove(a.safeTxHash)
      ledger.splice(ledger.indexOf(a.safeTxHash), 1)
      const freed = await SafeController.getNextNonce(SafeFixture.network, SafeFixture.safeAddress)
      expect(freed.nextNonce).to.equal(nonce.toString())

      const remaining = await SafeFixture.waitFor(
        async () => {
          const page = await SafeController.getQueue(SafeFixture.network, SafeFixture.safeAddress, 20, 0)
          let hasA = false
          let hasC = false
          for (const transaction of page.results) {
            if (transaction.safeTxHash === a.safeTxHash) hasA = true
            if (transaction.safeTxHash === c.safeTxHash) hasC = true
          }
          return !hasA && hasC ? page : null
        },
        config.SAFE_API.QUEUE_CACHE_TTL + 30_000,
        2_000,
      )
      if (!remaining) throw new Error('Queue did not drop the proposal')
      expect(remaining.results).to.have.length(1)
      expect(remaining.results[0].safeTxHash).to.equal(c.safeTxHash)

      await SafeFixture.remove(c.safeTxHash)
      ledger.splice(ledger.indexOf(c.safeTxHash), 1)
    } finally {
      for (const hash of ledger) await SafeFixture.remove(hash)
    }
  })

  it('filters and pages the Safe history', async function () {
    this.timeout(120_000)
    const history = await SafeController.getHistory(network, safeAddress, historyFilters)
    let to: string | undefined
    for (const transaction of history.results) {
      if (transaction.nonce === '0') to = transaction.to
    }
    expect(to).to.be.a('string')

    const fromOne = await SafeController.getHistory(network, safeAddress, { ...historyFilters, nonceGte: '1' })
    expect(fromOne.results).to.have.length(1)
    expect(fromOne.results[0].nonce).to.equal('1')

    const throughZero = await SafeController.getHistory(network, safeAddress, { ...historyFilters, nonceLte: '0' })
    expect(throughZero.results).to.have.length(1)
    expect(throughZero.results[0].nonce).to.equal('0')

    const byTo = await SafeController.getHistory(network, safeAddress, { ...historyFilters, to })
    expect(byTo.results.length).to.be.greaterThan(0)
    for (const transaction of byTo.results) expect(transaction.to).to.equal(to)

    for (let offset = 0; offset < 2; offset += 1) {
      const filters = { limit: 1, offset }
      const page = await SafeController.getHistory(network, safeAddress, filters)
      const key = Models.SafeCache.cacheKey(
        network,
        safeAddress,
        ISafeReadKind.history,
        Models.SafeCache.historyPage(filters),
      )
      expect(page.results).to.have.length(1)
      expect(page.results[0].nonce).to.equal((1 - offset).toString())
      expect((await Models.SafeCache.findOne({ id: key }))?.kind).to.equal(ISafeCacheKind.cache)
    }
  })

  it('refuses a chain with no Safe service', async () => {
    try {
      await SafeController.getHistory(NetworksEnum.citreaMainnet, safeAddress, historyFilters)
      expect.fail('expected unsupported chain')
    } catch (error) {
      expect((error as IExposableError).status).to.equal(501)
    }

    expect((RabbitMQHelper.sendMessage as SinonStub).called).to.equal(false)
    expect(get.callCount).to.equal(0)
  })
})
