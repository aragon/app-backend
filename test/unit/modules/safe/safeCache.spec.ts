import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import SafeCacheModule from '@modules/safe/safeCache'
import { ISafeReadKind, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

describe('Module: safe/safeCache', () => {
  let sandbox: SinonSandbox
  let loggerWarn: sinon.SinonStub
  let loggerError: sinon.SinonStub

  const firstHour = Date.UTC(2026, 7, 26, 12, 0, 0)

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerWarn = sandbox.stub(logger, 'warn')
    loggerError = sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    sandbox.restore()
  })

  // The logger is one object shared by the whole suite, so the stub also catches warnings from
  // anything else that is still running. Only the lines this module wrote can be counted.
  const ownWarnings = () =>
    loggerWarn.args.filter(([, meta]) => meta?.service === 'safe-cache').map(([message]) => message)

  it('builds distinct keys for paginated and unpaginated reads', () => {
    expect(Models.SafeCache.cacheKey('ethereum-mainnet', '0xSafe', 'info')).to.equal(
      'safe|ethereum-mainnet|0xSafe|info',
    )
    expect(Models.SafeCache.cacheKey('ethereum-mainnet', '0xSafe', 'queue', '20:40')).to.equal(
      'safe|ethereum-mainnet|0xSafe|queue|20:40',
    )
  })

  it('moves a payload from fresh to stale to expired fallback data', async () => {
    await SafeCacheModule.write('safe', { nonce: '6' }, 1000, 10, 20)

    expect(await SafeCacheModule.read('safe', 1009)).to.deep.equal({ result: { nonce: '6' }, fresh: true })
    expect(await SafeCacheModule.read('safe', 1010)).to.deep.equal({ result: { nonce: '6' }, fresh: false })
    expect(await SafeCacheModule.read('safe', 1030)).to.equal(null)
    expect(await SafeCacheModule.readExpired('safe', 1030)).to.deep.equal({ result: { nonce: '6' }, fresh: false })
    expect(await SafeCacheModule.readExpired('safe', 1031)).to.deep.equal({ result: { nonce: '6' }, fresh: false })
  })

  it('returns null for missing and unexpired expired-data lookups', async () => {
    expect(await SafeCacheModule.read('missing', 1000)).to.equal(null)
    expect(await SafeCacheModule.readExpired('missing', 1000)).to.equal(null)

    await SafeCacheModule.write('safe', { ok: true }, 1000, 10, 20)
    expect(await SafeCacheModule.readExpired('safe', 1009)).to.equal(null)
  })

  it('keeps a confirmed info miss fresh for 60 seconds without sliding expiry', async () => {
    const network = NetworksEnum.ethereumMainnet
    const address = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'
    const now = Date.now()
    const key = `safe|${network}|${address}|info|not-found`

    await SafeCacheModule.writeInfoNotFound(network, address.toLowerCase(), now)
    const doc = await Models.SafeCache.findOne({ id: key })
    expect(Models.SafeCache.infoNotFoundKey(network, address)).to.equal(key)
    expect(doc?.result).to.deep.equal({ notFound: true })
    expect(doc?.expiresAt).to.deep.equal(new Date(now + 60_000))
    expect(doc?.purgeAt).to.deep.equal(doc?.expiresAt)
    expect(await SafeCacheModule.readInfoNotFound(network, address, now + 59_999)).to.equal(true)
    expect(await SafeCacheModule.readInfoNotFound(network, address.toLowerCase(), now + 60_000)).to.equal(false)
    expect(await Models.SafeCache.findOne({ id: key })).not.to.be.null
    expect((await Models.SafeCache.findOne({ id: key }))?.expiresAt).to.deep.equal(new Date(now + 60_000))
    expect(await SafeCacheModule.readInfoNotFound(NetworksEnum.baseMainnet, address, now)).to.equal(false)
  })

  it('ignores other info payloads and clears only the miss key', async () => {
    const network = NetworksEnum.ethereumMainnet
    const address = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'
    const now = Date.now()
    const missKey = Models.SafeCache.infoNotFoundKey(network, address)
    const infoKey = Models.SafeCache.cacheKey(network, address, ISafeReadKind.info)
    await Models.SafeCache.write(missKey, { notFound: 'yes' }, now, 60_000, 0)
    await Models.SafeCache.write(infoKey, { nonce: '6' }, now, 60_000, 0)

    expect(await SafeCacheModule.readInfoNotFound(network, address, now)).to.equal(false)
    await SafeCacheModule.clearInfoNotFound(network, address.toLowerCase())
    expect(await Models.SafeCache.findOne({ id: missKey })).to.equal(null)
    expect(await Models.SafeCache.findOne({ id: infoKey })).not.to.be.null
  })

  it('rolls the shared hourly budget over and reports exhaustion', async () => {
    sandbox.stub(config.SAFE_API, 'BUDGET_GLOBAL_PER_HOUR').value(2)
    sandbox.stub(config.SAFE_API, 'BUDGET_PAGE_SHARE').value(1)

    expect(await SafeCacheModule.consumeBudget(firstHour)).to.equal(true)
    expect(await SafeCacheModule.consumeBudget(firstHour + 1)).to.equal(true)
    expect(await SafeCacheModule.consumeBudget(firstHour + 2)).to.equal(false)
    expect(ownWarnings()).to.deep.equal(['Safe: global hourly budget exhausted'])

    expect(await SafeCacheModule.consumeBudget(firstHour + 60 * 60 * 1000)).to.equal(true)
  })

  it('refuses page reads at their share while nonce allocation may spend the remainder', async () => {
    sandbox.stub(config.SAFE_API, 'BUDGET_GLOBAL_PER_HOUR').value(10)
    sandbox.stub(config.SAFE_API, 'BUDGET_PAGE_SHARE').value(0.8)

    // Page reads fail open to stale data; next-nonce has no stale path, so it gets the tail.
    for (let call = 0; call < 8; call += 1) {
      expect(await SafeCacheModule.consumeBudget(firstHour, 'page')).to.equal(true)
    }
    expect(await SafeCacheModule.consumeBudget(firstHour, 'page')).to.equal(false)
    expect(await SafeCacheModule.consumeBudget(firstHour, 'nonce')).to.equal(true)
    expect(await SafeCacheModule.consumeBudget(firstHour, 'nonce')).to.equal(true)
    expect(await SafeCacheModule.consumeBudget(firstHour, 'nonce')).to.equal(false)
  })

  it('hands a refunded unit back to the same hour without going negative', async () => {
    sandbox.stub(config.SAFE_API, 'BUDGET_GLOBAL_PER_HOUR').value(1)
    sandbox.stub(config.SAFE_API, 'BUDGET_PAGE_SHARE').value(1)

    expect(await SafeCacheModule.consumeBudget(firstHour)).to.equal(true)
    expect(await SafeCacheModule.consumeBudget(firstHour)).to.equal(false)

    await SafeCacheModule.refundBudget(firstHour)

    expect(await SafeCacheModule.consumeBudget(firstHour)).to.equal(true)

    // Refunding more than was charged must not mint allowance for the hour.
    await SafeCacheModule.refundBudget(firstHour)
    await SafeCacheModule.refundBudget(firstHour)
    await SafeCacheModule.refundBudget(firstHour)

    expect(await SafeCacheModule.consumeBudget(firstHour)).to.equal(true)
    expect(await SafeCacheModule.consumeBudget(firstHour)).to.equal(false)
  })

  it('never charges more than the limit when calls arrive together', async () => {
    // The atomic conditional increment is the whole point: the old check-then-increment passes every
    // sequential test above, so only a concurrent burst tells the two apart.
    const limit = 5
    sandbox.stub(config.SAFE_API, 'BUDGET_GLOBAL_PER_HOUR').value(limit)
    sandbox.stub(config.SAFE_API, 'BUDGET_PAGE_SHARE').value(1)

    const results = await Promise.all(Array.from({ length: 25 }, () => SafeCacheModule.consumeBudget(firstHour)))

    expect(results.filter(Boolean)).to.have.length(limit)

    const bucket = await Models.SafeCache.findOne({ id: Models.SafeCache.globalBudgetId(firstHour) })
    expect(bucket?.count).to.equal(limit)
  })

  it('refuses every call and never opens a bucket when the budget is zero', async () => {
    // A zero budget is a kill switch: it must not slip through as a freshly inserted bucket at one.
    sandbox.stub(config.SAFE_API, 'BUDGET_GLOBAL_PER_HOUR').value(0)
    sandbox.stub(config.SAFE_API, 'BUDGET_PAGE_SHARE').value(1)

    expect(await SafeCacheModule.consumeBudget(firstHour)).to.equal(false)
    expect(await Models.SafeCache.findOne({ id: Models.SafeCache.globalBudgetId(firstHour) })).to.equal(null)
  })

  it('fails open when Mongo cache operations fail', async () => {
    sandbox.stub(Models.SafeCache, 'read').rejects(new Error('read down'))
    sandbox.stub(Models.SafeCache, 'readExpired').rejects(new Error('expired read down'))
    sandbox.stub(Models.SafeCache, 'write').rejects(new Error('write down'))
    sandbox.stub(Models.SafeCache, 'deleteOne').rejects(new Error('delete down'))
    sandbox.stub(Models.SafeCache, 'consumeBudget').rejects(new Error('budget down'))
    sandbox.stub(Models.SafeCache, 'refundBudget').rejects(new Error('refund down'))

    expect(await SafeCacheModule.read('safe', 1000)).to.equal(null)
    expect(await SafeCacheModule.readExpired('safe', 1000)).to.equal(null)
    await SafeCacheModule.write('safe', {}, 1000, 10, 20)
    await SafeCacheModule.clearInfoNotFound(NetworksEnum.ethereumMainnet, '0xd84C233A7D1578021d21E39785439bEdDB165F3D')
    expect(await SafeCacheModule.consumeBudget(1000)).to.equal(true)
    // A lost refund overcounts the hour by one call, which is strictly safer than throwing inside
    // the failure path that is already handling an upstream refusal.
    await SafeCacheModule.refundBudget(1000)

    expect(loggerError.callCount).to.equal(5)
    expect(loggerWarn.calledWithMatch('Safe: budget refund failed')).to.equal(true)
  })
})
