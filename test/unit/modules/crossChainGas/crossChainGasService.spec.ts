import { clearCrossChainGasCache, estimateCrossChainGasLimit, SIMULATION_GAS_CEILING } from '@modules/crossChainGas'
import CrossChainLaneReader from '@modules/crossChainGas/laneReader'
import { MESSAGE_EXECUTION_FAILED_TOPIC, MESSAGE_RECEIVED_TOPIC } from '@modules/crossChainGas/traceAnalyzer'
import TenderlyModule from '@modules/tenderly'
import { ICrossChainGasStatus, type ICrossChainLane, NetworksEnum } from '@types'
import { expect } from 'chai'
import { AbiCoder, id } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const abiCoder = AbiCoder.defaultAbiCoder()

const CONTROLLER = '0x1111111111111111111111111111111111111111'
const REMOTE_ADAPTER = '0x2222222222222222222222222222222222222222'
const LOCAL_ADAPTER = '0x3333333333333333333333333333333333333333'
const DEST_CONTROLLER = '0x4444444444444444444444444444444444444444'
const CCIP_ROUTER = '0x5555555555555555555555555555555555555555'
const EXECUTOR = '0x6666666666666666666666666666666666666666'
const TARGET = '0x7777777777777777777777777777777777777777'
const OTHER_TARGET = '0x8888888888888888888888888888888888888888'

const RESERVE = 45_000n
const FRAME_GAS = 183_100

const ACTIONS = [{ to: TARGET, value: '0', data: '0x095ea7b3' }]

const lane = (overrides: Partial<ICrossChainLane> = {}): ICrossChainLane => ({
  originChainId: 1,
  destinationChainId: 8453,
  destinationNetwork: NetworksEnum.baseMainnet,
  localAdapter: LOCAL_ADAPTER,
  remoteAdapter: REMOTE_ADAPTER,
  ccipRouter: CCIP_ROUTER,
  destinationController: DEST_CONTROLLER,
  originChainSelector: 5009297550715157269n,
  minFailedMessageGas: RESERVE,
  executor: EXECUTOR,
  ...overrides,
})

const messageReceivedLog = () => ({
  raw: { address: DEST_CONTROLLER, topics: [MESSAGE_RECEIVED_TOPIC, '0x01', '0x02', '0x03'], data: '0x' },
})

const messageExecutionFailedLog = (reason: string) => ({
  raw: {
    address: DEST_CONTROLLER,
    topics: [MESSAGE_EXECUTION_FAILED_TOPIC, '0x01', '0x02', '0x03'],
    data: abiCoder.encode(['bytes', 'bytes'], ['0xdead', reason]),
  },
})

/**
 * A response shaped like the trap in §2: the transaction itself reports success and carries a
 * small whole-transaction `gas_used` (roughly what a binary search would settle on), while the
 * call trace holds the real frame consumption.
 */
const tenderlyResponse = (params: { logs: any[]; callTrace?: any }) => ({
  simulation: { id: 'sim-1' },
  transaction: {
    status: true,
    gas_used: 120_000,
    transaction_info: {
      logs: params.logs,
      call_trace: params.callTrace ?? { from: CCIP_ROUTER, to: REMOTE_ADAPTER, gas_used: FRAME_GAS, calls: [] },
    },
  },
})

describe('Module: crossChainGas/crossChainGasService', () => {
  let sandbox: SinonSandbox
  let simulateRaw: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    clearCrossChainGasCache()

    sandbox.stub(TenderlyModule, 'createShareableUrl').resolves('https://tenderly.co/shared/simulation/sim-1')
    sandbox.stub(CrossChainLaneReader, 'readLane').resolves(lane())
    simulateRaw = sandbox.stub(TenderlyModule, 'simulateRaw')
  })

  afterEach(() => {
    sandbox?.restore()
    clearCrossChainGasCache()
  })

  const estimate = (actions = ACTIONS) =>
    estimateCrossChainGasLimit(NetworksEnum.ethereumMainnet, CONTROLLER, 8453, actions)

  describe('the measurement', () => {
    it('measures the trace frame, not the transaction gas a binary search would settle on', async () => {
      simulateRaw.resolves(tenderlyResponse({ logs: [messageReceivedLog()] }))

      const result = await estimate()

      expect(result.status).to.equal(ICrossChainGasStatus.SUCCESS)
      // The lying estimate for this fixture is 120,000; the honest answer is far above it -
      // even beyond what the client's 50% margin on the lying value would have produced.
      expect(Number(result.requiredGas)).to.be.greaterThan(200_000)
      expect(Number(result.requiredGas)).to.be.greaterThan(120_000 * 1.5)
    })

    it('adds the controller reserve back to the frame gas, exactly', async () => {
      simulateRaw.resolves(tenderlyResponse({ logs: [messageReceivedLog()] }))

      const result = await estimate()

      expect(result.requiredGas).to.equal((BigInt(FRAME_GAS) + RESERVE).toString())
      expect(BigInt(result.requiredGas as string) - BigInt(FRAME_GAS)).to.equal(RESERVE)
    })

    it('never asks Tenderly to binary-search, and gives it the configured ceiling', async () => {
      simulateRaw.resolves(tenderlyResponse({ logs: [messageReceivedLog()] }))

      await estimate()

      const request = simulateRaw.firstCall.args[0]
      expect(request.gas).to.equal(SIMULATION_GAS_CEILING)
      expect(request.gas).to.be.greaterThanOrEqual(30_000_000)
      // `estimate_gas` is pinned inside TenderlyModule.simulateRaw; the service must not opt back in.
      expect(request).to.not.have.property('estimate_gas')
    })

    it('simulates on the destination chain, from the destination router, against the remote adapter', async () => {
      simulateRaw.resolves(tenderlyResponse({ logs: [messageReceivedLog()] }))

      await estimate()

      const request = simulateRaw.firstCall.args[0]
      expect(request.chainId).to.equal(8453)
      expect(request.from).to.equal(CCIP_ROUTER)
      expect(request.to).to.equal(REMOTE_ADAPTER)
      expect(request.input.startsWith('0x85572ffb')).to.be.true
    })

    it('reports the simulation url and run time', async () => {
      simulateRaw.resolves(tenderlyResponse({ logs: [messageReceivedLog()] }))

      const result = await estimate()

      expect(result.simulationUrl).to.equal('https://tenderly.co/shared/simulation/sim-1')
      expect(result.runAt).to.be.a('number')
    })

    it('reports the bare measurement and nothing else - no cap, no margin', async () => {
      // Whether the result fits the lane's per-message cap is the client's call, so the estimator
      // does not read the cap and never withholds a figure on account of it.
      simulateRaw.resolves(tenderlyResponse({ logs: [messageReceivedLog()] }))

      const result = await estimate()

      expect(result.status).to.equal(ICrossChainGasStatus.SUCCESS)
      expect(result.requiredGas).to.equal('228100')
      expect(result).to.not.have.property('maxGasLimit')
    })
  })

  describe('MessageExecutionFailed - the trap from §2', () => {
    it('returns no requiredGas even though the simulated transaction reported success', async () => {
      simulateRaw.resolves(tenderlyResponse({ logs: [messageExecutionFailedLog('0x')] }))

      const result = await estimate()

      expect(result.status).to.equal(ICrossChainGasStatus.REVERTED)
      expect(result.requiredGas).to.be.undefined
    })

    it('decodes an Error(string) revert reason', async () => {
      const reason = '0x08c379a0' + abiCoder.encode(['string'], ['ERC20: insufficient allowance']).slice(2)
      simulateRaw.resolves(tenderlyResponse({ logs: [messageExecutionFailedLog(reason)] }))

      const result = await estimate()

      expect(result.status).to.equal(ICrossChainGasStatus.REVERTED)
      expect(result.revertReason).to.equal('ERC20: insufficient allowance')
    })

    it('points at the failing action in the batch, best effort', async () => {
      const reason = '0x08c379a0' + abiCoder.encode(['string'], ['nope']).slice(2)
      simulateRaw.resolves(
        tenderlyResponse({
          logs: [messageExecutionFailedLog(reason)],
          callTrace: {
            from: CCIP_ROUTER,
            to: REMOTE_ADAPTER,
            gas_used: FRAME_GAS,
            calls: [
              {
                from: DEST_CONTROLLER,
                to: EXECUTOR,
                calls: [
                  { from: EXECUTOR, to: TARGET },
                  { from: EXECUTOR, to: OTHER_TARGET, error: 'execution reverted' },
                ],
              },
            ],
          },
        }),
      )

      const result = await estimate([
        { to: TARGET, value: '0', data: '0x' },
        { to: OTHER_TARGET, value: '0', data: '0x' },
      ])

      expect(result.revertedActionIndex).to.equal(1)
    })
  })

  describe('failures', () => {
    it('rejects with 502 when neither controller event is emitted', async () => {
      simulateRaw.resolves(tenderlyResponse({ logs: [{ raw: { topics: [id('Transfer(address,address,uint256)')] } }] }))

      await expect(estimate()).to.be.rejectedWith('crossChainSimulationFailed')
    })

    it("surfaces the adapter's own revert reason when the delivery never reaches the controller", async () => {
      // The lane trust check is no longer performed up front, so a half-configured lane arrives
      // here instead. REMOTE_NOT_TRUSTED in the message is what tells an operator which it was.
      simulateRaw.resolves(
        tenderlyResponse({
          logs: [],
          callTrace: {
            from: CCIP_ROUTER,
            to: REMOTE_ADAPTER,
            gas_used: 21_000,
            error: 'execution reverted',
            output: '0x82de18ba',
            calls: [],
          },
        }),
      )

      await expect(estimate()).to.be.rejectedWith('crossChainSimulationFailed')

      const error = await estimate().catch((e: any) => e)
      expect(error.description).to.contain('REMOTE_NOT_TRUSTED')
    })

    it('rejects with 502 when Tenderly returns nothing', async () => {
      simulateRaw.resolves(undefined)

      await expect(estimate()).to.be.rejectedWith('crossChainSimulationFailed')
    })

    it('rejects with 502 when the trace carries no frame gas', async () => {
      simulateRaw.resolves(
        tenderlyResponse({
          logs: [messageReceivedLog()],
          callTrace: { from: CCIP_ROUTER, to: REMOTE_ADAPTER, calls: [] },
        }),
      )

      await expect(estimate()).to.be.rejectedWith('crossChainSimulationFailed')
    })

    it('surfaces an unconfigured lane rather than fabricating a default', async () => {
      ;(CrossChainLaneReader.readLane as sinon.SinonStub).rejects(
        Object.assign(new Error('crossChainLaneNotConfigured'), { exposeCustom_: true, status: 400 }),
      )

      await expect(estimate()).to.be.rejectedWith('crossChainLaneNotConfigured')
      expect(simulateRaw.called).to.be.false
    })
  })

  describe('caching', () => {
    it('serves an identical request from cache instead of re-simulating', async () => {
      simulateRaw.resolves(tenderlyResponse({ logs: [messageReceivedLog()] }))

      const first = await estimate()
      const second = await estimate()

      expect(second).to.deep.equal(first)
      expect(simulateRaw.calledOnce).to.be.true
    })

    it('does not share a cache entry between different action batches', async () => {
      simulateRaw.resolves(tenderlyResponse({ logs: [messageReceivedLog()] }))

      await estimate()
      await estimate([{ to: OTHER_TARGET, value: '0', data: '0x' }])

      expect(simulateRaw.calledTwice).to.be.true
    })
  })
})
