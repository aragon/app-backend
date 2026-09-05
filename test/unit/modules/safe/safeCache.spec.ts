import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import SafeCacheModule from '@modules/safe/safeCache'
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

  it('rolls the shared hourly budget over and reports exhaustion', async () => {
    sandbox.stub(config.SAFE_API, 'BUDGET_GLOBAL_PER_HOUR').value(2)
    sandbox.stub(config.SAFE_API, 'BUDGET_PAGE_SHARE').value(1)

    expect(await SafeCacheModule.consumeBudget(firstHour)).to.equal(true)
    expect(await SafeCacheModule.consumeBudget(firstHour + 1)).to.equal(true)
    expect(await SafeCacheModule.consumeBudget(firstHour + 2)).to.equal(false)
    expect(loggerWarn.calledOnce).to.equal(true)

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

  it('fails open when Mongo cache operations fail', async () => {
    sandbox.stub(Models.SafeCache, 'read').rejects(new Error('read down'))
    sandbox.stub(Models.SafeCache, 'readExpired').rejects(new Error('expired read down'))
    sandbox.stub(Models.SafeCache, 'write').rejects(new Error('write down'))
    sandbox.stub(Models.SafeCache, 'consumeBudget').rejects(new Error('budget down'))
    sandbox.stub(Models.SafeCache, 'refundBudget').rejects(new Error('refund down'))

    expect(await SafeCacheModule.read('safe', 1000)).to.equal(null)
    expect(await SafeCacheModule.readExpired('safe', 1000)).to.equal(null)
    await SafeCacheModule.write('safe', {}, 1000, 10, 20)
    expect(await SafeCacheModule.consumeBudget(1000)).to.equal(true)
    // A lost refund overcounts the hour by one call, which is strictly safer than throwing inside
    // the failure path that is already handling an upstream refusal.
    await SafeCacheModule.refundBudget(1000)

    expect(loggerError.callCount).to.equal(4)
    expect(loggerWarn.calledWithMatch('Safe: budget refund failed')).to.equal(true)
  })
})
