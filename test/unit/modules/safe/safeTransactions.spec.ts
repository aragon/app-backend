import { Models } from '@dbModels'
import DecodeActions from '@helpers/decodeAction'
import RabbitMQHelper from '@helpers/rabbitMQ'
import ProviderModule from '@modules/provider'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import { type HexAddress, type ISafeMultisigTransaction, ISafeTransactionState, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

const NETWORK = NetworksEnum.ethereumMainnet
const SAFE = '0xd84C233A7D1578021d21E39785439bEdDB165F3D' as HexAddress
const OWNER = '0x1111111111111111111111111111111111111111' as HexAddress
const DAO = '0x2222222222222222222222222222222222222222' as HexAddress

const transaction = (nonce: string, hashChar: string, overrides = {}): ISafeMultisigTransaction =>
  ({
    safeTxHash: `0x${hashChar.repeat(64)}`,
    nonce,
    from: OWNER,
    to: DAO,
    value: '0',
    data: '0x',
    operation: 0,
    safeTxGas: '0',
    baseGas: '0',
    gasPrice: '0',
    gasToken: OWNER,
    refundReceiver: OWNER,
    confirmations: [],
    confirmationsRequired: 2,
    signatures: null,
    isExecuted: false,
    isSuccessful: null,
    submissionDate: '2026-09-20T12:00:00.000Z',
    ...overrides,
  }) as ISafeMultisigTransaction

describe('Module: SafeTransactions', () => {
  describe('upsert', () => {
    it('should store a queue page as live rows', async () => {
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a'), transaction('6', 'b')], Date.now())

      const rows = await Models.SafeTransaction.find({ network: NETWORK, safeAddress: SAFE }).sort({ nonce: 1 })

      expect(rows.map(row => row.nonce)).to.deep.equal(['5', '6'])
      expect(rows[0].state).to.equal(ISafeTransactionState.live)
      expect(rows[0].targets).to.deep.equal([DAO])
    })

    it('should find the DAO inside a batched transaction', async () => {
      // One MultiSend carrying two calls: one to the DAO, one to an unrelated token. Without the
      // split, `to` is the MultiSend contract and the DAO does not appear anywhere on the row.
      const MULTISEND = '0x3333333333333333333333333333333333333333' as HexAddress
      const TOKEN = '0x4444444444444444444444444444444444444444' as HexAddress
      const call = (target: HexAddress, data: string) =>
        `00${target.slice(2)}${'0'.repeat(64)}${((data.length - 2) / 2).toString(16).padStart(64, '0')}${data.slice(2)}`
      const packed = `${call(DAO, '0xdeadbeef')}${call(TOKEN, '0xcafe')}`
      // Padded to a 32-byte word like real calldata, which strict ABI decoding requires.
      const payload = `0x8d80ff0a${(32).toString(16).padStart(64, '0')}${(packed.length / 2)
        .toString(16)
        .padStart(64, '0')}${packed}${'0'.repeat((64 - (packed.length % 64)) % 64)}`

      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [transaction('5', 'a', { to: MULTISEND, data: payload })],
        Date.now(),
      )

      const row = await Models.SafeTransaction.findOne({ network: NETWORK, safeAddress: SAFE })

      expect(row?.targets).to.deep.equal([DAO, TOKEN])
      expect(row?.rawActions.map(action => action.data)).to.deep.equal(['0xdeadbeef', '0xcafe'])
    })

    it('should not read calls the MultiSend payload does not declare', async () => {
      // Declares an empty payload, then carries a packed call after it. Walking whatever follows
      // the header would turn those trailing bytes into an action aimed at the DAO.
      const MULTISEND = '0x3333333333333333333333333333333333333333' as HexAddress
      const call = (target: HexAddress, data: string) =>
        `00${target.slice(2)}${'0'.repeat(64)}${((data.length - 2) / 2).toString(16).padStart(64, '0')}${data.slice(2)}`
      const payload = `0x8d80ff0a${(32).toString(16).padStart(64, '0')}${'0'.repeat(64)}${call(DAO, '0xdeadbeef')}`

      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [transaction('5', 'a', { to: MULTISEND, data: payload })],
        Date.now(),
      )

      const row = await Models.SafeTransaction.findOne({ network: NETWORK, safeAddress: SAFE })

      expect(row?.targets).to.deep.equal([MULTISEND])
    })

    it('should pick up confirmations collected since the last read', async () => {
      const now = Date.now()
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], now)
      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [
          transaction('5', 'a', {
            confirmations: [{ owner: OWNER, signature: '0xsig', submissionDate: '2026-09-20T13:00:00.000Z' }],
          }),
        ],
        now + 1000,
      )

      const rows = await Models.SafeTransaction.find({ network: NETWORK, safeAddress: SAFE })

      expect(rows).to.have.length(1)
      expect(rows[0].confirmations.map(confirmation => confirmation.owner)).to.deep.equal([OWNER])
    })

    it('should store an already executed transaction as executed', async () => {
      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [transaction('5', 'a', { isExecuted: true, isSuccessful: true, transactionHash: `0x${'c'.repeat(64)}` })],
        Date.now(),
      )

      const row = await Models.SafeTransaction.findOne({ network: NETWORK, safeAddress: SAFE })

      expect(row?.state).to.equal(ISafeTransactionState.executed)
    })

    it('should settle the rivals of a winner the history names, with no execution event', async () => {
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a'), transaction('5', 'b')], Date.now())

      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [transaction('5', 'a', { isExecuted: true, isSuccessful: true, transactionHash: `0x${'c'.repeat(64)}` })],
        Date.now(),
      )

      const rows = await Models.SafeTransaction.find({ network: NETWORK, safeAddress: SAFE }).sort({ safeTxHash: 1 })

      expect(rows.map(row => row.state)).to.deep.equal([
        ISafeTransactionState.executed,
        ISafeTransactionState.superseded,
      ])
    })
  })

  describe('keeping what the chain settled', () => {
    it('does not let a stale pending page erase the execution facts', async () => {
      const now = Date.now()
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], now)
      await SafeTransactionsModule.markExecuted(NETWORK, SAFE, `0x${'a'.repeat(64)}`, {
        transactionHash: `0x${'e'.repeat(64)}`,
        blockNumber: 900,
        blockTimestamp: 1700000000,
        succeeded: true,
      })

      // The queue still lists it as pending for a while after it executes.
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], now + 1000)

      const row = await Models.SafeTransaction.findOne({ network: NETWORK, safeTxHash: `0x${'a'.repeat(64)}` })

      expect(row?.state).to.equal(ISafeTransactionState.executed)
      expect(row?.transactionHash).to.equal(`0x${'e'.repeat(64)}`)
      expect(row?.isSuccessful).to.be.true
    })

    it('supersedes only the rivals of the transaction that executed', async () => {
      // Two rivals at nonce 5 and one behind them. Only an execution says which of the two won, so
      // it is the one thing that moves a row out of `live` without the service saying so.
      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [transaction('5', 'a'), transaction('5', 'b'), transaction('6', 'c')],
        Date.now(),
      )
      await SafeTransactionsModule.markExecuted(NETWORK, SAFE, `0x${'a'.repeat(64)}`, {
        transactionHash: `0x${'e'.repeat(64)}`,
        blockNumber: 900,
        succeeded: true,
      })

      const rows = await Models.SafeTransaction.find({ network: NETWORK, safeAddress: SAFE }).sort({ safeTxHash: 1 })

      expect(rows.map(row => row.state)).to.deep.equal([
        ISafeTransactionState.executed,
        ISafeTransactionState.superseded,
        ISafeTransactionState.live,
      ])
    })
  })

  describe('list', () => {
    it('finds a batched transaction by what it calls, not by its envelope', async () => {
      const MULTISEND = '0x3333333333333333333333333333333333333333' as HexAddress
      const call = (target: HexAddress, data: string) =>
        `00${target.slice(2)}${'0'.repeat(64)}${((data.length - 2) / 2).toString(16).padStart(64, '0')}${data.slice(2)}`
      const packed = call(DAO, '0xdeadbeef')
      // Padded to a 32-byte word like real calldata, which strict ABI decoding requires.
      const payload = `0x8d80ff0a${(32).toString(16).padStart(64, '0')}${(packed.length / 2)
        .toString(16)
        .padStart(64, '0')}${packed}${'0'.repeat((64 - (packed.length % 64)) % 64)}`

      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [transaction('5', 'a', { to: MULTISEND, data: payload })],
        Date.now(),
      )

      const byTarget = await SafeTransactionsModule.list(NETWORK, SAFE, { limit: 20, offset: 0, to: DAO })
      const byEnvelope = await SafeTransactionsModule.list(NETWORK, SAFE, { limit: 20, offset: 0, to: MULTISEND })

      expect(byTarget.count, 'the DAO inside the batch was not found').to.equal(1)
      // The MultiSend contract is the envelope's `to` and calls nothing itself, so it is not a target.
      expect(byEnvelope.count).to.equal(0)
    })

    it('reports how stale the page is and where the next one starts', async () => {
      const now = Date.now()
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], now)
      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [transaction('6', 'b', { submissionDate: '2026-09-21T12:00:00.000Z' })],
        now + 60_000,
      )

      const page = await SafeTransactionsModule.list(NETWORK, SAFE, { limit: 1, offset: 0 })

      // Newest first, and the page is only as current as its stalest row.
      expect(page.results[0].nonce).to.equal('6')
      expect(page.next).to.equal('1')
      expect(page.previous).to.be.null
      expect(page.refreshedAt).to.equal(new Date(now + 60_000).toISOString())
    })

    it('judges staleness on the live rows, not on executed ones that never change', async () => {
      const now = Date.now()
      // the executed row was last read an hour ago by a history refresh, the live one just now
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('4', 'a', { isExecuted: true })], now - 3_600_000)
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'b')], now)

      const mixed = await SafeTransactionsModule.list(NETWORK, SAFE, { limit: 10, offset: 0 })
      const executedOnly = await SafeTransactionsModule.list(NETWORK, SAFE, {
        limit: 10,
        offset: 0,
        state: ISafeTransactionState.executed,
      })

      expect(mixed.refreshedAt).to.equal(new Date(now).toISOString())
      expect(executedOnly.refreshedAt).to.equal(new Date(now - 3_600_000).toISOString())
    })

    it('answers in the shape the live read answers, plus state', async () => {
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], Date.now())

      const page = await SafeTransactionsModule.list(NETWORK, SAFE, { limit: 10, offset: 0 })
      const row = page.results[0] as unknown as Record<string, unknown>

      expect(row.state).to.equal(ISafeTransactionState.live)
      expect(row.isExecuted).to.equal(false)
      expect(row.signatures).to.be.null
      // the decode and the Mongo internals belong to the actions route and the store, not the wire
      expect(row).to.not.have.any.keys('_id', 'actions', 'rawActions', 'targets', 'decoding', 'refreshedAt')
    })

    it('narrows to one state', async () => {
      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [transaction('5', 'a'), transaction('5', 'b'), transaction('6', 'c')],
        Date.now(),
      )
      await SafeTransactionsModule.markExecuted(NETWORK, SAFE, `0x${'a'.repeat(64)}`, {
        transactionHash: `0x${'e'.repeat(64)}`,
        blockNumber: 900,
        succeeded: true,
      })

      const live = await SafeTransactionsModule.list(NETWORK, SAFE, {
        limit: 20,
        offset: 0,
        state: ISafeTransactionState.live,
      })

      expect(live.count).to.equal(1)
      expect(live.results[0].nonce).to.equal('6')
    })

    it('leaves superseded rows out unless they are asked for', async () => {
      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [transaction('5', 'a'), transaction('5', 'b'), transaction('6', 'c')],
        Date.now(),
      )
      await SafeTransactionsModule.markExecuted(NETWORK, SAFE, `0x${'a'.repeat(64)}`, {
        transactionHash: `0x${'e'.repeat(64)}`,
        blockNumber: 900,
        succeeded: true,
      })

      const unfiltered = await SafeTransactionsModule.list(NETWORK, SAFE, { limit: 20, offset: 0 })
      const superseded = await SafeTransactionsModule.list(NETWORK, SAFE, {
        limit: 20,
        offset: 0,
        state: ISafeTransactionState.superseded,
      })

      // The winner and the one still pending; the losing rival only when asked for.
      expect(unfiltered.count).to.equal(2)
      expect(superseded.count).to.equal(1)
      expect(superseded.results[0].safeTxHash).to.equal(`0x${'b'.repeat(64)}`)
    })
  })

  describe('reconcileQueue', () => {
    it('hides an offchain-deleted row only after a complete fresh queue page', async () => {
      const fetchedAt = Date.now()
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], fetchedAt - 1000)
      const lookup = sinon.stub().resolves(true)

      expect(await SafeTransactionsModule.reconcileQueue(NETWORK, SAFE, [], fetchedAt, true, lookup)).to.equal(1)

      const visible = await SafeTransactionsModule.list(NETWORK, SAFE, { limit: 20, offset: 0 })
      const removed = await SafeTransactionsModule.list(NETWORK, SAFE, {
        limit: 20,
        offset: 0,
        state: ISafeTransactionState.removed,
      })
      expect(visible.count).to.equal(0)
      expect(removed.count).to.equal(1)
      expect(lookup.notCalled).to.be.true
    })

    it('keeps a row found by hash beyond an incomplete first page', async () => {
      const fetchedAt = Date.now()
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], fetchedAt - 1000)
      const lookup = sinon.stub().resolves(true)

      expect(await SafeTransactionsModule.reconcileQueue(NETWORK, SAFE, [], fetchedAt, false, lookup)).to.equal(0)
      expect(lookup.calledOnceWithExactly(`0x${'a'.repeat(64)}`)).to.be.true
      expect((await Models.SafeTransaction.findOne({ safeTxHash: `0x${'a'.repeat(64)}` }))?.state).to.equal(
        ISafeTransactionState.live,
      )
    })

    it('lets an offchain-removed transaction become executed later', async () => {
      const fetchedAt = Date.now()
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], fetchedAt - 1000)
      await SafeTransactionsModule.reconcileQueue(NETWORK, SAFE, [], fetchedAt, true, async () => true)

      await SafeTransactionsModule.markExecuted(NETWORK, SAFE, `0x${'a'.repeat(64)}`, {
        transactionHash: `0x${'e'.repeat(64)}`,
        blockNumber: 900,
        succeeded: true,
      })

      expect((await Models.SafeTransaction.findOne({ safeTxHash: `0x${'a'.repeat(64)}` }))?.state).to.equal(
        ISafeTransactionState.executed,
      )
    })
  })

  describe('decode', () => {
    let sandbox: sinon.SinonSandbox
    let decodeTransfer: sinon.SinonStub
    let decodeData: sinon.SinonStub

    beforeEach(() => {
      sandbox = sinon.createSandbox()
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getBlockNumber: async () => 999 } as any)
      decodeTransfer = sandbox.stub(DecodeActions.prototype, 'decodeTransfer').resolves({ type: 'TransferNative' })
      decodeData = sandbox.stub(DecodeActions.prototype, 'decodeData').resolves({ type: 'Unknown' } as any)
    })
    afterEach(() => sandbox.restore())

    const rowId = async () => (await Models.SafeTransaction.findOne({ network: NETWORK, safeAddress: SAFE }))!.id

    it('should decode one row and clear its decoding flag', async () => {
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], Date.now())

      await SafeTransactionsModule.decode(await rowId())

      const row = await Models.SafeTransaction.findOne({ network: NETWORK, safeAddress: SAFE })
      expect(row?.decoding).to.equal(false)
      expect(row?.actions).to.deep.equal([{ type: 'TransferNative' }])
    })

    it('should read the Safe as the sender and the execution block when it has one', async () => {
      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [transaction('5', 'a', { data: `0x${'ab'.repeat(8)}` })],
        Date.now(),
      )
      await Models.SafeTransaction.updateOne({ network: NETWORK, safeAddress: SAFE }, { executionBlockNumber: 123 })

      await SafeTransactionsModule.decode(await rowId())

      expect(decodeData.firstCall.args[1]).to.deep.equal({
        network: NETWORK,
        daoAddress: SAFE,
        blockNumber: 123,
      })
    })

    it('should fall back to head for a transaction that has not executed', async () => {
      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [transaction('5', 'a', { data: `0x${'ab'.repeat(8)}` })],
        Date.now(),
      )

      await SafeTransactionsModule.decode(await rowId())

      expect(decodeData.firstCall.args[1].blockNumber).to.equal(999)
    })

    it('should leave the row owing a decode when the decode throws', async () => {
      decodeTransfer.rejects(new Error('no abi'))
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], Date.now())

      await expect(SafeTransactionsModule.decode(await rowId())).to.be.rejected

      const row = await Models.SafeTransaction.findOne({ network: NETWORK, safeAddress: SAFE })
      expect(row?.decoding).to.equal(true)
      expect(row?.actions).to.deep.equal([])
    })

    it('should queue a decode job for each row on the page that still owes one', async () => {
      const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a'), transaction('6', 'b')], Date.now())
      // one row decoded already, one written before `decoding` existed
      await Models.SafeTransaction.updateOne({ network: NETWORK, nonce: '5' }, { $set: { decoding: false } })
      await Models.SafeTransaction.updateOne({ network: NETWORK, nonce: '6' }, { $unset: { decoding: 1 } })

      await SafeTransactionsModule.queueDecodes(NETWORK, SAFE, [`0x${'a'.repeat(64)}`, `0x${'b'.repeat(64)}`])

      expect(sendMessage.calledOnce).to.equal(true)
      expect(sendMessage.firstCall.args[0]).to.equal('safe.transaction.actions')
      expect(sendMessage.firstCall.args[1].params.id).to.include(`0x${'b'.repeat(64)}`)
    })
  })

  describe('settleBelowNonce', () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
      sandbox = sinon.createSandbox()
    })
    afterEach(() => sandbox.restore())

    it('should retire live rows the chain nonce has moved past and leave the rest', async () => {
      // nonce 5 lost and its winner is past the history pages we read
      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [transaction('5', 'a'), transaction('7', 'b'), transaction('8', 'c')],
        Date.now(),
      )
      sandbox.stub(SafeChainReaderModule, 'readNonce').resolves('7')

      const settled = await SafeTransactionsModule.settleBelowNonce(NETWORK, SAFE)

      const states = await Models.SafeTransaction.find({ network: NETWORK, safeAddress: SAFE })
        .sort({ nonce: 1 })
        .lean()
      expect(settled).to.equal(1)
      expect(states.map(row => row.state)).to.deep.equal([
        ISafeTransactionState.superseded,
        ISafeTransactionState.live,
        ISafeTransactionState.live,
      ])
    })

    it('should not read the chain when nothing is live', async () => {
      const nonce = sandbox.stub(SafeChainReaderModule, 'readNonce')

      await SafeTransactionsModule.settleBelowNonce(NETWORK, SAFE)

      expect(nonce.called).to.be.false
    })
  })

  describe('record', () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
      sandbox = sinon.createSandbox()
      sandbox.stub(SafeChainReaderModule, 'readNonce').resolves('5')
    })
    afterEach(() => sandbox.restore())

    it('should store the page it was handed, hash lowercased, and queue its decodes', async () => {
      const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await SafeTransactionsModule.record(NETWORK, SAFE, [transaction('5', 'A')], Date.now())

      const row = await Models.SafeTransaction.findOne({ network: NETWORK, safeAddress: SAFE })
      expect(row?.state).to.equal(ISafeTransactionState.live)
      // the execution event carries the hash lowercase, so that is the form the row is keyed by
      expect(row?.safeTxHash).to.equal(`0x${'a'.repeat(64)}`)
      expect(sendMessage.firstCall.args[0]).to.equal('safe.transaction.actions')
    })
  })
})
