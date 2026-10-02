/**
 * Split a Safe `multiSend` payload into the calls packed inside it. One byte walk for both the
 * transaction store and the proposal-report correlation. `malformed` is set when the bytes do not
 * parse cleanly: the store falls back to the envelope, the reports keep the calls read so far.
 */

import { type IRawAction } from '@types'
import { AbiCoder, getAddress } from 'ethers'

/** `multiSend(bytes)` */
const SELECTOR = '0x8d80ff0a'
/** Per inner call: `operation(1) to(20) value(32) dataLength(32) data(n)`, packed with no padding. */
const CALL_HEADER = 170

const coder = AbiCoder.defaultAbiCoder()

const MultiSendModule = {
  SELECTOR,

  split(data: string): { calls: IRawAction[]; malformed: boolean } {
    const calls: IRawAction[] = []

    let payload: string
    try {
      ;[payload] = coder.decode(['bytes'], `0x${data.slice(SELECTOR.length)}`)
    } catch {
      return { calls, malformed: true }
    }

    const packed = payload.slice(2)
    let cursor = 0
    while (cursor < packed.length) {
      if (cursor + CALL_HEADER > packed.length) return { calls, malformed: true }
      const length = Number(BigInt(`0x${packed.slice(cursor + 106, cursor + CALL_HEADER)}`)) * 2
      const start = cursor + CALL_HEADER
      if (!Number.isSafeInteger(length) || start + length > packed.length) return { calls, malformed: true }

      calls.push({
        to: getAddress(`0x${packed.slice(cursor + 2, cursor + 42)}`),
        value: BigInt(`0x${packed.slice(cursor + 42, cursor + 106)}`).toString(),
        data: `0x${packed.slice(start, start + length)}`,
      })
      cursor = start + length
    }

    return { calls, malformed: false }
  },
}

export default MultiSendModule
