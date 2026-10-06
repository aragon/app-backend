import MultiSendModule from '@modules/safe/multiSend'
import { expect } from 'chai'
import { AbiCoder, concat, getAddress, id, toBeHex } from 'ethers'

const TARGET_A = '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526'
const TARGET_B = '0xc18021bF09671A21F474A8C059c987BA895bDBF7'

const coder = AbiCoder.defaultAbiCoder()

/** `operation(1) to(20) value(32) dataLength(32) data(n)` per inner call, packed with no padding. */
const packCall = (to: string, value: bigint, data: string) =>
  concat(['0x00', to, toBeHex(value, 32), toBeHex(data.length / 2 - 1, 32), data])

/** A `multiSend(bytes)` payload wrapping the packed calls, as the ABI encodes it. */
const multiSend = (packed: string) => concat([id('multiSend(bytes)').slice(0, 10), coder.encode(['bytes'], [packed])])

describe('Module: safe/multiSend', () => {
  it('splits the packed calls with a checksummed target, value and data', () => {
    const packed = concat([
      packCall(TARGET_A.toLowerCase(), 1_000_000n, '0xdeadbeef'),
      packCall(TARGET_B.toLowerCase(), 0n, '0xcafe'),
    ])

    const { calls, malformed } = MultiSendModule.split(multiSend(packed))

    expect(malformed).to.equal(false)
    expect(calls).to.deep.equal([
      { to: getAddress(TARGET_A), value: '1000000', data: '0xdeadbeef' },
      { to: getAddress(TARGET_B), value: '0', data: '0xcafe' },
    ])
  })

  it('marks a payload whose bytes do not ABI-decode as malformed', () => {
    // The selector is there but the trailing word is not a valid `bytes` encoding.
    const { calls, malformed } = MultiSendModule.split('0x8d80ff0a1234')

    expect(malformed).to.equal(true)
    expect(calls).to.deep.equal([])
  })

  it('stops at a truncated header, keeping the calls read so far', () => {
    // A whole call, then a few stray bytes that cannot hold another header.
    const packed = concat([packCall(TARGET_A.toLowerCase(), 0n, '0xdeadbeef'), '0x00112233'])

    const { calls, malformed } = MultiSendModule.split(multiSend(packed))

    expect(malformed).to.equal(true)
    expect(calls.map(call => call.to)).to.deep.equal([getAddress(TARGET_A)])
  })

  it('stops when a declared length runs past the end, keeping the calls read so far', () => {
    // A valid call, then a second header declaring more data than the payload carries.
    const overrunHeader = concat(['0x00', TARGET_B.toLowerCase(), toBeHex(0, 32), toBeHex(1000, 32)])
    const packed = concat([packCall(TARGET_A.toLowerCase(), 0n, '0xdeadbeef'), overrunHeader])

    const { calls, malformed } = MultiSendModule.split(multiSend(packed))

    expect(malformed).to.equal(true)
    expect(calls.map(call => call.to)).to.deep.equal([getAddress(TARGET_A)])
  })

  it('reads an empty payload as no calls, not malformed', () => {
    const { calls, malformed } = MultiSendModule.split(multiSend('0x'))

    expect(malformed).to.equal(false)
    expect(calls).to.deep.equal([])
  })
})
