import SafeController from '@api/controllers/safe'
import { Safe } from '@artifacts/Safe'
import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import SafeTxServiceModule from '@modules/safeTxService'
import SafeFixture from '@test/lib/unit-dep/safe'
import {
  ErrorKeyEnum,
  type IExposableError,
  ISafeCacheKind,
  type ISafeQueueResponse,
  ISafeReadKind,
  ISafeSource,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import { dataSlice, getAddress, Interface, ZeroAddress } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox, type SinonSpy, type SinonStub } from 'sinon'

const network = NetworksEnum.ethereumMainnet
const safeAddress = '0x27CE7C8c1675c3b57046Cf56d96061693B6123e8'
const historyFilters = { limit: 20, offset: 0, nonceGte: '0', nonceLte: '1' }

describe('Safe reads', function () {
  this.retries(2)
  let sandbox: SinonSandbox
  let get: SinonSpy
  let readNonce: SinonSpy

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
    sandbox.stub(logger, 'warn')
    SafeFixture.stubSafeQueues(sandbox)
    get = sandbox.spy(SafeTxServiceModule, 'get')
    readNonce = sandbox.spy(SafeChainReaderModule, 'readNonce')
  })

  afterEach(async () => {
    try {
      expect(await Models.SafeTransaction.countDocuments({ network, safeAddress })).to.equal(0)
      expect(await Models.SafeAccount.countDocuments({ network, safeAddress })).to.equal(0)
    } finally {
      sandbox.restore()
    }
  })

  it('reads the Safe history and caches the page', async function () {
    this.timeout(600_000)
    const budgetId = await SafeFixture.budgetId()
    const history = await SafeController.getHistory(network, safeAddress, historyFilters)
    const key = Models.SafeCache.cacheKey(
      network,
      safeAddress,
      ISafeReadKind.history,
      Models.SafeCache.historyPage(historyFilters),
    )
    const cache = await Models.SafeCache.findOne({ id: key })
    const budget = await Models.SafeCache.findOne({ id: budgetId })

    expect(get.callCount).to.equal(1)
    expect(budget?.count).to.equal(1)
    expect(cache?.kind).to.equal(ISafeCacheKind.cache)
    expect((cache?.result as ISafeQueueResponse).meta.fetchedAt).to.equal(history.meta.fetchedAt)
    expect(cache?.expiresAt?.getTime()).to.equal(Date.parse(history.meta.fetchedAt) + config.SAFE_API.HISTORY_CACHE_TTL)
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

    await Models.SafeCache.write(
      key,
      history,
      Date.now(),
      config.SAFE_API.HISTORY_CACHE_TTL,
      config.SAFE_API.HISTORY_STALE_WINDOW,
    )
    expect(await SafeController.getHistory(network, safeAddress, historyFilters)).to.deep.equal(history)
    expect(get.callCount).to.equal(1)
    expect((await Models.SafeCache.findOne({ id: budgetId }))?.count).to.equal(1)
  })

  it('reads the Safe queue and caches the page', async function () {
    this.timeout(600_000)
    const budgetId = await SafeFixture.budgetId()
    const queue = await SafeController.getQueue(network, safeAddress, 20, 0)
    const key = Models.SafeCache.cacheKey(network, safeAddress, ISafeReadKind.queue, Models.SafeCache.queuePage(20, 0))
    const cache = await Models.SafeCache.findOne({ id: key })

    for (const row of queue.results) expect(row.isExecuted).to.equal(false)
    expect(queue.meta.source).to.equal(ISafeSource.safeApi)
    expect(get.callCount).to.equal(1)
    expect((await Models.SafeCache.findOne({ id: budgetId }))?.count).to.equal(1)
    expect(cache?.kind).to.equal(ISafeCacheKind.cache)
    expect((cache?.result as ISafeQueueResponse).meta.fetchedAt).to.equal(queue.meta.fetchedAt)
    expect((cache?.result as ISafeQueueResponse).results).to.deep.equal(queue.results)
    expect(cache?.expiresAt?.getTime()).to.equal(Date.parse(queue.meta.fetchedAt) + config.SAFE_API.QUEUE_CACHE_TTL)
    expect(cache?.purgeAt.getTime()).to.equal(cache!.expiresAt!.getTime() + config.SAFE_API.QUEUE_STALE_WINDOW)

    await Models.SafeCache.write(
      key,
      queue,
      Date.now(),
      config.SAFE_API.QUEUE_CACHE_TTL,
      config.SAFE_API.QUEUE_STALE_WINDOW,
    )
    expect(await SafeController.getQueue(network, safeAddress, 20, 0)).to.deep.equal(queue)
    expect(get.callCount).to.equal(1)
    expect((await Models.SafeCache.findOne({ id: budgetId }))?.count).to.equal(1)
  })

  it('shares two history reads at the same time', async function () {
    this.timeout(600_000)
    const budgetId = await SafeFixture.budgetId()
    const key = Models.SafeCache.cacheKey(
      network,
      safeAddress,
      ISafeReadKind.history,
      Models.SafeCache.historyPage(historyFilters),
    )
    expect(await Models.SafeCache.findOne({ id: key })).to.equal(null)
    const [first, second] = await Promise.all([
      SafeController.getHistory(network, safeAddress, historyFilters),
      SafeController.getHistory(network, safeAddress, historyFilters),
    ])

    expect(first.results).to.have.length(2)
    expect(second).to.deep.equal(first)
    expect(get.callCount).to.equal(1)
    expect((await Models.SafeCache.findOne({ id: budgetId }))?.count).to.equal(1)
    expect((await Models.SafeCache.findOne({ id: key }))?.result).to.deep.equal(first)
  })

  it('reads the Safe info from the contract and caches it', async function () {
    this.timeout(300_000)
    const provider = ProviderModule.getAnyRpcProvider(network)
    const calls = sandbox.spy(provider, 'call')
    const storage = sandbox.spy(provider, 'getStorage')
    const contract = new Interface(Safe.abi)
    const chain = sandbox.spy(SafeChainReaderModule, 'readInfo')
    const info = await SafeController.getInfo(network, safeAddress)
    expect(chain.calledOnceWithExactly(network, safeAddress)).to.equal(true)
    expect(await SafeController.getInfo(network, safeAddress)).to.deep.equal(info)
    expect(chain.callCount).to.equal(1)
    const values: Record<string, any> = {}
    for (const name of ['getOwners', 'getThreshold', 'nonce', 'VERSION', 'getModulesPaginated']) {
      let found = false
      for (const call of calls.getCalls()) {
        if (call.args[0].data?.slice(0, 10) !== contract.getFunction(name)!.selector) continue
        values[name] = contract.decodeFunctionResult(name, await call.returnValue)[0]
        found = true
      }
      expect(found).to.equal(true)
    }
    expect(storage.calledOnce).to.equal(true)
    const guard = await storage.firstCall.returnValue
    const expectedOwners: string[] = []
    for (const owner of values.getOwners) expectedOwners.push(getAddress(owner))
    const expectedModules: string[] = []
    for (const module of values.getModulesPaginated) expectedModules.push(getAddress(module))
    const guardAddress = getAddress(dataSlice(guard, 12))
    const key = Models.SafeCache.cacheKey(network, safeAddress, ISafeReadKind.info)
    const cache = await Models.SafeCache.findOne({ id: key })

    expect(info.address).to.equal(safeAddress)
    expect(info.owners.length).to.be.greaterThan(0)
    for (const owner of info.owners) expect(owner).to.equal(getAddress(owner))
    expect(info.threshold).to.be.greaterThan(0)
    expect(info.threshold).to.be.at.most(info.owners.length)
    expect(info.version).to.be.a('string')
    expect(info.nonce).to.match(/^\d+$/)
    expect(info.owners).to.deep.equal(expectedOwners)
    expect(info.threshold).to.equal(Number(values.getThreshold))
    expect(info.nonce).to.equal(values.nonce.toString())
    expect(info.version).to.equal(values.VERSION)
    expect(info.modules).to.deep.equal(expectedModules)
    expect(info.guard).to.equal(guardAddress === ZeroAddress ? null : guardAddress)
    expect(info.meta.source).to.equal(ISafeSource.chain)
    expect(get.callCount).to.equal(0)
    expect(await Models.SafeCache.findOne({ id: Models.SafeCache.globalBudgetId(Date.now()) })).to.equal(null)
    expect(cache?.kind).to.equal(ISafeCacheKind.cache)
    expect(cache?.result).to.deep.equal(info)
  })

  it('never caches the next nonce', async function () {
    this.timeout(600_000)
    const budgetId = await SafeFixture.budgetId()
    const first = await SafeController.getNextNonce(network, safeAddress)
    await SafeFixture.assertNextNonce(first, get, 0, readNonce)
    const firstCalls = get.callCount
    const second = await SafeController.getNextNonce(network, safeAddress)

    await SafeFixture.assertNextNonce(second, get, firstCalls, readNonce)
    expect((await Models.SafeCache.findOne({ id: budgetId }))?.count).to.equal(get.callCount)
    expect(
      await Models.SafeCache.findOne({ id: Models.SafeCache.cacheKey(network, safeAddress, ISafeReadKind.nextNonce) }),
    ).to.equal(null)
  })

  it('keeps the last budget unit for a next nonce scan', async function () {
    this.timeout(600_000)
    sandbox.stub(config.SAFE_API, 'BUDGET_GLOBAL_PER_HOUR').value(5)
    const budgetId = await SafeFixture.budgetId()
    for (let offset = 0; offset < 4; offset += 1) {
      await SafeController.getHistory(network, safeAddress, { ...historyFilters, limit: 1, offset })
      expect(get.callCount).to.equal(offset + 1)
      expect((await Models.SafeCache.findOne({ id: budgetId }))?.count).to.equal(offset + 1)
    }

    try {
      await SafeController.getHistory(network, safeAddress, historyFilters)
      expect.fail('expected rate limit')
    } catch (error) {
      expect((error as IExposableError).status).to.equal(429)
      expect((error as IExposableError).message).to.equal(ErrorKeyEnum.safeRateLimited)
      expect((error as IExposableError).exposeMeta?.retryAfter).to.equal(300)
    }
    expect(get.callCount).to.equal(4)

    let nonce
    try {
      nonce = await SafeController.getNextNonce(network, safeAddress)
    } catch (error) {
      expect((error as IExposableError).status).to.equal(429)
      expect((error as IExposableError).message).to.equal(ErrorKeyEnum.safeRateLimited)
      expect((error as IExposableError).exposeMeta?.retryAfter).to.equal(300)
      expect(get.callCount).to.equal(5)
      const page = await get.getCall(4).returnValue
      expect(page.results).to.have.length(Math.max(2, config.SAFE_API.NEXT_NONCE_SCAN_LIMIT))
      const floor = BigInt(get.getCall(4).args[2].nonce__gte)
      expect(BigInt(page.results[page.results.length - 1].nonce) > floor).to.equal(true)
    }
    if (nonce) await SafeFixture.assertNextNonce(nonce, get, 4, readNonce)
    expect(get.callCount).to.equal(5)
    expect((await Models.SafeCache.findOne({ id: budgetId }))?.count).to.equal(5)

    try {
      await SafeController.getNextNonce(network, safeAddress)
      expect.fail('expected rate limit')
    } catch (error) {
      expect((error as IExposableError).status).to.equal(429)
      expect((error as IExposableError).message).to.equal(ErrorKeyEnum.safeRateLimited)
      expect((error as IExposableError).exposeMeta?.retryAfter).to.equal(300)
    }
    expect(get.callCount).to.equal(5)
    expect((await Models.SafeCache.findOne({ id: budgetId }))?.count).to.equal(5)
  })

  it('returns an old page when the budget is out', async function () {
    this.timeout(600_000)
    sandbox.stub(config.SAFE_API, 'BUDGET_GLOBAL_PER_HOUR').value(5)
    const budgetId = await SafeFixture.budgetId()
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
    for (let offset = 0; offset < 3; offset += 1) {
      await SafeController.getHistory(network, safeAddress, { ...historyFilters, limit: 1, offset })
      expect(get.callCount).to.equal(offset + 2)
      expect((await Models.SafeCache.findOne({ id: budgetId }))?.count).to.equal(offset + 2)
    }
    get.resetHistory()

    const stale = await SafeController.getHistory(network, safeAddress, historyFilters)
    expect(stale.meta.stale).to.equal(true)
    expect(stale.meta.fetchedAt).to.equal(history.meta.fetchedAt)
    expect(stale.results).to.deep.equal(history.results)
    expect(get.callCount).to.equal(0)
    expect((await Models.SafeCache.findOne({ id: budgetId }))?.count).to.equal(4)
  })

  it('caches the queue, then shows pending transactions and their deletion', async function () {
    this.timeout(600_000)
    const ledger: string[] = []

    try {
      get.resetHistory()
      const firstNonce = await SafeController.getNextNonce(SafeFixture.network, SafeFixture.safeAddress)
      await SafeFixture.assertNextNonce(firstNonce, get, 0, readNonce)
      const nonce = BigInt(firstNonce.nextNonce)
      const empty = await SafeController.getQueue(SafeFixture.network, SafeFixture.safeAddress, 100, 0)
      const calls = get.callCount

      const value = BigInt(Date.now())
      const a = await SafeFixture.propose(nonce, value.toString(), ledger)
      const cachedAt = Date.now()
      const expiresAt = cachedAt + config.SAFE_API.QUEUE_CACHE_TTL
      await Models.SafeCache.write(
        Models.SafeCache.cacheKey(
          SafeFixture.network,
          SafeFixture.safeAddress,
          ISafeReadKind.queue,
          Models.SafeCache.queuePage(100, 0),
        ),
        empty,
        cachedAt,
        config.SAFE_API.QUEUE_CACHE_TTL,
        config.SAFE_API.QUEUE_STALE_WINDOW,
      )
      expect(await SafeController.getQueue(SafeFixture.network, SafeFixture.safeAddress, 100, 0)).to.deep.equal(empty)
      expect(get.callCount).to.equal(calls)
      const c = await SafeFixture.propose(nonce + 1n, (value + 1n).toString(), ledger)
      const queue = await SafeFixture.waitFor(
        async () => {
          if (Date.now() < expiresAt) return null
          const page = await SafeFixture.queue([a.safeTxHash, c.safeTxHash])
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
      expect(Date.parse(queue.meta.fetchedAt)).to.be.at.least(expiresAt)
      expect(get.callCount).to.be.greaterThan(calls)

      for (const proposal of [a, c]) {
        let found = false
        for (const transaction of queue.results) {
          if (transaction.safeTxHash !== proposal.safeTxHash) continue
          found = true
          expect(transaction.nonce).to.equal(proposal.nonce)
          expect(transaction.from).to.equal(SafeFixture.owners[0])
          expect(transaction.to).to.equal(SafeFixture.owners[0])
          expect(transaction.value).to.equal(proposal === a ? value.toString() : (value + 1n).toString())
          expect(transaction.data ?? '0x').to.equal('0x')
          expect(transaction).not.to.have.property('executionDate')
          expect(transaction).not.to.have.property('transactionHash')
          expect(transaction).not.to.have.property('aragonReports')
          expect(transaction.isExecuted).to.equal(false)
          let upstream
          for (const call of get.getCalls()) {
            const page = await call.returnValue
            for (const row of page.results) if (row.safeTxHash === proposal.safeTxHash) upstream = row
          }
          expect(upstream).to.exist
          expect(transaction.confirmationsRequired).to.equal(upstream!.confirmationsRequired)
          let signed = false
          for (const confirmation of transaction.confirmations) {
            if (confirmation.owner === SafeFixture.owners[0]) signed = true
          }
          expect(signed).to.equal(true)
        }
        expect(found).to.equal(true)
      }

      const beforeNext = get.callCount
      const next = await SafeController.getNextNonce(SafeFixture.network, SafeFixture.safeAddress)
      await SafeFixture.assertNextNonce(next, get, beforeNext, readNonce)

      await SafeFixture.remove(a.safeTxHash)
      ledger.splice(ledger.indexOf(a.safeTxHash), 1)
      const remaining = await SafeFixture.waitFor(
        async () => {
          const page = await SafeFixture.queue([a.safeTxHash, c.safeTxHash])
          let hasA = false
          let hasC = false
          for (const transaction of page.results) {
            if (transaction.safeTxHash === a.safeTxHash) hasA = true
            if (transaction.safeTxHash === c.safeTxHash) hasC = true
          }
          return !hasA && hasC ? page : null
        },
        120_000,
        2_000,
      )
      if (!remaining) throw new Error('Queue did not drop the proposal')
      let hasC = false
      for (const transaction of remaining.results) {
        expect(transaction.safeTxHash).not.to.equal(a.safeTxHash)
        if (transaction.safeTxHash === c.safeTxHash) hasC = true
      }
      expect(hasC).to.equal(true)
      const beforeFreed = get.callCount
      const freed = await SafeController.getNextNonce(SafeFixture.network, SafeFixture.safeAddress)
      await SafeFixture.assertNextNonce(freed, get, beforeFreed, readNonce)

      await SafeFixture.remove(c.safeTxHash)
      ledger.splice(ledger.indexOf(c.safeTxHash), 1)
    } finally {
      await SafeFixture.removeAll(ledger)
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
      const filters = { ...historyFilters, limit: 1, offset }
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
