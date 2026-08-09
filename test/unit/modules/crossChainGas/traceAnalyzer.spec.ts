import CrossChainTraceAnalyzer, {
  MESSAGE_EXECUTION_FAILED_TOPIC,
  MESSAGE_RECEIVED_TOPIC,
} from '@modules/crossChainGas/traceAnalyzer'
import { ICrossChainDeliveryVerdict } from '@types'
import { expect } from 'chai'
import { AbiCoder, id } from 'ethers'

const abiCoder = AbiCoder.defaultAbiCoder()

const CONTROLLER = '0x5555555555555555555555555555555555555555'
const EXECUTOR = '0x6666666666666666666666666666666666666666'
const TARGET_A = '0x7777777777777777777777777777777777777777'
const TARGET_B = '0x8888888888888888888888888888888888888888'

describe('Module: crossChainGas/traceAnalyzer', () => {
  describe('event topics', () => {
    it('matches the deployed event signatures', () => {
      expect(MESSAGE_RECEIVED_TOPIC).to.equal(id('MessageReceived(uint256,uint256,bytes32,bytes)'))
      expect(MESSAGE_EXECUTION_FAILED_TOPIC).to.equal(id('MessageExecutionFailed(uint256,uint256,bytes32,bytes,bytes)'))
    })
  })

  describe('readVerdict', () => {
    it('reads MessageReceived as "the actions ran"', () => {
      const { verdict } = CrossChainTraceAnalyzer.readVerdict(
        [{ raw: { address: CONTROLLER, topics: [MESSAGE_RECEIVED_TOPIC] } }],
        CONTROLLER,
      )

      expect(verdict).to.equal(ICrossChainDeliveryVerdict.EXECUTED)
    })

    it('reads MessageExecutionFailed as "the actions did NOT run"', () => {
      const { verdict, failureLog } = CrossChainTraceAnalyzer.readVerdict(
        [
          { raw: { address: TARGET_A, topics: [id('Transfer(address,address,uint256)')] } },
          { raw: { address: CONTROLLER, topics: [MESSAGE_EXECUTION_FAILED_TOPIC], data: '0x' } },
        ],
        CONTROLLER,
      )

      expect(verdict).to.equal(ICrossChainDeliveryVerdict.FAILED)
      expect(failureLog).to.not.be.undefined
    })

    it('prefers MessageReceived when both somehow appear', () => {
      const { verdict } = CrossChainTraceAnalyzer.readVerdict(
        [
          { raw: { address: CONTROLLER, topics: [MESSAGE_EXECUTION_FAILED_TOPIC] } },
          { raw: { address: CONTROLLER, topics: [MESSAGE_RECEIVED_TOPIC] } },
        ],
        CONTROLLER,
      )

      expect(verdict).to.equal(ICrossChainDeliveryVerdict.EXECUTED)
    })

    it('reports "never delivered" when neither event is present', () => {
      expect(CrossChainTraceAnalyzer.readVerdict([], CONTROLLER).verdict).to.equal(
        ICrossChainDeliveryVerdict.NOT_DELIVERED,
      )
      expect(CrossChainTraceAnalyzer.readVerdict(undefined, CONTROLLER).verdict).to.equal(
        ICrossChainDeliveryVerdict.NOT_DELIVERED,
      )
    })

    it('matches on raw topics, not on a decoded name Tenderly may not have', () => {
      const { verdict } = CrossChainTraceAnalyzer.readVerdict(
        [{ name: 'MessageReceived', address: CONTROLLER, raw: { topics: [id('SomethingElse()')] } }],
        CONTROLLER,
      )

      expect(verdict).to.equal(ICrossChainDeliveryVerdict.NOT_DELIVERED)
    })

    it('ignores the same event coming from an action, not from the controller', () => {
      // An action can emit whatever it likes in the same transaction. Only the controller decides
      // the verdict, so a look-alike from a target must not read as a delivery.
      const { verdict } = CrossChainTraceAnalyzer.readVerdict(
        [
          { raw: { address: TARGET_A, topics: [MESSAGE_RECEIVED_TOPIC] } },
          { raw: { address: CONTROLLER, topics: [MESSAGE_EXECUTION_FAILED_TOPIC], data: '0x' } },
        ],
        CONTROLLER,
      )

      expect(verdict).to.equal(ICrossChainDeliveryVerdict.FAILED)
    })

    it('compares addresses without caring about the casing', () => {
      const { verdict } = CrossChainTraceAnalyzer.readVerdict(
        [{ raw: { address: CONTROLLER.toUpperCase().replace('0X', '0x'), topics: [MESSAGE_RECEIVED_TOPIC] } }],
        CONTROLLER,
      )

      expect(verdict).to.equal(ICrossChainDeliveryVerdict.EXECUTED)
    })

    it('reports "never delivered" when the controller is unknown', () => {
      const { verdict } = CrossChainTraceAnalyzer.readVerdict(
        [{ raw: { address: CONTROLLER, topics: [MESSAGE_RECEIVED_TOPIC] } }],
        undefined,
      )

      expect(verdict).to.equal(ICrossChainDeliveryVerdict.NOT_DELIVERED)
    })
  })

  describe('extractRevertData', () => {
    it('takes the second element of abi.encode(bytes transaction, bytes reason)', () => {
      const reason = '0xdeadbeef'
      const log = { raw: { data: abiCoder.encode(['bytes', 'bytes'], ['0xaabb', reason]) } }

      expect(CrossChainTraceAnalyzer.extractRevertData(log)).to.equal(reason)
    })

    it('returns undefined for missing or undecodable data', () => {
      expect(CrossChainTraceAnalyzer.extractRevertData(undefined)).to.be.undefined
      expect(CrossChainTraceAnalyzer.extractRevertData({ raw: { data: '0x' } })).to.be.undefined
      expect(CrossChainTraceAnalyzer.extractRevertData({ raw: { data: '0x1234' } })).to.be.undefined
    })
  })

  describe('readTopLevelRevertReason', () => {
    it('decodes the adapter custom error that rejected the delivery', () => {
      const trace = { from: '0xa', to: '0xb', error: 'execution reverted', output: '0x82de18ba' }

      expect(CrossChainTraceAnalyzer.readTopLevelRevertReason(trace)).to.equal('REMOTE_NOT_TRUSTED()')
    })

    it("falls back to Tenderly's own rendering when there is no revert payload", () => {
      const trace = { from: '0xa', to: '0xb', error: 'execution reverted', error_reason: 'out of gas', output: '0x' }

      expect(CrossChainTraceAnalyzer.readTopLevelRevertReason(trace)).to.equal('out of gas')
    })

    it('returns undefined for a frame that did not fail', () => {
      expect(CrossChainTraceAnalyzer.readTopLevelRevertReason(undefined)).to.be.undefined
      expect(CrossChainTraceAnalyzer.readTopLevelRevertReason({ from: '0xa', to: '0xb' })).to.be.undefined
    })
  })

  describe('decodeRevertReason', () => {
    it('decodes Error(string)', () => {
      const data = `0x08c379a0${abiCoder.encode(['string'], ['insufficient balance']).slice(2)}`

      expect(CrossChainTraceAnalyzer.decodeRevertReason(data)).to.equal('insufficient balance')
    })

    it('decodes Panic(uint256)', () => {
      const data = `0x4e487b71${abiCoder.encode(['uint256'], [0x11]).slice(2)}`

      expect(CrossChainTraceAnalyzer.decodeRevertReason(data)).to.equal('Panic(0x11)')
    })

    it('names our own custom errors, which mean a configuration problem', () => {
      expect(CrossChainTraceAnalyzer.decodeRevertReason('0x82de18ba')).to.equal('REMOTE_NOT_TRUSTED()')
      expect(CrossChainTraceAnalyzer.decodeRevertReason('0x05e1ad0f')).to.equal('CALLER_NOT_CCIP_ROUTER()')
      expect(CrossChainTraceAnalyzer.decodeRevertReason('0x61add745')).to.equal(
        'MESSAGE_ALREADY_DELIVERED_OR_EXECUTED(bytes32)',
      )
    })

    it('reports an unknown custom error by selector', () => {
      expect(CrossChainTraceAnalyzer.decodeRevertReason('0x12345678')).to.equal('Reverted with custom error 0x12345678')
    })

    it('says so plainly when there is no reason at all', () => {
      expect(CrossChainTraceAnalyzer.decodeRevertReason(undefined)).to.equal('Reverted without a reason')
      expect(CrossChainTraceAnalyzer.decodeRevertReason('0x')).to.equal('Reverted without a reason')
    })
  })

  describe('findRevertedActionIndex', () => {
    const actions = [
      { to: TARGET_A, value: '0', data: '0x' },
      { to: TARGET_B, value: '0', data: '0x' },
    ]

    const trace = (calls: any[]) => ({
      from: '0x0000000000000000000000000000000000000001',
      to: '0x0000000000000000000000000000000000000002',
      calls: [{ from: '0x0000000000000000000000000000000000000003', to: EXECUTOR, calls }],
    })

    it('finds the position of the failing call among the executor frames', () => {
      const callTrace = trace([
        { from: EXECUTOR, to: TARGET_A },
        { from: EXECUTOR, to: TARGET_B, error: 'execution reverted' },
      ])

      expect(CrossChainTraceAnalyzer.findRevertedActionIndex(callTrace, EXECUTOR, actions)).to.equal(1)
    })

    it('returns undefined when nothing failed', () => {
      const callTrace = trace([
        { from: EXECUTOR, to: TARGET_A },
        { from: EXECUTOR, to: TARGET_B },
      ])

      expect(CrossChainTraceAnalyzer.findRevertedActionIndex(callTrace, EXECUTOR, actions)).to.be.undefined
    })

    it('does not guess when the frame does not match the action it would be blamed on', () => {
      const callTrace = trace([{ from: EXECUTOR, to: '0x9999999999999999999999999999999999999999', error: 'boom' }])

      expect(CrossChainTraceAnalyzer.findRevertedActionIndex(callTrace, EXECUTOR, actions)).to.be.undefined
    })

    it('returns undefined without a trace or without a known executor', () => {
      expect(CrossChainTraceAnalyzer.findRevertedActionIndex(undefined, EXECUTOR, actions)).to.be.undefined
      expect(CrossChainTraceAnalyzer.findRevertedActionIndex(trace([]), undefined, actions)).to.be.undefined
    })
  })
})
