import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import { ProxyToken } from '@modules/proxyToken'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import { LibUtils } from '@test/lib/unit-dep/lib'
import SafeFixture from '@test/lib/unit-dep/safe'
import { EnumQueueName, type IQueueSafeSync, ISafeTransactionState } from '@types'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

describe('Safe recovery', function () {
  this.retries(2)
  let sandbox: SinonSandbox
  let sent: Array<{ queue: EnumQueueName; payload: any }>

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
    sent = SafeFixture.stubSafeQueues(sandbox)
  })

  afterEach(() => sandbox.restore())

  it('stores an execution it never saw pending', async function () {
    this.timeout(300_000)
    const { network, safeAddress, executedTxHashes, executedBlocks } = SafeFixture
    await SafeFixture.replayRegistration()

    expect(await Models.SafeTransaction.countDocuments({ network, safeAddress })).to.equal(0)
    await LibUtils.handleEventsFromTxHashes([executedTxHashes[0]], network)

    const refreshes: IQueueSafeSync[] = []
    for (const message of sent) {
      if (message.queue === EnumQueueName.safeRefresh) refreshes.push(message.payload.params as IQueueSafeSync)
    }
    expect(refreshes).to.have.length(2)
    expect(refreshes[1]).to.include({
      network,
      address: safeAddress,
      historyPages: config.SAFE_API.BACKFILL_HISTORY_PAGES,
    })

    await SafeFixture.refresh(sandbox, refreshes[1].network, refreshes[1].address, refreshes[1].historyPages, 3)
    const query = { network, safeAddress, transactionHash: executedTxHashes[0] }
    const stored = await Models.SafeTransaction.find(query).lean()
    expect(stored).to.have.length(1)
    expect(stored[0].nonce).to.equal('0')
    expect(stored[0].state).to.equal(ISafeTransactionState.executed)
    expect(stored[0].executionBlockNumber ?? null).to.equal(null)

    await LibUtils.handleEventsFromTxHashes([executedTxHashes[0]], network)

    const settled = await Models.SafeTransaction.find(query).lean()
    expect(settled).to.have.length(1)
    expect(settled[0].executionBlockNumber).to.equal(executedBlocks[0])
    expect(settled[0].isSuccessful).to.equal(true)
    let refreshCount = 0
    for (const message of sent) {
      if (message.queue === EnumQueueName.safeRefresh) refreshCount += 1
    }
    expect(refreshCount).to.equal(2)
  })

  it('decodes a transaction after a failed first try', async function () {
    this.timeout(300_000)
    const { network, safeAddress, executedTxHashes } = SafeFixture
    expect(await ProxyToken.saveAndGetToken(ZeroAddress, network)).to.exist
    await SafeFixture.replayRegistration()

    const refreshes: IQueueSafeSync[] = []
    for (const message of sent) {
      if (message.queue === EnumQueueName.safeRefresh) refreshes.push(message.payload.params as IQueueSafeSync)
    }
    expect(refreshes).to.have.length(1)
    await SafeFixture.refresh(sandbox, refreshes[0].network, refreshes[0].address, refreshes[0].historyPages, 3)

    const query = { network, safeAddress, transactionHash: executedTxHashes[0] }
    const rows = await Models.SafeTransaction.find(query).lean()
    expect(rows).to.have.length(1)
    const row = rows[0]
    let decodeJobs = 0
    for (const message of sent) {
      if (message.queue === EnumQueueName.safeTransactionActions && message.payload.params.id === row.id)
        decodeJobs += 1
    }
    expect(decodeJobs).to.equal(1)

    const head = sandbox.stub(ProviderModule.getAnyRpcProvider(network), 'getBlockNumber').callThrough()
    head.onFirstCall().rejects(new Error('chain head unavailable'))
    try {
      await SafeTransactionsModule.decode(row.id)
      expect.fail('expected the first decode to fail')
    } catch (error) {
      expect((error as Error).message).to.equal('chain head unavailable')
    }
    const failed = await Models.SafeTransaction.findOne({ id: row.id }).lean()
    expect(failed?.decoding).to.equal(true)
    expect(failed?.actions).to.deep.equal([])

    await SafeTransactionsModule.decode(row.id)

    const decoded = await Models.SafeTransaction.findOne({ id: row.id }).lean()
    expect(head.callCount).to.be.at.least(2)
    expect(decoded?.decoding).to.equal(false)
    expect(decoded?.actions).to.have.length(1)
  })
})
