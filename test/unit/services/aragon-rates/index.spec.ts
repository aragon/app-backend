import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import RatesService from '@services/aragon-rates/index'
import config from '@config'
import utils from '@helpers/utils'
import { EnumConnection } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import logger from '@logger'
import { FetchRates } from '@services/aragon-rates/fetchRates'
import { FetchDaoTvl } from '@rates/daoTvl'

describe('AragonRates: index', () => {
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

    expect(RatesService.NEED_CONNECTIONS).to.deep.equal([
      EnumConnection.MONGODB,
      EnumConnection.BLOCKCHAIN,
      EnumConnection.RABBITMQ,
    ])

    const configBk = config.SERVICES.ARAGON_RATES.RATES_INTERVAL
    config.SERVICES.ARAGON_RATES.RATES_INTERVAL = 200

    const fetchRatesStub = sandbox.stub(FetchRates, 'start').resolves()
    const fetchDaoTvlStub = sandbox.stub(FetchDaoTvl, 'start').resolves()

    await RatesService.start()
    await utils.wait(100)

    expect(schedulerStub.startTask.calledTwice).to.be.true

    // Verify fetchRates task
    const fetchRatesOptions = schedulerStub.startTask.firstCall.args
    expect(fetchRatesOptions[0]).to.equal('fetchRates')

    // Verify fetchDaoTvl task
    const fetchDaoTvlOptions = schedulerStub.startTask.secondCall.args
    expect(fetchDaoTvlOptions[0]).to.equal('fetchDaoTvl')

    // Simulate the fetchRates task execution
    for (const taskGroup of fetchRatesOptions[1].fn()) {
      for (const task of taskGroup) {
        const taskName = Object.keys(task)[0]
        await task[taskName].start()
      }
    }

    // Simulate the fetchDaoTvl task execution
    for (const taskGroup of fetchDaoTvlOptions[1].fn()) {
      for (const task of taskGroup) {
        const taskName = Object.keys(task)[0]
        await task[taskName].start()
      }
    }

    expect(fetchRatesStub.calledOnce).to.be.true
    expect(fetchDaoTvlStub.calledOnce).to.be.true

    await RatesService.stop()

    expect(schedulerStub.stopTask.calledOnce).to.be.true
    expect(schedulerStub.stopTask.firstCall.args[0]).to.equal('rates')

    config.SERVICES.ARAGON_RATES.RATES_INTERVAL = configBk
  })

  it('Should handle errors and call onError', async () => {
    const stubLoggerError = sandbox.stub(logger, 'error')

    sandbox.stub(TaskSchedulerState.prototype, 'startTask').callsFake((_: string, options: any): any => {
      options?.onError(new Error('Task error'))
    })

    await RatesService.start()

    // Should be called twice because there are two tasks with onError handlers
    expect(stubLoggerError.callCount).to.equal(2)
    expect(stubLoggerError.firstCall.args[0]).to.equal('RatesService task error')
    expect(stubLoggerError.secondCall.args[0]).to.equal('RatesService daoTvl task error')
  })
})
