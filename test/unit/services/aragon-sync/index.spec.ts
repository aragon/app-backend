import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import AragonSyncService from '@services/aragon-sync/index'
import config from '@config'
import utils from '@helpers/utils'
import { EnumConnection, NetworksEnum } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import logger from '@logger'
import { NetworkHelper } from '@helpers/network'
import Utils from '@helpers/utils'
import ProviderModule from '@modules/provider'
import PluginDetector from '@helpers/pluginDetector'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { PluginSlug } from '@helpers/pluginSlug'

describe('AragonSync: index', () => {
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

    expect(AragonSyncService.NEED_CONNECTIONS).to.deep.equal([
      EnumConnection.MONGODB,
      EnumConnection.BLOCKCHAIN,
      EnumConnection.RABBITMQ,
    ])

    const configBk = config.SERVICES.ARAGON_SYNC.SYNC_INTERVAL
    config.SERVICES.ARAGON_SYNC.SYNC_INTERVAL = 200

    const taskStubs = [sandbox.stub(AragonSyncService, 'execute').resolves()]

    await AragonSyncService.start()
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

    await AragonSyncService.stop()

    expect(schedulerStub.stopTask.calledOnce).to.be.true

    config.SERVICES.ARAGON_SYNC.SYNC_INTERVAL = configBk
  })

  it('Should execute', async () => {
    const fakePlugin = {
      address: 'fake-address',
      network: NetworksEnum.ethereumMainnet,
    }
    const stubLogger = sandbox.stub(logger, 'verbose')
    const stubProvider = sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(true)
    const stubPluginFind = sandbox.stub(Models.Plugin, 'find').resolves([fakePlugin])
    const stubFindPluginSlug = sandbox.stub(Models.PluginSlug, 'findOne').resolves(false)
    const stubGeneratePluginSlug = sandbox.stub(PluginSlug, 'generateSlug').resolves()
    const stubSendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(NetworkHelper, 'supportedNetworks').returns([{ networkName: fakePlugin.network } as any])

    await AragonSyncService.execute()

    expect(stubLogger.calledTwice).to.be.true
    expect(stubProvider.calledOnce).to.be.true
    expect(stubPluginFind.calledOnceWith({ forceSync: true, network: fakePlugin.network })).to.be.true
    expect(stubFindPluginSlug.calledOnce).to.be.true
    expect(stubGeneratePluginSlug.calledOnce).to.be.true
    expect(stubSendMessage.calledOnce).to.be.true
  })

  it('Should handle errors and call onError', async () => {
    const stubLoggerError = sandbox.stub(logger, 'error')

    sandbox.stub(TaskSchedulerState.prototype, 'startTask').callsFake((_: string, options: any): any => {
      options?.onError(new Error('Task error'))
    })

    await AragonSyncService.start()

    expect(stubLoggerError.calledOnceWith('SyncService task error' as any)).to.be.true
  })
})
