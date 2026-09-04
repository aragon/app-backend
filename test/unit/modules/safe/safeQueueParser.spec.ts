import { highestQueuedNonce, parseQueuePage, parseTransaction } from '@modules/safe/safeQueueParser'
import { expect } from 'chai'

const ADDRESS = '0x1111111111111111111111111111111111111111'
const TRANSACTION = {
  safeTxHash: '0x' + 'a'.repeat(64),
  nonce: 12,
  proposer: ADDRESS,
  to: ADDRESS,
  value: '0',
  data: null,
  operation: 0,
  safeTxGas: '0',
  baseGas: '0',
  gasPrice: '0',
  gasToken: ADDRESS,
  refundReceiver: ADDRESS,
  confirmations: [
    {
      owner: ADDRESS,
      signature: '0x' + 'b'.repeat(130),
      signatureType: 'EOA',
      submissionDate: '2026-08-26T12:00:00.000Z',
    },
  ],
  confirmationsRequired: 1,
  signatures: null,
  isExecuted: false,
  isSuccessful: null,
  submissionDate: '2026-08-26T12:00:00.000Z',
}

describe('Safe queue parser', () => {
  it('renames proposer and preserves a decimal nonce string', () => {
    const transaction = parseTransaction(TRANSACTION)

    expect(transaction).to.not.equal(null)
    expect(transaction?.from).to.equal(ADDRESS)
    expect(transaction?.nonce).to.equal('12')
  })

  it('rejects a queue page when a transaction field is malformed', () => {
    const page = parseQueuePage({ count: 1, next: null, previous: null, results: [{ ...TRANSACTION, operation: 2 }] })

    expect(page).to.equal(null)
  })

  it('rejects a numeric nonce that JavaScript could already have rounded', () => {
    expect(parseTransaction({ ...TRANSACTION, nonce: Number.MAX_SAFE_INTEGER + 1 })).to.equal(null)
  })

  it('rejects an upstream transaction with an invalid address', () => {
    expect(parseTransaction({ ...TRANSACTION, to: 'not-an-address' })).to.equal(null)
  })

  it('rejects malformed pagination envelopes', () => {
    expect(parseQueuePage(null)).to.equal(null)
    expect(parseQueuePage({ count: '1', next: null, previous: null, results: [] })).to.equal(null)
    expect(parseQueuePage({ count: 0, next: 1, previous: null, results: [] })).to.equal(null)
    expect(parseQueuePage({ count: 0, next: null, previous: 1, results: [] })).to.equal(null)
    expect(parseQueuePage({ count: 0, next: null, previous: null, results: {} })).to.equal(null)
  })

  it('rejects malformed transaction payload fields', () => {
    expect(parseTransaction(null)).to.equal(null)
    expect(parseTransaction({ ...TRANSACTION, nonce: 'not-a-number' })).to.equal(null)
    expect(parseTransaction({ ...TRANSACTION, nonce: (1n << 256n).toString() })).to.equal(null)
    expect(parseTransaction({ ...TRANSACTION, to: 1 })).to.equal(null)
    expect(parseTransaction({ ...TRANSACTION, safeTxHash: 1 })).to.equal(null)
    expect(parseTransaction({ ...TRANSACTION, proposer: 1 })).to.equal(null)
    expect(parseTransaction({ ...TRANSACTION, proposer: 'not-an-address' })).to.equal(null)
    expect(parseTransaction({ ...TRANSACTION, data: 1 })).to.equal(null)
    expect(parseTransaction({ ...TRANSACTION, isExecuted: 1 })).to.equal(null)
    expect(parseTransaction({ ...TRANSACTION, isSuccessful: 1 })).to.equal(null)
    expect(parseTransaction({ ...TRANSACTION, signatures: 1 })).to.equal(null)
    expect(parseTransaction({ ...TRANSACTION, confirmationsRequired: 1.5 })).to.equal(null)
    expect(parseTransaction({ ...TRANSACTION, confirmationsRequired: 0 })).to.equal(null)
    expect(parseTransaction({ ...TRANSACTION, safeTxGas: 'not-a-number' })).to.equal(null)
    expect(parseTransaction({ ...TRANSACTION, confirmations: {} })).to.equal(null)
    expect(parseTransaction({ ...TRANSACTION, confirmations: [null] })).to.equal(null)
    expect(
      parseTransaction({ ...TRANSACTION, confirmations: [{ ...TRANSACTION.confirmations[0], signature: 1 }] }),
    ).to.equal(null)
    expect(
      parseTransaction({ ...TRANSACTION, confirmations: [{ ...TRANSACTION.confirmations[0], signatureType: 1 }] }),
    ).to.equal(null)
  })

  it('computes the highest queued nonce with bigint precision', () => {
    const low = parseTransaction({ ...TRANSACTION, nonce: '9007199254740993' })
    const high = parseTransaction({ ...TRANSACTION, nonce: '9007199254740995' })

    expect(low).to.not.equal(null)
    expect(high).to.not.equal(null)
    expect(highestQueuedNonce([low!, high!])).to.equal(9007199254740995n)
  })
})
