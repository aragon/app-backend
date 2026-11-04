import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import TenderlyModule from '@modules/tenderly'
import { SIMULATION_GAS_CEILING } from '@modules/tenderly/crossChainGas/constants'
import CrossChainLaneReader from '@modules/tenderly/crossChainGas/laneReader'
import { MESSAGE_EXECUTION_FAILED_TOPIC, MESSAGE_RECEIVED_TOPIC } from '@modules/tenderly/crossChainGas/traceAnalyzer'
import TenderlyTransport from '@modules/tenderly/transport'
import {
  type ICrossChainGasAction,
  ICrossChainGasStatus,
  type ICrossChainLane,
  ITenderlyOperation,
  NetworksEnum,
} from '@types'
import axios from 'axios'
import Bottleneck from 'bottleneck'
import { expect } from 'chai'
import { AbiCoder, id, keccak256, toUtf8Bytes } from 'ethers'
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

/** The key the estimator wrote before it moved into the Tenderly module. */
const keyFromBeforeTheMove = (actions: ICrossChainGasAction[]) => {
  const actionsHash = keccak256(
    toUtf8Bytes(JSON.stringify(actions.map(a => [a.to.toLowerCase(), a.value, (a.data || '0x').toLowerCase()]))),
  )
  return `${NetworksEnum.ethereumMainnet}|${CONTROLLER.toLowerCase()}|8453|${actionsHash}`
}

describe('Module: tenderly/crossChainGas/crossChainGasService', () => {
  let sandbox: SinonSandbox
  let axiosPost: sinon.SinonStub
  let limiter: sinon.SinonStub
  let loggerError: sinon.SinonStub
  let loggerInfo: sinon.SinonStub

  /** Runs the job straight away. The real limiter waits `MIN_TIME`, which is 3 seconds per call. */
  const passThroughLimiter = { schedule: (fn: any) => fn() } as any

  /** The provider answers with this body. Only HTTP is stubbed, the transport and the budget are real. */
  const respond = (body: any) => axiosPost.resolves({ data: body })

  beforeEach(() => {
    sandbox = sinon.createSandbox()

    sandbox.stub(config.TENDERLY, 'PROJECT').value('project')
    sandbox.stub(config.TENDERLY, 'USER').value('user')
    sandbox.stub(config.TENDERLY, 'ACCESS_KEY').value('key')
    sandbox.stub(config.TENDERLY, 'MIN_TIME').value(0)
    BottleneckModule.tenderlyLimiter = null

    sandbox.stub(TenderlyTransport, 'share').resolves('https://tenderly.co/shared/simulation/sim-1')
    sandbox.stub(CrossChainLaneReader, 'readLane').resolves(lane())
    axiosPost = sandbox.stub(axios, 'post')
    limiter = sandbox.stub(BottleneckModule, 'getCrossChainGasLimiter').returns(passThroughLimiter)

    sandbox.stub(logger, 'warn')
    loggerError = sandbox.stub(logger, 'error')
    loggerInfo = sandbox.stub(logger, 'info')
  })

  afterEach(() => {
    BottleneckModule.tenderlyLimiter = null
    sandbox?.restore()
  })

  const estimateSentAt = (sentAt: number, actions = ACTIONS) =>
    TenderlyModule.run({
      operation: ITenderlyOperation.crossChainGas,
      network: NetworksEnum.ethereumMainnet,
      controllerAddress: CONTROLLER,
      destinationChainId: 8453,
      actions,
      sentAt,
    })

  const estimate = (actions = ACTIONS) => estimateSentAt(Date.now(), actions)

  describe('the measurement', () => {
    it('measures the trace frame, not the transaction gas a binary search would settle on', async () => {
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))

      const result = await estimate()

      expect(result.status).to.equal(ICrossChainGasStatus.SUCCESS)
      // The lying estimate for this fixture is 120,000; the honest answer is far above it -
      // even beyond what the client's 50% margin on the lying value would have produced.
      expect(Number(result.requiredGas)).to.be.greaterThan(200_000)
      expect(Number(result.requiredGas)).to.be.greaterThan(120_000 * 1.5)
    })

    it('adds the controller reserve back to the frame gas, exactly', async () => {
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))

      const result = await estimate()

      expect(result.requiredGas).to.equal((BigInt(FRAME_GAS) + RESERVE).toString())
      expect(BigInt(result.requiredGas as string) - BigInt(FRAME_GAS)).to.equal(RESERVE)
      // The log has to show the parts, so a wrong figure can be taken apart without a rerun.
      expect(loggerInfo.calledOnceWith('Cross-chain gas: measurement complete' as any)).to.be.true
      expect(loggerInfo.firstCall.args[1]).to.include({ frameGas: FRAME_GAS, reserve: '45000', requiredGas: '228100' })
    })

    it('never asks Tenderly to binary-search, and gives it the configured ceiling', async () => {
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))

      await estimate()

      const request = axiosPost.firstCall.args[1]
      expect(request.gas).to.equal(SIMULATION_GAS_CEILING)
      expect(request.gas).to.be.greaterThanOrEqual(30_000_000)
      expect(request.estimate_gas).to.equal(false)
      expect(request.simulation_type).to.equal('full')
    })

    it('simulates on the destination chain, from the destination router, against the remote adapter', async () => {
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))

      await estimate()

      const request = axiosPost.firstCall.args[1]
      expect(request.network_id).to.equal('8453')
      expect(request.from).to.equal(CCIP_ROUTER)
      expect(request.to).to.equal(REMOTE_ADAPTER)
      expect(request.input.startsWith('0x85572ffb')).to.be.true
    })

    it('reports the simulation url and run time', async () => {
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))

      const result = await estimate()

      expect(result.simulationUrl).to.equal('https://tenderly.co/shared/simulation/sim-1')
      expect(result.runAt).to.be.a('number')
    })

    it('reports the bare measurement and nothing else - no cap, no margin', async () => {
      // Whether the result fits the lane's per-message cap is the client's call, so the estimator
      // does not read the cap and never withholds a figure on account of it.
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))

      const result = await estimate()

      expect(result.status).to.equal(ICrossChainGasStatus.SUCCESS)
      expect(result.requiredGas).to.equal('228100')
      expect(result).to.not.have.property('maxGasLimit')
    })
  })

  describe('MessageExecutionFailed - the trap from §2', () => {
    it('returns no requiredGas even though the simulated transaction reported success', async () => {
      respond(tenderlyResponse({ logs: [messageExecutionFailedLog('0x')] }))

      const result = await estimate()

      expect(result.status).to.equal(ICrossChainGasStatus.REVERTED)
      expect(result.requiredGas).to.be.undefined
      expect(loggerInfo.calledOnceWith('Cross-chain gas: actions reverted in simulation' as any)).to.be.true
    })

    it('decodes an Error(string) revert reason', async () => {
      const reason = '0x08c379a0' + abiCoder.encode(['string'], ['ERC20: insufficient allowance']).slice(2)
      respond(tenderlyResponse({ logs: [messageExecutionFailedLog(reason)] }))

      const result = await estimate()

      expect(result.status).to.equal(ICrossChainGasStatus.REVERTED)
      expect(result.revertReason).to.equal('ERC20: insufficient allowance')
    })

    it('points at the failing action in the batch, best effort', async () => {
      const reason = '0x08c379a0' + abiCoder.encode(['string'], ['nope']).slice(2)
      respond(
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

    it('saves a revert like a measurement, so repeating it is free', async () => {
      respond(tenderlyResponse({ logs: [messageExecutionFailedLog('0x')] }))

      const first = await estimate()
      const second = await estimate()

      expect(second.status).to.equal(ICrossChainGasStatus.REVERTED)
      expect(second.runAt).to.equal(first.runAt)
      expect(axiosPost.calledOnce).to.be.true
    })
  })

  describe('failures', () => {
    it('rejects with 502 when neither controller event is emitted', async () => {
      respond(tenderlyResponse({ logs: [{ raw: { topics: [id('Transfer(address,address,uint256)')] } }] }))

      await expect(estimate()).to.be.rejectedWith('crossChainSimulationFailed')
      expect(loggerError.calledOnceWith('Cross-chain gas: delivery never reached the controller' as any)).to.be.true
    })

    it("surfaces the adapter's own revert reason when the delivery never reaches the controller", async () => {
      // The lane trust check is no longer performed up front, so a half-configured lane arrives
      // here instead. REMOTE_NOT_TRUSTED in the message is what tells an operator which it was.
      respond(
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
      respond({})

      await expect(estimate()).to.be.rejectedWith('simulationFailed')
    })

    it('rejects with 502 when the trace carries no frame gas', async () => {
      respond(
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
      expect(axiosPost.called).to.be.false
    })
  })

  describe('caching', () => {
    it('serves an identical request from cache instead of re-simulating', async () => {
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))

      const first = await estimate()
      const second = await estimate()

      expect(second).to.deep.equal(first)
      expect(axiosPost.calledOnce).to.be.true
    })

    it('serves a measurement saved under the key from before the move without paying', async () => {
      const saved = { status: ICrossChainGasStatus.SUCCESS, requiredGas: '228100', runAt: Date.now() - 1000 }
      await Models.TenderlyCallCache.writeResult(
        ITenderlyOperation.crossChainGas,
        keyFromBeforeTheMove(ACTIONS),
        saved,
        saved.runAt,
        config.CROSS_CHAIN_GAS.CACHE_TTL,
        config.CROSS_CHAIN_GAS.STALE_WINDOW,
      )

      const result = await estimate()

      expect(result).to.deep.equal(saved)
      expect(axiosPost.called).to.be.false
      expect((CrossChainLaneReader.readLane as sinon.SinonStub).called).to.be.false
    })

    it('does not share a cache entry between different action batches', async () => {
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))

      await estimate()
      await estimate([{ to: OTHER_TARGET, value: '0', data: '0x' }])

      expect(axiosPost.calledTwice).to.be.true
    })

    it('coalesces concurrent identical requests into one lane read and one simulation', async () => {
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))

      const results = await Promise.all(Array.from({ length: 25 }, () => estimate()))

      expect(results.every(result => result.requiredGas === '228100')).to.be.true
      expect((CrossChainLaneReader.readLane as sinon.SinonStub).calledOnce).to.be.true
      expect(axiosPost.calledOnce).to.be.true
    })

    it('keeps a measurement for the ttl and keeps it readable for the stale window after that', async () => {
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))

      const result = await estimate()

      const doc = await Models.TenderlyCallCache.findOne({ id: keyFromBeforeTheMove(ACTIONS) })
      expect(doc!.expiresAt!.getTime()).to.equal(result.runAt + config.CROSS_CHAIN_GAS.CACHE_TTL)
      expect(doc!.purgeAt.getTime()).to.equal(
        result.runAt + config.CROSS_CHAIN_GAS.CACHE_TTL + config.CROSS_CHAIN_GAS.STALE_WINDOW,
      )
    })

    it('counts the budget for a failed run too, so a broken lane cannot be retried for free', async () => {
      respond(tenderlyResponse({ logs: [] }))

      await expect(estimate()).to.be.rejectedWith('crossChainSimulationFailed')
      await expect(estimate()).to.be.rejectedWith('crossChainSimulationFailed')

      const doc = await Models.TenderlyCallCache.findOne({ id: /^budget\|global/ })
      expect(doc?.count).to.equal(2)
    })
  })

  describe('budget', () => {
    it('counts one budget for every paid simulation', async () => {
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))

      await estimate()

      const doc = await Models.TenderlyCallCache.findOne({ id: /^budget\|global/ })
      expect(doc?.count).to.equal(1)
    })

    it('does not count the budget when the saved measurement is still fresh', async () => {
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))
      await estimate()

      await estimate()

      const doc = await Models.TenderlyCallCache.findOne({ id: /^budget\|global/ })
      expect(doc?.count).to.equal(1)
      expect(axiosPost.calledOnce).to.be.true
    })

    it('returns the old measurement when the budget is finished', async () => {
      sandbox.stub(config.CROSS_CHAIN_GAS, 'CACHE_TTL').value(0)
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))
      await estimate()

      sandbox.stub(config.CROSS_CHAIN_GAS, 'BUDGET_PER_CONTROLLER_PER_HOUR').value(0)
      axiosPost.resetHistory()

      const result = await estimate()

      expect(result.requiredGas).to.equal('228100')
      expect(result.staleSince).to.be.a('number')
      expect(axiosPost.called).to.be.false
    })

    it('returns the old measurement when the API-wide budget is finished', async () => {
      sandbox.stub(config.CROSS_CHAIN_GAS, 'CACHE_TTL').value(0)
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))
      await estimate()

      sandbox.stub(config.TENDERLY, 'API_BUDGET_PER_HOUR').value(0)
      axiosPost.resetHistory()

      const result = await estimate()

      expect(result.requiredGas).to.equal('228100')
      expect(result.staleSince).to.be.a('number')
      expect(axiosPost.called).to.be.false
    })

    it('does not return the old measurement when the provider fails', async () => {
      sandbox.stub(config.CROSS_CHAIN_GAS, 'CACHE_TTL').value(0)
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))
      await estimate()

      respond({})

      await expect(estimate()).to.be.rejectedWith('simulationFailed')
    })

    it('does not return the old measurement when the lane read fails', async () => {
      sandbox.stub(config.CROSS_CHAIN_GAS, 'CACHE_TTL').value(0)
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))
      await estimate()

      ;(CrossChainLaneReader.readLane as sinon.SinonStub).rejects(new Error('node down'))

      await expect(estimate()).to.be.rejectedWith('node down')
    })

    it('does not return the old measurement when the budget counter cannot be read', async () => {
      sandbox.stub(config.CROSS_CHAIN_GAS, 'CACHE_TTL').value(0)
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))
      await estimate()

      sandbox.stub(Models.TenderlyCallCache, 'consumeBudget').rejects(new Error('mongo down'))

      await expect(estimate()).to.be.rejectedWith('simulationBudgetCheckFailed')
    })

    it('counts the controller bucket under its existing id', async () => {
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))

      await estimate()

      const id = Models.TenderlyCallCache.controllerBudgetId(NetworksEnum.ethereumMainnet, CONTROLLER, Date.now())
      const doc = await Models.TenderlyCallCache.findOne({ id })
      expect(doc?.count).to.equal(1)
    })

    it('throws when the budget is finished and nothing is saved', async () => {
      sandbox.stub(config.CROSS_CHAIN_GAS, 'BUDGET_PER_CONTROLLER_PER_HOUR').value(0)

      // We never build a gas limit without a simulation. Too low and the message is lost on chain.
      await expect(estimate()).to.be.rejectedWith('crossChainGasBudgetExhausted')
      expect(axiosPost.called).to.be.false
    })

    it('does not count the budget when the lane read fails, that costs us nothing', async () => {
      ;(CrossChainLaneReader.readLane as sinon.SinonStub).rejects(new Error('lane is not configured'))

      await expect(estimate()).to.be.rejected

      expect(await Models.TenderlyCallCache.countDocuments({ id: /^budget/ })).to.equal(0)
      expect(axiosPost.called).to.be.false
    })
  })

  describe('queue depth', () => {
    const droppingLimiter = {
      schedule: () => Promise.reject(new Bottleneck.BottleneckError('dropped')),
    } as any

    it('reports a dropped job as too busy rather than as a failed simulation', async () => {
      limiter.returns(droppingLimiter)

      const thrown: any = await estimate().catch(error => error)

      expect(thrown.message).to.equal('tooBusy')
      expect(thrown.status).to.equal(503)
    })

    it('remembers nothing about a dropped job, so the next request still gets measured', async () => {
      limiter.returns(droppingLimiter)

      await expect(estimate()).to.be.rejectedWith('tooBusy')

      // A full queue says nothing about this request, so once the queue is free it must work.
      limiter.returns(passThroughLimiter)
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))

      const result = await estimate()

      expect(result.requiredGas).to.equal('228100')
    })
  })

  describe('queue wait', () => {
    /** Sent long enough ago that the API has already answered the caller and stopped listening. */
    const gaveUpAt = () => Date.now() - config.SERVICES.ARAGON_API.TIMEOUT * 1000 - 1

    it('does not pay Tenderly for a request whose caller already gave up', async () => {
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))

      const thrown: any = await estimateSentAt(gaveUpAt()).catch(error => error)

      expect(thrown.message).to.equal('tooBusy')
      expect(thrown.status).to.equal(503)
      expect(axiosPost.called).to.be.false
      expect(await Models.TenderlyCallCache.countDocuments({ id: /^budget/ })).to.equal(0)
    })

    it('checks the deadline again after the lane read, before paying', async () => {
      const clock = sandbox.useFakeTimers({ now: Date.now(), toFake: ['Date'] })
      ;(CrossChainLaneReader.readLane as sinon.SinonStub).callsFake(async () => {
        clock.tick(config.SERVICES.ARAGON_API.TIMEOUT * 1000 + config.RABBITMQ.TIMEOUT)
        return lane()
      })
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))

      await expect(estimateSentAt(Date.now())).to.be.rejectedWith('tooBusy')

      expect((CrossChainLaneReader.readLane as sinon.SinonStub).calledOnce).to.be.true
      expect(axiosPost.called).to.be.false
      expect(await Models.TenderlyCallCache.countDocuments({ id: /^budget/ })).to.equal(0)
    })

    it('measures normally while the request is still inside its deadline', async () => {
      respond(tenderlyResponse({ logs: [messageReceivedLog()] }))

      const result = await estimateSentAt(Date.now())

      expect(result.requiredGas).to.equal('228100')
    })
  })
})
