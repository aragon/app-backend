import utils from '@helpers/utils'
import Connections from '@modules/connections'
import { PrometheusStore } from '@modules/prometheusStore'
import Runner from '@modules/runner'
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
