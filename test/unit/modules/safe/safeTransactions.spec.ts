import { Models } from '@dbModels'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import { type HexAddress, type ISafeMultisigTransaction, ISafeTransactionState, NetworksEnum } from '@types'
import { expect } from 'chai'

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

  describe('record', () => {
    it('should leave the rows alone when the nonce could not be read', async () => {
      await SafeTransactionsModule.record(NETWORK, SAFE, [transaction('5', 'a')], null, Date.now())

      const row = await Models.SafeTransaction.findOne({ network: NETWORK, safeAddress: SAFE })

      expect(row?.state).to.equal(ISafeTransactionState.live)
    })
  })
})
