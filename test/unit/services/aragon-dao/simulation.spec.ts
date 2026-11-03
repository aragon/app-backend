import { ERRORS, throwExposable } from '@errors'
import logger from '@logger'
import TenderlyModule from '@modules/tenderly'
import SimulationDao from '@services/aragon-dao/simulation'
import { ErrorKeyEnum, ISimulationStatus, ITenderlyOperation, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const request = () => ({
  operation: ITenderlyOperation.proposal as const,
  proposalId: 'proposal-1',
  sentAt: Date.now(),
})

const exposable = (key: ErrorKeyEnum, status?: number, description?: string) => {
  try {
    throwExposable(key, status, description)
  } catch (error) {
    return error
  }
}

describe('Dao: simulation', () => {
  let sandbox: SinonSandbox
  let run: sinon.SinonStub
  let warn: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    run = sandbox.stub(TenderlyModule, 'run')
    warn = sandbox.stub(logger, 'warn')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('replies with the result', async () => {
    const result = { status: ISimulationStatus.SUCCESS, runAt: 1, network: NetworksEnum.ethereumMainnet }
    run.resolves(result)

    expect(await SimulationDao.run(request())).to.equal(result)
    expect(run.firstCall.args[0]).to.include({ operation: ITenderlyOperation.proposal, proposalId: 'proposal-1' })
  })

  it('replies with a failed dispatch summary as a result, not a refusal', async () => {
    const summary = { status: 'failed' as const, error: 'execution reverted', summaryGroups: [] }
    run.resolves(summary)

    expect(await SimulationDao.run(request())).to.equal(summary)
  })

  it('replies with the key, status and wording of a known refusal', async () => {
    run.rejects(exposable(ErrorKeyEnum.badSimulationRequest, 400, 'Invalid plugin: must be a valid installed plugin'))

    expect(await SimulationDao.run(request())).to.deep.equal({
      error: 'Invalid plugin: must be a valid installed plugin',
      errorKey: ErrorKeyEnum.badSimulationRequest,
      status: 400,
    })
    expect(warn.calledOnceWith('Simulation: run rejected' as any)).to.be.true
  })

  for (const operation of [
    ITenderlyOperation.pluginActions,
    ITenderlyOperation.proposal,
    ITenderlyOperation.dispatch,
  ]) {
    it(`logs a warn with the key when the budget refuses a ${operation} simulation`, async () => {
      run.rejects(exposable(ErrorKeyEnum.simulationBudgetExhausted))

      const reply = await SimulationDao.run({ ...request(), operation } as any)

      expect(reply).to.include({ errorKey: ErrorKeyEnum.simulationBudgetExhausted, status: 429 })
      expect(warn.calledOnce).to.be.true
      expect(warn.firstCall.args[0]).to.equal('Simulation: run rejected')
      expect(warn.firstCall.args[1]).to.include({ errorKey: ErrorKeyEnum.simulationBudgetExhausted })
    })
  }

  it('replies too busy and logs when the run failed for an unknown reason', async () => {
    run.rejects(new Error('down'))

    expect(await SimulationDao.run(request())).to.deep.equal({
      error: ERRORS[ErrorKeyEnum.tooBusy].description,
      errorKey: ErrorKeyEnum.tooBusy,
    })
    expect(warn.calledOnce).to.be.true
  })

  it('logs the cause when the run failed for an unknown reason', async () => {
    run.rejects(new Error('socket hang up'))

    await SimulationDao.run(request())

    expect(warn.firstCall.args[0]).to.equal('Simulation: run failed')
    expect(warn.firstCall.args[1]).to.include({ errorKey: ErrorKeyEnum.tooBusy, error: 'socket hang up' })
  })
})
