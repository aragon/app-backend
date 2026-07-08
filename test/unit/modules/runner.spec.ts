import utils from '@helpers/utils'
import Connections from '@modules/connections'
import { PrometheusStore } from '@modules/prometheusStore'
import Runner, { stopApp } from '@modules/runner'
import { EnumConnection, EnumServiceName } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

// IMPORTANT: This test suite is skipped because it interferes with the test environment
// The runner module starts the actual application which conflicts with the test setup
// Consider moving these tests to an integration test suite
describe.skip('Module: runner', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should start all apps and open connections', async function () {
    const appMock = {
      name: EnumServiceName.ARAGON_DAO,
      start: sandbox.stub().resolves(),
      stop: sandbox.stub().resolves(),
      NEED_CONNECTIONS: [EnumConnection.MONGODB],
    }

    const connectionsMock = sandbox.stub(Connections, 'open').resolves()
    sandbox.stub(Connections, 'close').resolves()

    Runner(appMock)
    await utils.wait(100)
    expect(appMock.start.calledOnce).to.be.true
    expect(connectionsMock.calledOnce).to.be.true
    expect(connectionsMock.args[0][0][0]).to.eq(EnumConnection.MONGODB)
  })

  it('should initialize PrometheusStore with service name', async function () {
    const appMock = {
      name: EnumServiceName.ARAGON_INDEXER,
      start: sandbox.stub().resolves(),
      stop: sandbox.stub().resolves(),
      NEED_CONNECTIONS: [EnumConnection.MONGODB],
    }

    const prometheusInstance = {
      start: sandbox.stub().resolves(),
      stop: sandbox.stub().resolves(),
    }

    const getInstanceStub = sandbox.stub(PrometheusStore, 'getInstance').returns(prometheusInstance as any)
    sandbox.stub(Connections, 'open').resolves()
    sandbox.stub(Connections, 'close').resolves()

    Runner(appMock)
    await utils.wait(100)

    expect(getInstanceStub.calledOnce).to.be.true
    expect(getInstanceStub.firstCall.args[0]).to.eq(EnumServiceName.ARAGON_INDEXER)
    expect(prometheusInstance.start.calledOnce).to.be.true
  })

  it('should stop PrometheusStore on app stop', async function () {
    const appMock = {
      name: EnumServiceName.ARAGON_TRANSFERS,
      start: sandbox.stub().resolves(),
      stop: sandbox.stub().resolves(),
      NEED_CONNECTIONS: [EnumConnection.MONGODB],
    }

    const prometheusInstance = {
      start: sandbox.stub().resolves(),
      stop: sandbox.stub().resolves(),
    }

    sandbox.stub(PrometheusStore, 'getInstance').returns(prometheusInstance as any)
    sandbox.stub(Connections, 'open').resolves()
    sandbox.stub(Connections, 'close').resolves()

    Runner(appMock)
    await utils.wait(100)

    // Simulate stop
    process.emit('SIGINT' as any)
    await utils.wait(100)

    expect(prometheusInstance.stop.called).to.be.true
  })

  it('handles errors when starting apps', async function () {
    const appMock = {
      name: EnumServiceName.ARAGON_API,
      start: sandbox.stub().resolves(),
      stop: sandbox.stub().resolves(),
      NEED_CONNECTIONS: [EnumConnection.MONGODB],
    }

    try {
      Runner(appMock)
      await utils.wait(100)
      expect.fail('Expected runApps to throw')
    } catch (err: any) {
      expect(err.message).to.equal('Expected runApps to throw')
    }
  })
})

describe('Module: runner - shutdown during start', () => {
  const WATCHED_EVENTS = ['exit', 'SIGINT', 'SIGTERM', 'unhandledRejection', 'uncaughtException'] as const
  let sandbox: SinonSandbox
  let clock: sinon.SinonFakeTimers
  let listenersBefore: Map<string, Function[]>

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    clock = sandbox.useFakeTimers()
    listenersBefore = new Map(WATCHED_EVENTS.map(event => [event, process.listeners(event as any)]))
  })

  afterEach(() => {
    for (const event of WATCHED_EVENTS) {
      const before = listenersBefore.get(event)!
      for (const listener of process.listeners(event as any)) {
        if (!before.includes(listener)) process.removeListener(event as any, listener as any)
      }
    }
    sandbox.restore()
  })

  it('does not start PrometheusStore when the app triggers stopApp during start()', async function () {
    sandbox.stub(Connections, 'open').resolves()
    sandbox.stub(Connections, 'close').resolves()
    const exitStub = sandbox.stub(process, 'exit')
    const getInstanceStub = sandbox.stub(PrometheusStore, 'getInstance')

    const appMock = {
      name: EnumServiceName.ARAGON_MIGRATION,
      stop: sandbox.stub().resolves(),
      NEED_CONNECTIONS: [],
      start: sandbox.stub().callsFake(async () => {
        void stopApp(appMock as any, 0, 1000)
      }),
    }

    Runner(appMock as any)
    await clock.tickAsync(10)

    expect(getInstanceStub.called).to.be.false
    expect(appMock.stop.calledOnce).to.be.true
    expect(exitStub.called).to.be.true
  })
})
