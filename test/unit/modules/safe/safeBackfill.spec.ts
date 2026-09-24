import config from '@config'
import logger from '@logger'
import SafeBackfillModule from '@modules/safe/safeBackfill'
import { SafeReadError } from '@modules/safe/safeError'
import SafeServiceModule from '@modules/safe/safeService'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import { ISafeErrorCode, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox, type SinonStub } from 'sinon'

const NETWORK = NetworksEnum.ethereumMainnet
const ADDRESS = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'

const page = (next: string | null, results: unknown[] = []) =>
  ({ count: results.length, next, previous: null, results, meta: { fetchedAt: '2026-09-20T12:00:00.000Z' } }) as never

describe('Module: SafeBackfill', () => {
  let sandbox: SinonSandbox
  let record: SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'warn')
    record = sandbox.stub(SafeTransactionsModule, 'record').resolves()
  })

  afterEach(() => sandbox.restore())

  it('stops as soon as the history runs out', async () => {
    sandbox.stub(SafeServiceModule, 'readQueue').resolves(page(null))
    const history = sandbox.stub(SafeServiceModule, 'readHistory').resolves(page(null))

    await SafeBackfillModule.run(NETWORK, ADDRESS)

    expect(history.calledOnce).to.be.true
  })

  it('records only the pages that came from the cache, a fetch already recorded its own', async () => {
    // the queue page was cached while the Safe was untracked; the history page is fetched fresh
    const queued = { safeTxHash: '0xa' }
    const fresh = {
      count: 1,
      next: null,
      previous: null,
      results: [{ safeTxHash: '0xb' }],
      meta: { fetchedAt: new Date(Date.now() + 1000).toISOString() },
    } as never
    const readQueue = sandbox.stub(SafeServiceModule, 'readQueue').resolves(page(null, [queued]))
    sandbox.stub(SafeServiceModule, 'readHistory').resolves(fresh)

    await SafeBackfillModule.run(NETWORK, ADDRESS)

    expect(readQueue.firstCall.args[4]).to.equal(true)
    expect(record.calledOnce).to.be.true
    expect(record.firstCall.args[2]).to.deep.equal([queued])
    expect(record.firstCall.args[3]).to.equal(Date.parse('2026-09-20T12:00:00.000Z'))
  })

  it('reads no further than the cap on a Safe with a long history', async () => {
    sandbox.stub(config.SAFE_API, 'BACKFILL_HISTORY_PAGES').value(3)
    sandbox.stub(SafeServiceModule, 'readQueue').resolves(page(null))
    // Upstream always says there is more, which is what a busy Safe looks like.
    const history = sandbox.stub(SafeServiceModule, 'readHistory').resolves(page('http://next'))

    await SafeBackfillModule.run(NETWORK, ADDRESS)

    expect(history.callCount).to.equal(3)
  })

  it('gives up rather than retrying into an exhausted budget', async () => {
    sandbox.stub(SafeServiceModule, 'readQueue').resolves(page(null))
    const history = sandbox
      .stub(SafeServiceModule, 'readHistory')
      .rejects(new SafeReadError(ISafeErrorCode.rateLimited, 'budget spent', 429))

    await SafeBackfillModule.run(NETWORK, ADDRESS)

    expect(history.calledOnce).to.be.true
  })

  it('reads nothing on a chain Safe does not serve', async () => {
    // Citrea is one of the chains this backend supports and Safe does not, so there is no service
    // to read and an empty history is the honest answer rather than a failure.
    const queue = sandbox.stub(SafeServiceModule, 'readQueue')

    await SafeBackfillModule.run(NetworksEnum.citreaMainnet, ADDRESS)

    expect(queue.called).to.be.false
  })
})
