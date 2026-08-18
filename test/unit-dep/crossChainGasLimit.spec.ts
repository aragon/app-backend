/**
 * End to end cross-chain gas estimation. Nothing is stubbed.
 *
 * The whole chain runs for real: the API controller publishes to RabbitMQ, the dao consumer picks
 * it up, the lane is read over RPC from both chains, Tenderly runs the delivery simulation, and the
 * result and the hourly budget are written to Mongo.
 *
 * Needs `pnpm docker:unit-dep-dependencies` (Mongo replica set + RabbitMQ), RPC keys for both
 * chains, and Tenderly credentials.
 *
 * It costs money, so the whole success path is one test and the refusals below spend nothing. The
 * refusals reach their state by seeding the budget counter, which is real data, not a stub.
 */

import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import RabbitMQ from '@modules/rabbitMQ'
import CrossChainGasController from '@services/aragon-api/controllers/crossChainGas'
import { CrossChainGasDao } from '@services/aragon-dao/crossChainGas'
import {
  EnumQueueName,
  ICrossChainGasCacheKind,
  ICrossChainGasStatus,
  IPluginInterfaceType,
  IPluginStatus,
  NetworksEnum,
  type IQueueCrossChainGasLimit,
} from '@types'
import { expect } from 'chai'

const NETWORK = NetworksEnum.baseMainnet
const CONTROLLER = '0x4D71c478792E86763cAF46Ed3bbfb6E5b3CF09e8'
const DAO_ADDRESS = '0x5b353764C68B1d504C654C3D5d7DA834c8954C09'
const DESTINATION_CHAIN_ID = 42161 //arbitrum

/** A call that really succeeds on the destination chain, so there is a frame to measure. */
const ACTIONS = [{ to: '0xa0Ab554dEa45be64F12E3B0085DDC59852eFF9fc', value: '0', data: '0xd09de08a' }]

const globalBudget = () =>
  Models.CrossChainGasCache.findOne({ kind: ICrossChainGasCacheKind.budget, id: /^budget\|global/ })

/**
 * Fill the controller's hourly bucket, the way real traffic would.
 *
 * Upsert, never create. A request earlier in the same test has already opened this bucket for this
 * hour, and a second document with the same `id` would be read past by `consumeBudget`, which looks
 * the bucket up by `id` and would find the old one still under the limit.
 */
const exhaustBudget = async () => {
  const id = Models.CrossChainGasCache.controllerBudgetId(NETWORK, CONTROLLER, Date.now())

  await Models.CrossChainGasCache.updateOne(
    { id },
    {
      $set: {
        kind: ICrossChainGasCacheKind.budget,
        count: config.CROSS_CHAIN_GAS.BUDGET_PER_CONTROLLER_PER_HOUR,
        purgeAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
      $setOnInsert: { id },
    },
    { upsert: true },
  )
}

const seedDao = async () => {
  await Models.Dao.create({
    id: `${NETWORK}-${DAO_ADDRESS}`,
    isActive: true,
    isHidden: false,
    network: NETWORK,
    address: DAO_ADDRESS,
    creatorAddress: '0xcreator',
    transactionHash: '0x0000000000000000000000000000000000000000000000000000000000000001',
    blockNumber: 1,
    blockTimestamp: 1,
  })

  // `estimateGasLimit` refuses anything that is not an indexed cross-chain controller, so the row
  // has to exist before the request is made.
  await Models.Plugin.create({
    id: `${NETWORK}-${CONTROLLER}`,
    network: NETWORK,
    address: CONTROLLER,
    daoAddress: DAO_ADDRESS,
    status: IPluginStatus.installed,
    isSupported: true,
    interfaceType: IPluginInterfaceType.crossChainController,
    transactionHash: '0x0000000000000000000000000000000000000000000000000000000000000002',
    blockNumber: 1,
    blockTimestamp: 1,
  })
}

const estimate = () => CrossChainGasController.estimateGasLimit(NETWORK, CONTROLLER, DESTINATION_CHAIN_ID, ACTIONS)

describe('Integ: cross-chain gas limit, end to end', () => {
  before(async function () {
    this.timeout(60_000)

    await RabbitMQ.connect()

    // The same consumer the dao service registers. Without it the controller publishes and waits
    // for a reply that never comes.
    await RabbitMQHelper.process(EnumQueueName.crossChainGasLimit, async (job: { params: IQueueCrossChainGasLimit }) =>
      CrossChainGasDao.estimateGasLimit(job.params),
    )
  })

  beforeEach(async () => {
    await seedDao()
  })

  it('measures a real delivery, saves it, counts one unit, then serves the repeat and the stale read', async function () {
    this.timeout(180_000)

    const result = await estimate()

    expect(result.status).to.equal(ICrossChainGasStatus.SUCCESS)
    // A real `ccipReceive` frame is never free, and never a whole block either.
    expect(Number(result.requiredGas)).to.be.greaterThan(0)
    expect(Number(result.requiredGas)).to.be.lessThan(30_000_000)
    expect(result.simulationUrl).to.be.a('string')
    expect(result.runAt).to.be.a('number')
    expect(result.staleSince).to.be.undefined

    const cached = await Models.CrossChainGasCache.findOne({ kind: ICrossChainGasCacheKind.cache })
    expect(cached?.result?.requiredGas).to.equal(result.requiredGas)
    // The gap between the two is the window an over-budget caller is served from.
    expect(cached!.purgeAt.getTime()).to.be.greaterThan(cached!.expiresAt!.getTime())
    expect((await globalBudget())?.count).to.equal(1)

    // The repeat is answered from Mongo. Same number, and the counter did not move, so no second
    // simulation was paid for.
    const repeat = await estimate()

    expect(repeat.requiredGas).to.equal(result.requiredGas)
    expect((await globalBudget())?.count).to.equal(1)

    // Age the measurement past its ttl and fill the bucket. An old real number beats an error.
    await Models.CrossChainGasCache.updateOne({ id: cached!.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    await exhaustBudget()

    const stale = await estimate()

    expect(stale.requiredGas).to.equal(result.requiredGas)
    expect(stale.staleSince).to.equal(result.runAt)
  })

  describe('refusals - none of these reach Tenderly', () => {
    it('returns 429 when the hourly budget is finished and nothing is saved', async function () {
      this.timeout(60_000)

      await exhaustBudget()

      const thrown: any = await estimate().catch(error => error)

      // We never invent a gas limit. One that was not simulated can be too low, and then the
      // message is lost on chain.
      expect(thrown.message).to.equal('crossChainGasBudgetExhausted')
      expect(thrown.status).to.equal(429)
      expect(await Models.CrossChainGasCache.countDocuments({ kind: ICrossChainGasCacheKind.cache })).to.equal(0)
    })

    it('refuses a controller that is not an indexed cross-chain controller', async function () {
      this.timeout(60_000)

      await Models.Plugin.updateOne(
        { address: CONTROLLER, network: NETWORK },
        { $set: { interfaceType: IPluginInterfaceType.admin } },
      )

      const thrown: any = await estimate().catch(error => error)

      expect(thrown.message).to.equal('crossChainControllerNotFound')
      // Refused before anything is counted, so a bad address cannot eat a DAO's hourly budget.
      expect(await Models.CrossChainGasCache.countDocuments({})).to.equal(0)
    })
  })
})
