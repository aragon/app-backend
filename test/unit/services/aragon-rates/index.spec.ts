import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import RatesService from '@services/aragon-rates/index'
import { FetchRates } from '@services/aragon-rates/fetchRates'
import config from '@config'
import utils from '@helpers/utils'
import { EnumConnection } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import logger from '@logger'
import { DaoTvl } from '@rates/daoTvl'

describe('Rates: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should start, schedule tasks, and stop', async () => {
    let schedulerStub = sandbox.createStubInstance(TaskSchedulerState)
    sandbox.stub(TaskSchedulerState, 'getInstance').returns(schedulerStub)

    expect(RatesService.NEED_CONNECTIONS).to.deep.equal([EnumConnection.MONGODB])

    const configBk = config.SERVICES.ARAGON_RATES.RATES_INTERVAL
    config.SERVICES.ARAGON_RATES.RATES_INTERVAL = 200

    const taskStubs = [sandbox.stub(FetchRates, 'start').resolves()]
    const task2Stubs = [sandbox.stub(DaoTvl, 'start').resolves()]

    await RatesService.start()
    await utils.wait(100)

    expect(schedulerStub.startTask.calledOnce).to.be.true
    const taskOptions = schedulerStub.startTask.firstCall.args[1]

    // Simulate the task execution
    for (const taskGroup of taskOptions.fn()) {
      for (const task of taskGroup) {
        await task()
      }
    }

    expect(taskStubs.every(stub => stub.calledOnce)).to.be.true
    expect(task2Stubs.every(stub => stub.calledOnce)).to.be.true

    await RatesService.stop()

    expect(schedulerStub.stopTask.calledOnce).to.be.true

    config.SERVICES.ARAGON_RATES.RATES_INTERVAL = configBk
  })

  it('Should handle errors and call onError', async () => {
    const stubLoggerError = sandbox.stub(logger, 'error')

    sandbox.stub(TaskSchedulerState.prototype, 'startTask').callsFake((_: string, options: any): any => {
      options?.onError(true)
    })

    await RatesService.start()

    expect(stubLoggerError.calledOnce).to.be.true
  })
})
