/**
 * End to end Tenderly budget. Nothing is stubbed.
 *
 * The API controller publishes to RabbitMQ, the dao consumer picks it up, the Tenderly module pays
 * one real simulation, the result and the hourly counters are written to Mongo and the reply comes
 * back to the caller.
 *
 * Needs `pnpm docker:unit-dep-dependencies` (Mongo replica set + RabbitMQ), RPC keys and Tenderly
 * credentials from the unit-dep config.
 *
 * It costs money, so every paid send below is counted in the test name's describe. The caps are
 * reached by seeding counters, which is real data, not a stub.
 */

import DispatchSimulationController from '@api/controllers/dispatchSimulation'
import SimulationController from '@api/controllers/simulation'
import SimulationQueue from '@api/controllers/simulationQueue'
import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import utils from '@helpers/utils'
import RabbitMQ from '@modules/rabbitMQ'
import TenderlyCache from '@modules/tenderly/cache'
import CrossChainGasController from '@services/aragon-api/controllers/crossChainGas'
import { CrossChainGasDao } from '@services/aragon-dao/crossChainGas'
import SimulationDao from '@services/aragon-dao/simulation'
import {
  EnumQueueName,
  ICrossChainGasStatus,
  IPluginInterfaceType,
  IPluginStatus,
  type IQueueCrossChainGasLimit,
  type IQueueSimulation,
  ISimulationStatus,
  ITenderlyCallCacheKind,
  ITenderlyOperation,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

const MAINNET = NetworksEnum.ethereumMainnet
const DAO = '0x5dEA8E499b05de8F86E7521F039770268055b23F'
const PLUGIN = '0xA303C435563a4544a84E26501F4666346Ff73a0d'
/** An account with no EXECUTE_PERMISSION on the DAO, so DAO.execute from it reverts. */
const OUTSIDER = '0x000000000000000000000000000000000000dEaD'

const ACTION = {
  to: '0x1b6ec227ceBeC25118270efbb4b67642fc29965E',
  data: '0x9281aa0b000000000000000000000000654ab1708158ccc539a67ea9ea39ec30e10496ac0000000000000000000000000000000000000000000000000000000000000001',
  value: '0',
}
const OTHER_ACTION = { ...ACTION, data: ACTION.data.slice(0, -1) + '2' }

const SEPOLIA = NetworksEnum.ethereumSepolia
const POLICY = '0x15474bFFCDc0050fFCdf693219db9c78f6669782'
const POLICY_DAO = '0xEB4813f79E18bbd62F9222CC98F5049B872F5c04'

const BASE = NetworksEnum.baseMainnet
const CONTROLLER = '0x4D71c478792E86763cAF46Ed3bbfb6E5b3CF09e8'
const CONTROLLER_DAO = '0x5b353764C68B1d504C654C3D5d7DA834c8954C09'
const ARBITRUM_CHAIN_ID = 42161
const GAS_ACTIONS = [{ to: '0xa0Ab554dEa45be64F12E3B0085DDC59852eFF9fc', value: '0', data: '0xd09de08a' }]

const HOUR = 60 * 60 * 1000

const seedDao = (network: NetworksEnum, address: string) =>
  Models.Dao.create({
    id: `${network}-${address}`,
    isActive: true,
    isHidden: false,
    network,
    address,
    creatorAddress: OUTSIDER,
    transactionHash: '0x0000000000000000000000000000000000000000000000000000000000000001',
    blockNumber: 1,
    blockTimestamp: 1,
  })

const seedPlugin = (network: NetworksEnum, address: string, daoAddress: string, extra: Record<string, unknown>) =>
  Models.Plugin.create({
    id: `${network}-${address}`,
    network,
    address,
    daoAddress,
    status: IPluginStatus.installed,
    isSupported: true,
    transactionHash: '0x0000000000000000000000000000000000000000000000000000000000000002',
    blockNumber: 1,
    blockTimestamp: 1,
    ...extra,
  })

/**
 * Fill a bucket the way real traffic would. Upsert, never create, so a bucket a request already
 * opened this hour is the one that gets filled.
 */
const fillBudget = async (id: string, count: number) => {
  await Models.TenderlyCallCache.updateOne(
    { id },
    { $set: { kind: ITenderlyCallCacheKind.budget, count, purgeAt: new Date(Date.now() + 2 * HOUR) } },
    { upsert: true },
  )
}

const daoBudgetId = (operation: ITenderlyOperation, network: NetworksEnum, daoAddress: string, now = Date.now()) =>
  `budget|v1|${operation}|${network}|${daoAddress}|${Models.TenderlyCallCache.hourBucket(now)}`

const globalCount = async () =>
  (await Models.TenderlyCallCache.findOne({ id: Models.TenderlyCallCache.globalBudgetId(Date.now()) }))?.count

const cacheRows = () => Models.TenderlyCallCache.countDocuments({ kind: ITenderlyCallCacheKind.cache })

const simulatePlugin = (action = ACTION) => SimulationController.simulate(PLUGIN, [action], MAINNET)
const simulateDirect = (from: string, action = ACTION) =>
  SimulationController.simulateDirectExecute(DAO, from, [action], MAINNET)

// Skipped because it pays for real Tenderly simulations. Remove the skip to run it once by hand.
describe.skip('Integ: tenderly budget, end to end', () => {
  before(async function () {
    this.timeout(60_000)

    await RabbitMQ.connect()

    // The same consumers the dao service registers. Without them the controller publishes and
    // waits for a reply that never comes.
    await RabbitMQHelper.process(EnumQueueName.simulationRun, async (job: { params: IQueueSimulation }) =>
      SimulationDao.run(job.params),
    )
    await RabbitMQHelper.process(EnumQueueName.crossChainGasLimit, async (job: { params: IQueueCrossChainGasLimit }) =>
      CrossChainGasDao.estimateGasLimit(job.params),
    )
  })

  beforeEach(async () => {
    await seedDao(MAINNET, DAO)
    await seedPlugin(MAINNET, PLUGIN, DAO, { interfaceType: IPluginInterfaceType.tokenVoting })
  })

  afterEach(() => sinon.restore())

  describe('paid once (2 sends)', () => {
    it('pays once for two identical calls in flight, serves the repeat free, pays again for a new action', async function () {
      this.timeout(120_000)

      const [first, twin] = await Promise.all([simulatePlugin(), simulatePlugin()])

      expect(Object.values(ISimulationStatus)).to.include(first.status)
      expect(first.url!.startsWith(config.TENDERLY.SHARING_BASE_URL)).to.be.true
      expect(first.network).to.equal(MAINNET)
      expect(twin.runAt).to.equal(first.runAt)
      expect(await globalCount()).to.equal(1)

      const repeat = await simulatePlugin()

      expect(repeat.runAt).to.equal(first.runAt)
      expect(await globalCount()).to.equal(1)

      const other = await simulatePlugin(OTHER_ACTION)

      expect(other.runAt).to.be.greaterThan(first.runAt)
      expect(await globalCount()).to.equal(2)
      expect(await cacheRows()).to.equal(2)
    })
  })

  describe('budgets (1 send)', () => {
    it('refuses with 429 when the DAO has used 20 this hour and nothing is sent', async function () {
      this.timeout(60_000)

      await fillBudget(
        daoBudgetId(ITenderlyOperation.pluginActions, MAINNET, DAO),
        config.TENDERLY.API_BUDGET_PER_DAO_PER_HOUR,
      )

      const thrown: any = await simulatePlugin().catch(error => error)

      expect(thrown.message).to.equal('simulationBudgetExhausted')
      expect(thrown.status).to.equal(429)
      // The DAO bucket is checked first, so the API bucket is never even opened.
      expect(await globalCount()).to.be.undefined
      expect(await cacheRows()).to.equal(0)
    })

    it('counts every operation in the one API bucket and refuses the 301st', async function () {
      this.timeout(120_000)

      await fillBudget(Models.TenderlyCallCache.globalBudgetId(Date.now()), config.TENDERLY.API_BUDGET_PER_HOUR - 1)
      // Last hour was full. It must not count against this hour.
      await fillBudget(Models.TenderlyCallCache.globalBudgetId(Date.now() - HOUR), config.TENDERLY.API_BUDGET_PER_HOUR)

      const result = await simulatePlugin()

      expect(result.runAt).to.be.a('number')
      expect(await globalCount()).to.equal(config.TENDERLY.API_BUDGET_PER_HOUR)

      const thrown: any = await simulateDirect(PLUGIN).catch(error => error)

      expect(thrown.message).to.equal('simulationBudgetExhausted')
      expect(thrown.status).to.equal(429)
      expect(await globalCount()).to.equal(config.TENDERLY.API_BUDGET_PER_HOUR)
      expect(await cacheRows()).to.equal(1)
    })
  })

  describe('errors reach the client (3 sends, 1 of them rejected by Tenderly)', () => {
    it('charges one unit and returns 502 when Tenderly rejects the request', async function () {
      this.timeout(60_000)

      sinon.stub(config.TENDERLY, 'ACCESS_KEY').value('not-a-key')

      const thrown: any = await simulatePlugin().catch(error => error)

      expect(thrown.message).to.equal('simulationFailed')
      expect(thrown.status).to.equal(502)
      // The unit is spent when the request is sent, whatever comes back.
      expect(await globalCount()).to.equal(1)
      expect(await cacheRows()).to.equal(0)
    })

    it('returns 503 when the deadline passes before the send and does not charge', async function () {
      this.timeout(120_000)

      const first = simulatePlugin()
      await utils.wait(1000)

      // About 1.2s left on this one. The first call holds the limiter longer than that.
      const thrown: any = await SimulationQueue.request({
        operation: ITenderlyOperation.directExecute,
        daoAddress: DAO,
        from: PLUGIN,
        actions: [OTHER_ACTION],
        network: MAINNET,
        sentAt: Date.now() - 26_800,
      }).catch(error => error)

      expect(thrown.message).to.equal('tooBusy')
      expect(thrown.status).to.equal(503)

      await first

      expect(await globalCount()).to.equal(1)
      expect(await cacheRows()).to.equal(1)
    })

    it('returns 200 status failed on a completed revert and serves it from cache next time', async function () {
      this.timeout(120_000)

      const result = await simulateDirect(OUTSIDER)

      expect(result.status).to.equal(ISimulationStatus.FAILED)
      expect(result.url!.startsWith(config.TENDERLY.SHARING_BASE_URL)).to.be.true
      expect(await globalCount()).to.equal(1)

      const repeat = await simulateDirect(OUTSIDER)

      expect(repeat.runAt).to.equal(result.runAt)
      expect(await globalCount()).to.equal(1)
    })
  })

  describe('proposal (1 send)', () => {
    const proposalId = `${MAINNET}-${PLUGIN}-0`

    beforeEach(async () => {
      await Models.Proposal.create({
        id: proposalId,
        transactionHash: '0x0000000000000000000000000000000000000000000000000000000000000003',
        blockNumber: 1,
        network: MAINNET,
        pluginAddress: PLUGIN,
        daoAddress: DAO,
        proposalIndex: '0',
        creatorAddress: OUTSIDER,
        startDate: 1,
        endDate: 2,
        incrementalId: 1,
        proposalId: '0x00',
        rawActions: [ACTION],
      })
    })

    it('simulates the proposal actions, saves the result on the proposal and serves the repeat free', async function () {
      this.timeout(120_000)

      const result = await SimulationController.simulateProposal(proposalId)

      expect(Object.values(ISimulationStatus)).to.include(result.status)
      expect(await globalCount()).to.equal(1)

      const proposal = await Models.Proposal.findByEntityId(proposalId)
      expect(proposal!.simulation!.runAt).to.equal(result.runAt)
      expect(proposal!.simulation!.inputHash).to.be.a('string')

      const repeat = await SimulationController.simulateProposal(proposalId)

      expect(repeat.runAt).to.equal(result.runAt)
      expect(await globalCount()).to.equal(1)
    })
  })

  describe('dispatch (1 send)', () => {
    beforeEach(async () => {
      await seedDao(SEPOLIA, POLICY_DAO)
      await seedPlugin(SEPOLIA, POLICY, POLICY_DAO, { isPolicy: true, interfaceType: IPluginInterfaceType.router })
    })

    it('simulates a dispatch, counts one unit and serves the repeat free', async function () {
      this.timeout(120_000)

      const summary = await DispatchSimulationController.simulateDispatchSummary(POLICY, SEPOLIA, OUTSIDER)

      expect(['success', 'failed']).to.include(summary.status)
      expect(summary.summaryGroups).to.be.an('array')
      expect(await globalCount()).to.equal(1)

      const repeat = await DispatchSimulationController.simulateDispatchSummary(POLICY, SEPOLIA, OUTSIDER)

      expect(repeat).to.deep.equal(summary)
      expect(await globalCount()).to.equal(1)
    })
  })

  describe('cross-chain gas (0 sends)', () => {
    beforeEach(async () => {
      await seedDao(BASE, CONTROLLER_DAO)
      await seedPlugin(BASE, CONTROLLER, CONTROLLER_DAO, { interfaceType: IPluginInterfaceType.crossChainController })
    })

    it('returns the stale estimate when the controller budget is finished and sends nothing', async function () {
      this.timeout(60_000)

      const runAt = Date.now() - 2 * 60 * 1000
      await Models.TenderlyCallCache.create({
        id: TenderlyCache.crossChainGasKey(BASE, CONTROLLER, ARBITRUM_CHAIN_ID, GAS_ACTIONS),
        kind: ITenderlyCallCacheKind.cache,
        operation: ITenderlyOperation.crossChainGas,
        result: { status: ICrossChainGasStatus.SUCCESS, requiredGas: '123456', simulationUrl: 'x', runAt },
        expiresAt: new Date(Date.now() - 1000),
        purgeAt: new Date(Date.now() + HOUR),
      })
      await fillBudget(
        Models.TenderlyCallCache.controllerBudgetId(BASE, CONTROLLER, Date.now()),
        config.CROSS_CHAIN_GAS.BUDGET_PER_CONTROLLER_PER_HOUR,
      )

      const stale = await CrossChainGasController.estimateGasLimit(BASE, CONTROLLER, ARBITRUM_CHAIN_ID, GAS_ACTIONS)

      expect(stale.requiredGas).to.equal('123456')
      expect(stale.staleSince).to.equal(runAt)
      expect(await globalCount()).to.be.undefined
      expect(await cacheRows()).to.equal(1)
    })
  })
})
