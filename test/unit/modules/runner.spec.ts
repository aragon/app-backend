import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Runner from '@modules/runner'
import Connections from '@modules/connections'
import logger from '@logger'

describe.skip('Module: runner', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should start and stop apps correctly', async () => {
    const mockAppStart = sandbox.stub().resolves()
    const mockAppStop = sandbox.stub().resolves()

    const mockConnectionsOpen = sandbox.stub(Connections, 'open').resolves()

    const fakeApps = [
      { app: { start: mockAppStart, stop: mockAppStop, NEED_CONNECTIONS: [] } },
    ]

    Runner(fakeApps)

    // Simulate a graceful shutdown signal
    await process.emit('SIGINT', 'SIGINT')

    expect(mockAppStart.called).to.be.true
    expect(mockAppStop.called).to.be.true
    expect(mockConnectionsOpen.called).to.be.true
  })

  it('handles exceptions during app startup', async () => {
    const mockAppStart = sandbox.stub().rejects(new Error('Startup error'))
    const mockAppStop = sandbox.stub().resolves()
    const stubError = sandbox.stub(logger, 'error').resolves()

    const fakeApps = [
      { app: { start: mockAppStart, stop: mockAppStop, NEED_CONNECTIONS: [] } },
    ]

    Runner(fakeApps)

    await new Promise(resolve => setTimeout(resolve, 10))

    expect(mockAppStart.calledOnce).to.be.true
    expect(stubError.calledOnce).to.be.true
    expect(stubError.calledWith('Unable to start application' as any)).to.be
      .true
  })
})
