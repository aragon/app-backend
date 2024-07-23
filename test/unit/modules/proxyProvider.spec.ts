import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IWebSocketProvider, IWebSocketStatus } from '@types'
import Logger from '@logger'
import { createProviderProxy } from '@modules/proxyProvider'

interface IWebSocketProviderMock extends IWebSocketProvider {
  someMethod: sinon.SinonStub
}

describe('Module: proxyProvider', () => {
  let sandbox: SinonSandbox
  let mockProvider: IWebSocketProviderMock
  let mockWebSocket: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    mockWebSocket = {
      readyState: IWebSocketStatus.CONNECTING,
    }
    mockProvider = {
      websocket: mockWebSocket,
      someMethod: sandbox.stub().resolves('result'),
    } as unknown as IWebSocketProviderMock
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should update the provider', async () => {
    const stubLogger = sandbox.stub(Logger, 'verbose')
    const proxy = createProviderProxy(mockProvider) as IWebSocketProviderMock
    const newMockProvider = {
      websocket: { readyState: IWebSocketStatus.OPEN },
      someMethod: sandbox.stub().resolves('result'),
    } as unknown as IWebSocketProviderMock

    proxy.updateProvider(newMockProvider)

    console.log('stubLogger', stubLogger.callCount)
    expect(stubLogger.calledOnce).to.be.true
    expect(await proxy.someMethod()).to.equal('result')
  })

  it('should wait for connection to open before calling method', async function () {
    this.timeout(5000) // Increase timeout for this test

    const proxy = createProviderProxy(mockProvider) as IWebSocketProviderMock
    const logSpy = sandbox.spy(Logger, 'verbose')

    // Simulate the connection opening after a short delay
    setTimeout(() => {
      mockWebSocket.readyState = IWebSocketStatus.OPEN
    }, 150)

    const resultPromise = proxy.someMethod()

    // We need to wait a bit to let the setTimeout in the tested function to be called
    await new Promise(resolve => setTimeout(resolve, 200))

    const result = await resultPromise
    expect(result).to.equal('result')
    expect(logSpy.calledWith('wait to reconnect' as any)).to.be.true
    expect(logSpy.calledWith('connection open' as any)).to.be.true
  })

  it('should call method immediately if connection is already open', async () => {
    mockWebSocket.readyState = IWebSocketStatus.OPEN
    const proxy = createProviderProxy(mockProvider) as IWebSocketProviderMock
    const stubLog = sandbox.stub(Logger, 'verbose')

    const result = await proxy.someMethod()

    expect(result).to.equal('result')
    expect(stubLog.neverCalledWith('wait to reconnect' as any)).to.be.true
  })

  it('should return a proxy with the expected methods and behavior', async () => {
    const proxy = createProviderProxy(mockProvider) as IWebSocketProviderMock

    expect(proxy.updateProvider).to.be.a('function')

    mockWebSocket.readyState = IWebSocketStatus.OPEN
    const result = await proxy.someMethod()
    expect(result).to.equal('result')
  })
})
