import { Models } from '@dbModels'
import DecodeActions from '@helpers/decodeAction'
import ProviderModule from '@modules/provider'
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
      const payload = `0x8d80ff0a${(32).toString(16).padStart(64, '0')}${(packed.length / 2)
        .toString(16)
        .padStart(64, '0')}${packed}`

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
  })

  describe('reconcile', () => {
    it('should supersede everything the Safe has moved past and keep the rest live', async () => {
      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [transaction('5', 'a'), transaction('6', 'b'), transaction('7', 'c')],
        Date.now(),
      )

      await SafeTransactionsModule.reconcile(NETWORK, SAFE, '6')

      const rows = await Models.SafeTransaction.find({ network: NETWORK, safeAddress: SAFE }).sort({ nonce: 1 })

      expect(rows.map(row => row.state)).to.deep.equal([
        ISafeTransactionState.superseded,
        ISafeTransactionState.live,
        ISafeTransactionState.live,
      ])
    })

    it('should compare nonces as numbers, not as text', async () => {
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('9', 'a'), transaction('10', 'b')], Date.now())

      await SafeTransactionsModule.reconcile(NETWORK, SAFE, '10')

      const nine = await Models.SafeTransaction.findOne({ network: NETWORK, safeAddress: SAFE, nonce: '9' })
      const ten = await Models.SafeTransaction.findOne({ network: NETWORK, safeAddress: SAFE, nonce: '10' })

      expect(nine?.state).to.equal(ISafeTransactionState.superseded)
      expect(ten?.state).to.equal(ISafeTransactionState.live)
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

    it('does not supersede a row that has already been settled', async () => {
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], Date.now())
      await SafeTransactionsModule.markExecuted(NETWORK, SAFE, `0x${'a'.repeat(64)}`, {
        transactionHash: `0x${'e'.repeat(64)}`,
        blockNumber: 900,
        succeeded: true,
      })

      // Reconciliation only knows the nonce moved on, not which transaction won.
      await SafeTransactionsModule.reconcile(NETWORK, SAFE, '6')

      const row = await Models.SafeTransaction.findOne({ network: NETWORK, safeTxHash: `0x${'a'.repeat(64)}` })

      expect(row?.state).to.equal(ISafeTransactionState.executed)
    })
  })

  describe('list', () => {
    it('finds a batched transaction by what it calls, not by its envelope', async () => {
      const MULTISEND = '0x3333333333333333333333333333333333333333' as HexAddress
      const call = (target: HexAddress, data: string) =>
        `00${target.slice(2)}${'0'.repeat(64)}${((data.length - 2) / 2).toString(16).padStart(64, '0')}${data.slice(2)}`
      const packed = call(DAO, '0xdeadbeef')
      const payload = `0x8d80ff0a${(32).toString(16).padStart(64, '0')}${(packed.length / 2)
        .toString(16)
        .padStart(64, '0')}${packed}`

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

    it('narrows to one state', async () => {
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a'), transaction('6', 'b')], Date.now())
      await SafeTransactionsModule.reconcile(NETWORK, SAFE, '6')

      const live = await SafeTransactionsModule.list(NETWORK, SAFE, {
        limit: 20,
        offset: 0,
        state: ISafeTransactionState.live,
      })

      expect(live.count).to.equal(1)
      expect(live.results[0].nonce).to.equal('6')
    })

    it('leaves superseded rows out unless they are asked for', async () => {
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a'), transaction('6', 'b')], Date.now())
      await SafeTransactionsModule.reconcile(NETWORK, SAFE, '6')

      const unfiltered = await SafeTransactionsModule.list(NETWORK, SAFE, { limit: 20, offset: 0 })
      const superseded = await SafeTransactionsModule.list(NETWORK, SAFE, {
        limit: 20,
        offset: 0,
        state: ISafeTransactionState.superseded,
      })

      expect(unfiltered.count).to.equal(1)
      expect(unfiltered.results[0].nonce).to.equal('6')
      expect(superseded.count).to.equal(1)
      expect(superseded.results[0].nonce).to.equal('5')
    })
  })

  describe('decodePending', () => {
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

    it('should decode the rows that owe one and leave nothing to do on a second pass', async () => {
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], Date.now())

      expect(await SafeTransactionsModule.decodePending(NETWORK, SAFE)).to.equal(1)

      const row = await Models.SafeTransaction.findOne({ network: NETWORK, safeAddress: SAFE })
      expect(row?.decoding).to.equal(false)
      expect(row?.actions).to.deep.equal([{ type: 'TransferNative' }])

      expect(await SafeTransactionsModule.decodePending(NETWORK, SAFE)).to.equal(0)
      expect(decodeTransfer.callCount).to.equal(1)
    })

    it('should read the Safe as the sender and the execution block when it has one', async () => {
      await SafeTransactionsModule.upsert(
        NETWORK,
        SAFE,
        [transaction('5', 'a', { data: `0x${'ab'.repeat(8)}` })],
        Date.now(),
      )
      await Models.SafeTransaction.updateOne({ network: NETWORK, safeAddress: SAFE }, { executionBlockNumber: 123 })

      await SafeTransactionsModule.decodePending(NETWORK, SAFE)

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

      await SafeTransactionsModule.decodePending(NETWORK, SAFE)

      expect(decodeData.firstCall.args[1].blockNumber).to.equal(999)
    })

    it('should keep the row for the next pass when the decode throws', async () => {
      decodeTransfer.rejects(new Error('no abi'))
      await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction('5', 'a')], Date.now())

      expect(await SafeTransactionsModule.decodePending(NETWORK, SAFE)).to.equal(0)

      const row = await Models.SafeTransaction.findOne({ network: NETWORK, safeAddress: SAFE })
      expect(row?.decoding).to.equal(true)
      expect(row?.actions).to.deep.equal([])
    })
  })

  describe('record', () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
      sandbox = sinon.createSandbox()
      sandbox.stub(SafeTransactionsModule, 'decodePending').resolves(0)
    })
    afterEach(() => sandbox.restore())

    it('should leave the rows alone when the nonce could not be read', async () => {
      await SafeTransactionsModule.record(NETWORK, SAFE, [transaction('5', 'a')], null, Date.now())

      const row = await Models.SafeTransaction.findOne({ network: NETWORK, safeAddress: SAFE })

      expect(row?.state).to.equal(ISafeTransactionState.live)
    })
  })
})
