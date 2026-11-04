import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import TenderlyBudget from '@modules/tenderly/budget'
import { ITenderlyOperation, type ITenderlySendContext, NetworksEnum } from '@types'
import { expect } from 'chai'
import { getAddress } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const NOW = Date.UTC(2030, 0, 1, 12, 0, 0)
const HOUR = '2030-01-01T12'
const DAO = '0x1111111111111111111111111111111111111111'
const CONTROLLER = '0x2222222222222222222222222222222222222222'

const plugin: ITenderlySendContext = {
  operation: ITenderlyOperation.pluginActions,
  network: NetworksEnum.ethereumMainnet,
  daoAddress: DAO,
  deadlineAt: NOW + 30_000,
}

const gas: ITenderlySendContext = {
  operation: ITenderlyOperation.crossChainGas,
  network: NetworksEnum.ethereumMainnet,
  controllerAddress: CONTROLLER,
  deadlineAt: NOW + 30_000,
}

const count = async (id: string) => (await Models.TenderlyCallCache.findOne({ id }))?.count ?? 0

describe('Module: tenderly/budget', () => {
  let sandbox: SinonSandbox
  let loggerError: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerError = sandbox.stub(logger, 'error')
    sandbox.stub(config.TENDERLY, 'API_BUDGET_PER_HOUR').value(3)
    sandbox.stub(config.TENDERLY, 'API_BUDGET_PER_DAO_PER_HOUR').value(2)
    sandbox.stub(config.CROSS_CHAIN_GAS, 'BUDGET_PER_CONTROLLER_PER_HOUR').value(2)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('counts the indexed DAO per operation and network, then the API-wide bucket', async () => {
    await TenderlyBudget.consumeApiBudget(plugin, NOW)

    expect(await count(`budget|v1|pluginActions|${NetworksEnum.ethereumMainnet}|${DAO}|${HOUR}`)).to.equal(1)
    expect(await count(`budget|global|${HOUR}`)).to.equal(1)
  })

  it('checksums the DAO in the bucket id', async () => {
    const lower = '0xabcdef0123456789abcdef0123456789abcdef01'

    await TenderlyBudget.consumeApiBudget({ ...plugin, daoAddress: lower }, NOW)

    const id = `budget|v1|pluginActions|${NetworksEnum.ethereumMainnet}|${getAddress(lower)}|${HOUR}`
    expect(getAddress(lower)).to.not.equal(lower)
    expect(await count(id)).to.equal(1)
  })

  it('keeps the controller bucket id for cross-chain gas and its own error key', async () => {
    await TenderlyBudget.consumeApiBudget(gas, NOW)
    await TenderlyBudget.consumeApiBudget(gas, NOW)

    expect(
      await count(Models.TenderlyCallCache.controllerBudgetId(NetworksEnum.ethereumMainnet, CONTROLLER, NOW)),
    ).to.equal(2)
    await expect(TenderlyBudget.consumeApiBudget(gas, NOW)).to.be.rejectedWith('crossChainGasBudgetExhausted')
  })

  it('refuses with 429 when the DAO bucket is finished and does not touch the API-wide bucket', async () => {
    await TenderlyBudget.consumeApiBudget(plugin, NOW)
    await TenderlyBudget.consumeApiBudget(plugin, NOW)

    const thrown: any = await TenderlyBudget.consumeApiBudget(plugin, NOW).catch(error => error)

    expect(thrown.message).to.equal('simulationBudgetExhausted')
    expect(thrown.status).to.equal(429)
    expect(await count(`budget|global|${HOUR}`)).to.equal(2)
  })

  it('refuses with 429 when the API-wide bucket is finished even if the DAO has room', async () => {
    await TenderlyBudget.consumeApiBudget(plugin, NOW)
    await TenderlyBudget.consumeApiBudget({ ...plugin, operation: ITenderlyOperation.dispatch }, NOW)
    await TenderlyBudget.consumeApiBudget({ ...plugin, operation: ITenderlyOperation.proposal }, NOW)

    await expect(
      TenderlyBudget.consumeApiBudget({ ...plugin, operation: ITenderlyOperation.directExecute }, NOW),
    ).to.be.rejectedWith('simulationBudgetExhausted')
    expect(await count(`budget|global|${HOUR}`)).to.equal(3)
  })

  it('answers 503 without using the DAO or API-wide budget when the deadline has passed', async () => {
    sandbox.useFakeTimers({ now: NOW, toFake: ['Date'] })

    const thrown: any = await TenderlyBudget.consumeApiBudget({ ...plugin, deadlineAt: NOW - 1 }, NOW).catch(
      error => error,
    )

    expect(thrown.message).to.equal('tooBusy')
    expect(thrown.status).to.equal(503)
    expect(await count(`budget|v1|pluginActions|${NetworksEnum.ethereumMainnet}|${DAO}|${HOUR}`)).to.equal(0)
    expect(await count(`budget|global|${HOUR}`)).to.equal(0)
  })

  it('answers 503 and leaves the API-wide bucket alone when the DAO check outlasts the deadline', async () => {
    const clock = sandbox.useFakeTimers({ now: NOW, toFake: ['Date'] })
    const consume = Models.TenderlyCallCache.consumeBudget.bind(Models.TenderlyCallCache)
    sandbox.stub(Models.TenderlyCallCache, 'consumeBudget').callsFake(async (id, limit, now) => {
      const consumed = await consume(id, limit, now)
      clock.tick(2_000)
      return consumed
    })

    const thrown: any = await TenderlyBudget.consumeApiBudget({ ...plugin, deadlineAt: NOW + 1_000 }, NOW).catch(
      error => error,
    )

    expect(thrown.message).to.equal('tooBusy')
    expect(thrown.status).to.equal(503)
    expect(await count(`budget|v1|pluginActions|${NetworksEnum.ethereumMainnet}|${DAO}|${HOUR}`)).to.equal(1)
    expect(await count(`budget|global|${HOUR}`)).to.equal(0)
  })

  it('answers 503 and logs the error when the counter store fails', async () => {
    const error = new Error('mongo down')
    sandbox.stub(Models.TenderlyCallCache, 'consumeBudget').rejects(error)

    const thrown: any = await TenderlyBudget.consumeApiBudget(plugin, NOW).catch(error => error)

    expect(thrown.message).to.equal('tooBusy')
    expect(thrown.status).to.equal(503)
    expect(loggerError.calledOnceWith('Tenderly: budget check failed, refusing the simulation' as any)).to.be.true
    expect(loggerError.firstCall.args[1]).to.include({
      service: 'tenderly-budget',
      id: `budget|v1|pluginActions|${NetworksEnum.ethereumMainnet}|${DAO}|${HOUR}`,
      error,
    })
  })

  it('answers 503 when a limit is not a whole number', async () => {
    sandbox.stub(config.TENDERLY, 'API_BUDGET_PER_DAO_PER_HOUR').value(Number.NaN)

    await expect(TenderlyBudget.consumeApiBudget(plugin, NOW)).to.be.rejectedWith('tooBusy')
    expect(await Models.TenderlyCallCache.countDocuments({})).to.equal(0)
  })
})
