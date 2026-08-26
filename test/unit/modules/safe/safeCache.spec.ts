import config from '@config'
import logger from '@logger'
import SafeCacheModule from '@modules/safe/safeCache'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

describe('Module: safe/safeCache', () => {
  let sandbox: SinonSandbox
  let loggerWarn: sinon.SinonStub

  const firstHour = Date.UTC(2026, 7, 26, 12, 0, 0)

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerWarn = sandbox.stub(logger, 'warn')
    SafeCacheModule.reset()
  })

  afterEach(() => {
    SafeCacheModule.reset()
    sandbox.restore()
  })

  it('builds distinct keys for paginated and unpaginated reads', () => {
    expect(SafeCacheModule.key('ethereum-mainnet', '0xSafe', 'info')).to.equal('safe|ethereum-mainnet|0xSafe|info')
    expect(SafeCacheModule.key('ethereum-mainnet', '0xSafe', 'queue', '20:40')).to.equal(
      'safe|ethereum-mainnet|0xSafe|queue|20:40',
    )
  })

  it('moves a payload from fresh to stale to degraded expired data', () => {
    SafeCacheModule.write('safe', { nonce: '6' }, 1000, 10, 20)

    expect(SafeCacheModule.read('safe', 1009)).to.deep.equal({ result: { nonce: '6' }, fresh: true })
    expect(SafeCacheModule.read('safe', 1010)).to.deep.equal({ result: { nonce: '6' }, fresh: false })
    expect(SafeCacheModule.read('safe', 1030)).to.equal(null)
    expect(SafeCacheModule.readExpired('safe', 1030)).to.deep.equal({ result: { nonce: '6' }, fresh: false })
    expect(SafeCacheModule.readExpired('safe', 1031)).to.deep.equal({ result: { nonce: '6' }, fresh: false })
  })

  it('returns null for missing and unexpired expired-data lookups', () => {
    expect(SafeCacheModule.read('missing', 1000)).to.equal(null)
    expect(SafeCacheModule.readExpired('missing', 1000)).to.equal(null)

    SafeCacheModule.write('safe', { ok: true }, 1000, 10, 20)
    expect(SafeCacheModule.readExpired('safe', 1029)).to.equal(null)
  })

  it('evicts the oldest live entry when the cache cap is reached', () => {
    sandbox.stub(config.SAFE_API, 'MAX_CACHE_ENTRIES').value(1)

    SafeCacheModule.write('first', 1, 1000, 100, 100)
    SafeCacheModule.write('second', 2, 1001, 100, 100)

    expect(SafeCacheModule.read('first', 1001)).to.equal(null)
    expect(SafeCacheModule.read('second', 1001)).to.deep.equal({ result: 2, fresh: true })
  })

  it('evicts expired entries before evicting live entries', () => {
    sandbox.stub(config.SAFE_API, 'MAX_CACHE_ENTRIES').value(1)

    SafeCacheModule.write('expired', 1, 1000, 1, 1)
    SafeCacheModule.write('live', 2, 1010, 100, 100)

    expect(SafeCacheModule.readExpired('expired', 1010)).to.equal(null)
    expect(SafeCacheModule.read('live', 1010)).to.deep.equal({ result: 2, fresh: true })
  })

  it('rolls the hourly budget over and reports exhaustion', () => {
    sandbox.stub(config.SAFE_API, 'BUDGET_GLOBAL_PER_HOUR').value(2)

    expect(SafeCacheModule.consumeBudget(firstHour)).to.equal(true)
    expect(SafeCacheModule.consumeBudget(firstHour + 1)).to.equal(true)
    expect(SafeCacheModule.consumeBudget(firstHour + 2)).to.equal(false)
    expect(loggerWarn.calledOnce).to.equal(true)

    expect(SafeCacheModule.consumeBudget(firstHour + 60 * 60 * 1000)).to.equal(true)
  })
})
