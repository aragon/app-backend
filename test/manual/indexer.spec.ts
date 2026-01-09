import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import IndexerService from '@services/aragon-indexer'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Manual: Indexer', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('index', async function () {
    this.timeout(1000000000000000)
    await IndexerService.start()
    console.log('end')
  })

  it('test taskScheduled', async function () {
    this.timeout(1000000000000000)

    const fakeService = {
      start: sandbox.stub().resolves(),
    }

    const failingService = {
      start: sandbox.stub().rejects(new Error('Service failed')),
    }

    const logFastTasks = [
      [{ logPluginRepoRegistry: failingService }, { logDaoRegistry: fakeService }],
      [{ logPluginSetupProcessor: fakeService }, { logDao: fakeService }],
      [{ logProposal: fakeService }, { logPluginSetting: fakeService }],
      [{ logMember: fakeService }],
    ]

    const aggregatorTasks = [
      [{ aggregatorPlugin: fakeService }],
      [{ aggregatorSetting: fakeService }],
      [{ aggregatorDao: fakeService }],
      [{ aggregatorDelegate: fakeService }],
      [{ aggregatorMembers: fakeService }],
      [{ aggregatorProposal: fakeService }],
      [{ aggregatorVote: fakeService }],
    ]

    const taskOptions = {
      fn: () => [...logFastTasks, ...aggregatorTasks],
      interval: config.SERVICES.ARAGON_INDEXER.DAO_INTERVAL,
      runNow: true,
      stopOnError: false,
      onError: (error: any) => {
        console.log('error', error)
      },
    }

    const scheduler = TaskSchedulerState.getInstance()
    await scheduler.startTask('indexer', taskOptions)

    await scheduler.stopTask('indexer')
    console.log(scheduler.getTaskStatus())

    // Query and print the data from the database
    const taskServiceData = await Models.TaskService.findOne({ serviceName: 'indexer' })
    const taskRunData = await Models.TaskRun.find({ serviceName: 'indexer' })

    logger.info(`TaskService data: ${JSON.stringify(taskServiceData, null, 2)}`)
    logger.info(`TaskRun data: ${JSON.stringify(taskRunData, null, 2)}`)

    console.log('end')
  })
})
