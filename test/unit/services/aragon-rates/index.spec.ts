import config from '@config'
import utils from '@helpers/utils'
import logger from '@logger'
import { FetchRates } from '@services/aragon-rates/fetchRates'
import { EnsValidator } from '@services/aragon-rates/handlers/ensValidator'
import { RefreshSpamTokens } from '@services/aragon-rates/handlers/refreshSpamTokens'
import RatesService from '@services/aragon-rates/index'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { EnumConnection } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonRates: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
    const scheduler = TaskSchedulerState.getInstance()
    scheduler.stopAllTasks()
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

    const taskStubs = [
      sandbox.stub(FetchRates, 'start').resolves(),
      sandbox.stub(EnsValidator, 'start').resolves(),
      sandbox.stub(RefreshSpamTokens, 'start').resolves(),
    ]

    await RatesService.start()
    await utils.wait(100)

    expect(schedulerStub.startTask.calledOnce).to.be.true
    const taskOptions = schedulerStub.startTask.firstCall.args[1]

    // Simulate the task execution
    for (const taskGroup of taskOptions.fn()) {
      for (const task of taskGroup) {
        const taskName = Object.keys(task)[0]
        await task[taskName].start()
      }
    }

    expect(taskStubs.every(stub => stub.calledOnce)).to.be.true

    await RatesService.stop()

    expect(schedulerStub.stopTask.calledOnce).to.be.true

    config.SERVICES.ARAGON_RATES.RATES_INTERVAL = configBk
  })

  it('Should handle errors and call onError', async () => {
    const stubLoggerError = sandbox.stub(logger, 'error')

    sandbox.stub(TaskSchedulerState.prototype, 'startTask').callsFake((_: string, options: any): any => {
      options?.onError(new Error('Task error'))
    })

    await RatesService.start()

    expect(stubLoggerError.calledOnceWith('RatesService task error' as any)).to.be.true
  })
})
