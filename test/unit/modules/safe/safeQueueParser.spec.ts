import { lowestFreeNonce, parseQueuePage, parseTransaction } from '@modules/safe/safeQueueParser'
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

  it('keeps the executed-only fields and omits them while queued', () => {
    const executed = parseTransaction({
      ...TRANSACTION,
      isExecuted: true,
      isSuccessful: true,
      executionDate: '2026-08-26T12:00:00.000Z',
      transactionHash: `0x${'b'.repeat(64)}`,
    })

    expect(executed?.executionDate).to.equal('2026-08-26T12:00:00.000Z')
    expect(executed?.transactionHash).to.equal(`0x${'b'.repeat(64)}`)

    // Upstream sends both as null while queued; the field is omitted rather than shipped as a null
    // the client would have to guard.
    const queued = parseTransaction({ ...TRANSACTION, executionDate: null, transactionHash: null })

    expect(queued).to.not.equal(null)
    expect(queued).to.not.have.property('executionDate')
    expect(queued).to.not.have.property('transactionHash')
  })

  it('rejects malformed executed-only fields rather than dropping them', () => {
    expect(parseTransaction({ ...TRANSACTION, executionDate: 17 })).to.equal(null)
    expect(parseTransaction({ ...TRANSACTION, transactionHash: { hash: '0x' } })).to.equal(null)
  })

  it('fills the lowest hole at or above the current nonce', () => {
    const queued = (nonces: string[]) => nonces.map(nonce => parseTransaction({ ...TRANSACTION, nonce })!)

    // Current 41, queue holds 41/43/44: 42 executes ahead of 43 and displaces nothing.
    expect(lowestFreeNonce(queued(['41', '43', '44']), 41n)).to.equal(42n)
    // Gapless queue still allocates the tail.
    expect(lowestFreeNonce(queued(['41', '42', '43']), 41n)).to.equal(44n)
    // Empty queue allocates the current nonce.
    expect(lowestFreeNonce([], 41n)).to.equal(41n)
    // Multiple holes: the lowest wins.
    expect(lowestFreeNonce(queued(['41', '44']), 41n)).to.equal(42n)
    // A hole below the current nonce is dead, not free.
    expect(lowestFreeNonce(queued(['41', '42']), 41n)).to.equal(43n)
    expect(lowestFreeNonce(queued(['38', '41']), 41n)).to.equal(42n)
  })

  it('keeps nonce occupancy precise past the safe-integer boundary', () => {
    const low = parseTransaction({ ...TRANSACTION, nonce: '9007199254740993' })
    const high = parseTransaction({ ...TRANSACTION, nonce: '9007199254740994' })

    expect(low).to.not.equal(null)
    expect(high).to.not.equal(null)
    expect(lowestFreeNonce([low!, high!], 9007199254740993n)).to.equal(9007199254740995n)
  })
})
