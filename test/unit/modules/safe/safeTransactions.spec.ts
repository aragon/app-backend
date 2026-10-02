import { Models } from '@dbModels'
import DecodeActions from '@helpers/decodeAction'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
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

    it('should checksum the target of a batched call, the way the decoder looks it up', async () => {
      // Packed calldata carries the address as bare lowercase hex. The decoder finds plugins, DAOs and
      // members by exact match, so a lowercase `to` on the action would miss every one of them.
      const MULTISEND = '0x3333333333333333333333333333333333333333' as HexAddress
      const call = (target: string, data: string) =>
        `00${target.slice(2).toLowerCase()}${'0'.repeat(64)}${((data.length - 2) / 2).toString(16).padStart(64, '0')}${data.slice(2)}`
      const packed = call(SAFE, '0xdeadbeef')
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

      expect(row?.rawActions.map(action => action.to)).to.deep.equal([SAFE])
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

    it('lists newest first and says where the next page starts', async () => {
      const now = Date.now()
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], now)
      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [transaction('6', 'b', { submissionDate: '2026-09-21T12:00:00.000Z' })],
        now + 60_000,
      )

      const page = await SafeTransactionsModule.list(NETWORK, SAFE, { limit: 1, offset: 0 })

      expect(page.results[0].nonce).to.equal('6')
      expect(page.next).to.equal('1')
      expect(page.previous).to.be.null
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

    it('drops the execution fields from a queued row', async () => {
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], Date.now())
      // A stray execution field on a live row must not reach the wire.
      await Models.SafeTransaction.updateOne(
        { network: NETWORK, safeAddress: SAFE },
        { $set: { executionDate: '2026-09-20T13:00:00.000Z', transactionHash: `0x${'e'.repeat(64)}` } },
      )

      const page = await SafeTransactionsModule.list(NETWORK, SAFE, { limit: 10, offset: 0 })

      expect(page.results[0]).to.not.have.any.keys('executionDate', 'transactionHash')
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

      expect(await SafeTransactionsModule.reconcileQueue(NETWORK, SAFE, [], fetchedAt, true)).to.equal(1)

      const visible = await SafeTransactionsModule.list(NETWORK, SAFE, { limit: 20, offset: 0 })
      const removed = await SafeTransactionsModule.list(NETWORK, SAFE, {
        limit: 20,
        offset: 0,
        state: ISafeTransactionState.removed,
      })
      expect(visible.count).to.equal(0)
      expect(removed.count).to.equal(1)
    })

    it('marks nothing on an incomplete first page', async () => {
      const fetchedAt = Date.now()
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], fetchedAt - 1000)

      expect(await SafeTransactionsModule.reconcileQueue(NETWORK, SAFE, [], fetchedAt, false)).to.equal(0)
      expect((await Models.SafeTransaction.findOne({ safeTxHash: `0x${'a'.repeat(64)}` }))?.state).to.equal(
        ISafeTransactionState.live,
      )
    })

    it('lets an offchain-removed transaction become executed later', async () => {
      const fetchedAt = Date.now()
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], fetchedAt - 1000)
      await SafeTransactionsModule.reconcileQueue(NETWORK, SAFE, [], fetchedAt, true)

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
    let getProvider: sinon.SinonStub

    beforeEach(() => {
      sandbox = sinon.createSandbox()
      getProvider = sandbox
        .stub(ProviderModule, 'getAnyRpcProvider')
        .returns({ getBlockNumber: async () => 999 } as any)
      decodeTransfer = sandbox.stub(DecodeActions.prototype, 'decodeTransfer').resolves({ type: 'TransferNative' })
      decodeData = sandbox.stub(DecodeActions.prototype, 'decodeData').resolves({ type: 'Unknown' } as any)
      // The decoder logs a warn for an action it cannot read; keep it out of the test output.
      sandbox.stub(logger, 'warn')
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

    it('does not redo the decode of an already decoded row', async () => {
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], Date.now())
      const id = await rowId()
      await SafeTransactionsModule.decode(id)
      const decoded = await Models.SafeTransaction.findOne({ id })
      getProvider.resetHistory()
      decodeTransfer.resetHistory()
      decodeData.resetHistory()

      await SafeTransactionsModule.decode(id)

      expect(getProvider.called).to.equal(false)
      expect(decodeTransfer.called).to.equal(false)
      expect(decodeData.called).to.equal(false)
      const row = await Models.SafeTransaction.findOne({ id })
      expect(row?.actions).to.deep.equal(decoded?.actions)
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
        throwOnError: true,
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

    it('rejects and keeps the row decoding when an action cannot be read', async () => {
      // The Safe decode passes throwOnError, so a failed action retries rather than storing Unknown.
      decodeData.resolves({ type: 'FunctionCall' })
      decodeTransfer.rejects(new Error('no abi'))
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], Date.now())
      // One action the decoder reads (has calldata), one it throws on (a bare transfer).
      await Models.SafeTransaction.updateOne(
        { network: NETWORK, safeAddress: SAFE },
        {
          $set: {
            rawActions: [
              { to: DAO, value: '0', data: `0x${'ab'.repeat(8)}` },
              { to: DAO, value: '0', data: '0x' },
            ],
          },
        },
      )

      await expect(SafeTransactionsModule.decode(await rowId())).to.be.rejected

      const row = await Models.SafeTransaction.findOne({ network: NETWORK, safeAddress: SAFE })
      expect(row?.decoding).to.equal(true)
    })

    it('keeps the row owing its decode when the head block read fails', async () => {
      getProvider.returns({
        getBlockNumber: async () => {
          throw new Error('rpc down')
        },
      } as any)
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], Date.now())

      await expect(SafeTransactionsModule.decode(await rowId())).to.be.rejected

      const row = await Models.SafeTransaction.findOne({ network: NETWORK, safeAddress: SAFE })
      expect(row?.decoding).to.equal(true)
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

    it('keeps a row that executed between the nonce read and the settle write', async () => {
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a'), transaction('7', 'b')], Date.now())
      sandbox.stub(SafeChainReaderModule, 'readNonce').callsFake(async () => {
        await SafeTransactionsModule.markExecuted(NETWORK, SAFE, `0x${'a'.repeat(64)}`, {
          transactionHash: `0x${'e'.repeat(64)}`,
          blockNumber: 900,
          succeeded: true,
        })
        return '7'
      })

      const settled = await SafeTransactionsModule.settleBelowNonce(NETWORK, SAFE)

      expect(settled).to.equal(0)
      expect((await Models.SafeTransaction.findOne({ safeTxHash: `0x${'a'.repeat(64)}` }))?.state).to.equal(
        ISafeTransactionState.executed,
      )
    })

    it('should not read the chain when nothing is live', async () => {
      const nonce = sandbox.stub(SafeChainReaderModule, 'readNonce')

      await SafeTransactionsModule.settleBelowNonce(NETWORK, SAFE)

      expect(nonce.called).to.be.false
    })

    it('should retire a removed row once the chain nonce has passed it', async () => {
      // Deleted offchain, and now its nonce is spent: nothing can execute it any more.
      const fetchedAt = Date.now()
      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [transaction('5', 'a'), transaction('7', 'b')],
        fetchedAt - 1000,
      )
      await SafeTransactionsModule.reconcileQueue(NETWORK, SAFE, [], fetchedAt, true)
      sandbox.stub(SafeChainReaderModule, 'readNonce').resolves('7')

      const settled = await SafeTransactionsModule.settleBelowNonce(NETWORK, SAFE)

      const states = await Models.SafeTransaction.find({ network: NETWORK, safeAddress: SAFE })
        .sort({ nonce: 1 })
        .lean()
      expect(settled).to.equal(1)
      expect(states.map(row => row.state)).to.deep.equal([
        ISafeTransactionState.superseded,
        ISafeTransactionState.removed,
      ])
    })
  })

  describe('record', () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
      sandbox = sinon.createSandbox()
      sandbox.stub(SafeChainReaderModule, 'readNonce').resolves('5')
    })
    afterEach(() => sandbox.restore())

    it('should store the page it was handed and queue its decodes', async () => {
      const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await SafeTransactionsModule.record(NETWORK, SAFE, [transaction('5', 'a')], Date.now())

      const row = await Models.SafeTransaction.findOne({ network: NETWORK, safeAddress: SAFE })
      expect(row?.state).to.equal(ISafeTransactionState.live)
      expect(sendMessage.firstCall.args[0]).to.equal('safe.transaction.actions')
    })

    it('rejects when a page write fails so the sync job retries', async () => {
      // `record` lost its catch-all: a failed store must reach `safe.refresh`'s bounded retry,
      // otherwise a broken write never fires and the page is never stored.
      sandbox.stub(RabbitMQHelper, 'sendMessage').rejects(new Error('rabbit down'))

      await expect(SafeTransactionsModule.record(NETWORK, SAFE, [transaction('5', 'a')], Date.now())).to.be.rejected
    })
  })
})
