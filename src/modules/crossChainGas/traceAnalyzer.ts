/**
 * Reads the verdict out of a Tenderly trace.
 *
 * The reason this file exists: `CrossChainController.receiveMessage` wraps the payload in a
 * `try/catch` and returns normally when the payload runs out of gas, so the *transaction* status
 * says nothing about whether the actions ran. Only the emitted events do.
 */

import {
  ICrossChainDeliveryVerdict,
  type ICrossChainGasAction,
  type ITenderlyCallTrace,
  type ITenderlyLog,
} from '@types'
import { AbiCoder, toUtf8String } from 'ethers'

const abiCoder = AbiCoder.defaultAbiCoder()

/** The two events that decide success/failure. Matched on `topics[0]`. */
export const MESSAGE_RECEIVED_TOPIC = '0x86cbb706b494d96ee957155be312a2d5eeec8298926cf4e1879e4e95ea191546'
export const MESSAGE_EXECUTION_FAILED_TOPIC = '0xf8d420c7240d239df393d7c47d3386fa86ba14eb57ffe10a3b43732d4e0df3cd'

/** Standard revert payload selectors. */
const ERROR_STRING_SELECTOR = '0x08c379a0'
const PANIC_SELECTOR = '0x4e487b71'

/** Custom errors from our own contracts. A delivery failing with one of these is a configuration
 * problem, not a user-action problem. */
const KNOWN_CUSTOM_ERRORS: Record<string, string> = {
  '0x82de18ba': 'REMOTE_NOT_TRUSTED()',
  '0x05e1ad0f': 'CALLER_NOT_CCIP_ROUTER()',
  '0xaa2d482e': 'CALLER_NOT_LOCAL_ADAPTER(address)',
  '0xadbcad4f': 'INCORRECT_CHAIN_MISMATCH()',
  '0x61add745': 'MESSAGE_ALREADY_DELIVERED_OR_EXECUTED(bytes32)',
  '0x726d8a81': 'INSUFFICIENT_GAS(uint256,uint256)',
  '0x9c0830ca': 'ADAPTER_NOT_CONFIGURED(uint256)',
  '0x38689556': 'UNKNOWN_CHAIN_ID(uint256)',
}

const CrossChainTraceAnalyzer = {
  MESSAGE_RECEIVED_TOPIC,
  MESSAGE_EXECUTION_FAILED_TOPIC,

  /**
   * Which branch of the `try/catch` ran.
   *
   * Matching is on `raw.topics[0]`, never on the decoded log name: decoded names are only present
   * when Tenderly holds the contract ABI, which cannot be depended on.
   */
  readVerdict(logs: ITenderlyLog[] | undefined): {
    verdict: ICrossChainDeliveryVerdict
    failureLog?: ITenderlyLog
  } {
    const entries = logs ?? []

    const received = entries.find(log => log.raw?.topics?.[0]?.toLowerCase() === MESSAGE_RECEIVED_TOPIC)
    if (received) return { verdict: ICrossChainDeliveryVerdict.EXECUTED }

    const failed = entries.find(log => log.raw?.topics?.[0]?.toLowerCase() === MESSAGE_EXECUTION_FAILED_TOPIC)
    if (failed) return { verdict: ICrossChainDeliveryVerdict.FAILED, failureLog: failed }

    return { verdict: ICrossChainDeliveryVerdict.NOT_DELIVERED }
  },

  /**
   * The non-indexed parameters of `MessageExecutionFailed` are `abi.encode(bytes transaction,
   * bytes reason)`; the reason is the second element.
   */
  extractRevertData(failureLog: ITenderlyLog | undefined): string | undefined {
    const data = failureLog?.raw?.data
    if (!data || data === '0x') return undefined

    try {
      const [, reason] = abiCoder.decode(['bytes', 'bytes'], data)
      return reason as string
    } catch {
      return undefined
    }
  },

  /**
   * The revert reason of the outermost frame, for a delivery that never reached the controller.
   *
   * The adapter's own preconditions (`REMOTE_NOT_TRUSTED`, `CALLER_NOT_CCIP_ROUTER`,
   * `INCORRECT_CHAIN_MISMATCH`) revert here, so this is what tells an operator whether the lane is
   * half-configured or the payload is wrong. Returns undefined when the trace carries no payload
   * to decode - the caller must cope without it.
   */
  readTopLevelRevertReason(callTrace: ITenderlyCallTrace | undefined): string | undefined {
    if (!callTrace?.error && !callTrace?.error_reason) return undefined

    const output = callTrace.output
    if (output && output !== '0x') {
      return CrossChainTraceAnalyzer.decodeRevertReason(output)
    }

    return callTrace.error_reason || callTrace.error || undefined
  },

  /** Turn a raw revert payload into something a human can act on. */
  decodeRevertReason(revertData: string | undefined): string {
    if (!revertData || revertData === '0x') {
      return 'Reverted without a reason'
    }

    const selector = revertData.slice(0, 10).toLowerCase()
    const body = `0x${revertData.slice(10)}`

    if (selector === ERROR_STRING_SELECTOR) {
      try {
        return abiCoder.decode(['string'], body)[0] as string
      } catch {
        try {
          return toUtf8String(body)
        } catch {
          return 'Reverted without a decodable reason'
        }
      }
    }

    if (selector === PANIC_SELECTOR) {
      try {
        const code = abiCoder.decode(['uint256'], body)[0] as bigint
        return `Panic(0x${code.toString(16)})`
      } catch {
        return 'Panic()'
      }
    }

    const known = KNOWN_CUSTOM_ERRORS[selector]
    if (known) {
      return known
    }

    return `Reverted with custom error ${selector}`
  },

  /**
   * Best effort: which action in the batch failed.
   *
   * The action calls are the frames the destination Executor makes, so they are collected in
   * depth-first order and the first errored one gives the index. The executor reverts the whole
   * batch on any failure, so there is no `Executed` event to read on this path.
   */
  findRevertedActionIndex(
    callTrace: ITenderlyCallTrace | undefined,
    executor: string | undefined,
    actions: ICrossChainGasAction[],
  ): number | undefined {
    if (!callTrace || !executor) return undefined

    const executorAddress = executor.toLowerCase()
    const frames: ITenderlyCallTrace[] = []

    const walk = (frame: ITenderlyCallTrace) => {
      if (frame.from?.toLowerCase() === executorAddress) {
        frames.push(frame)
      }
      for (const child of frame.calls ?? []) {
        walk(child)
      }
    }
    walk(callTrace)

    const index = frames.findIndex(frame => !!frame.error)
    if (index < 0 || index >= actions.length) return undefined

    // Only trust the index if the frame really is the action we think it is.
    const target = actions[index]?.to?.toLowerCase()
    if (target && frames[index].to?.toLowerCase() !== target) return undefined

    return index
  },
}

export default CrossChainTraceAnalyzer
