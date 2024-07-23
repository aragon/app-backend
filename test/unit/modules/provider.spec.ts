import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ProviderModule from '@modules/provider'
import { NetworksEnum } from '@types'
import { WebSocketProvider } from 'ethers'
import Logger from '@logger'
import config from '@config'
import { MockWebSocket } from '@test/mock/fakeProvider'

describe('Module: provider', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    await ProviderModule.closeAllNetworks()
    sandbox?.restore()
  })

  it('networksMap', () => {
    expect(ProviderModule.networksMap.ETHEREUM_MAINNET).to.equal(NetworksEnum.ethereumMainnet)
    expect(ProviderModule.networksMap.ETHEREUM_SEPOLIA).to.equal(NetworksEnum.ethereumSepolia)
    expect(ProviderModule.networksMap.POLYGON_MAINNET).to.equal(NetworksEnum.polygonMainnet)
    expect(ProviderModule.networksMap.BASE_MAINNET).to.equal(NetworksEnum.baseMainnet)
    expect(ProviderModule.networksMap.ZKSYNC_SEPOLIA).to.equal(NetworksEnum.zksyncSepolia)
    expect(ProviderModule.networksMap.ZKSYNC_MAINNET).to.equal(NetworksEnum.zksyncMainnet)
  })

  it('should correctly parse ETHEREUM_MAINNET to NetworksEnum.ethereumMainnet', () => {
    const result = ProviderModule.parseNetwork('ETHEREUM_MAINNET')
    expect(result).to.equal(NetworksEnum.ethereumMainnet)

    const result2 = ProviderModule.parseNetwork('ETHEREUM_SEPOLIA')
    expect(result2).to.equal(NetworksEnum.ethereumSepolia)

    const result3 = ProviderModule.parseNetwork('POLYGON_MAINNET')
    expect(result3).to.equal(NetworksEnum.polygonMainnet)

    const result4 = ProviderModule.parseNetwork('BASE_MAINNET')
    expect(result4).to.equal(NetworksEnum.baseMainnet)

    const result5 = ProviderModule.parseNetwork('ARBITRUM_MAINNET')
    expect(result5).to.equal(NetworksEnum.arbitrumMainnet)

    const result6 = ProviderModule.parseNetwork('ZKSYNC_SEPOLIA')
    expect(result6).to.equal(NetworksEnum.zksyncSepolia)

    const result7 = ProviderModule.parseNetwork('ZKSYNC_MAINNET')
    expect(result7).to.equal(NetworksEnum.zksyncMainnet)
  })

  describe('connectToNetwork', () => {
    it('should connect to network', async () => {
      const mockUrl = 'wss://ethereum-rpc.publicnode.com'
      const stubProviderModule = sandbox
        .stub(ProviderModule, 'attachEventListeners')
        .callsFake((provider, network, nodeUrl, resolve) => {
          resolve(provider)
        })

      const mockWebSocket = new MockWebSocket()

      sandbox.stub(WebSocketProvider.prototype, 'constructor' as any).callsFake(function (this: WebSocketProvider) {
        this['websocket' as any] = mockWebSocket
        return this
      })

      await ProviderModule.connectToNetwork(NetworksEnum.ethereumMainnet, mockUrl)

      expect(stubProviderModule.calledOnce).to.be.true
      expect(ProviderModule.getProvider(NetworksEnum.ethereumMainnet)).to.not.be.undefined
    })

    it('should update network', async () => {
      const mockUrl = 'wss://ethereum-rpc.publicnode.com'
      const stubProviderModule = sandbox
        .stub(ProviderModule, 'attachEventListeners')
        .callsFake((provider, network, nodeUrl, resolve) => {
          resolve(provider)
        })

      const mockWebSocket = new MockWebSocket()

      sandbox.stub(WebSocketProvider.prototype, 'constructor' as any).callsFake(function (this: WebSocketProvider) {
        this['websocket' as any] = mockWebSocket
        return this
      })
      const stubUpdateProvider = sandbox.stub()
      ProviderModule.providerProxies[NetworksEnum.ethereumMainnet] = { updateProvider: stubUpdateProvider } as any

      await ProviderModule.connectToNetwork(NetworksEnum.ethereumMainnet, mockUrl)

      expect(stubUpdateProvider.calledOnce).to.be.true
      expect(stubProviderModule.calledOnce).to.be.true
      expect(ProviderModule.getProvider(NetworksEnum.ethereumMainnet)).to.not.be.undefined
    })

    it('should fail', async () => {
      const mockUrl = 'wss://ethereum-rpc.publicnode.com'
      const stubProviderModule = sandbox.stub(ProviderModule, 'attachEventListeners').throws(new Error('fake-error'))
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(WebSocketProvider.prototype, 'constructor' as any)

      await expect(ProviderModule.connectToNetwork(NetworksEnum.ethereumMainnet, mockUrl)).to.be.rejectedWith(
        Error,
        'fake-error',
      )

      expect(stubLogger.calledOnce).to.be.true
      expect(stubProviderModule.calledOnce).to.be.true
    })
  })

  describe('connectToAllNetworks', () => {
    it('should connect to all configured networks', async () => {
      const backupConfig = config.BLOCKCHAIN_NODES.ETHEREUM_MAINNET
      config.BLOCKCHAIN_NODES.ETHEREUM_MAINNET = 'wss://ethereum-rpc.publicnode.com'

      const stubConnect = sandbox.stub(ProviderModule, 'connectToNetwork').resolves()
      await ProviderModule.connectToAllNetworks()

      expect(stubConnect.callCount).to.eq(1)
      config.BLOCKCHAIN_NODES.ETHEREUM_MAINNET = backupConfig
    })

    it('should handle missing node URLs', async () => {
      const stubLoggerWarn = sandbox.stub(Logger, 'warn')
      const stubConnect = sandbox.stub(ProviderModule, 'connectToNetwork').resolves()
      await ProviderModule.connectToAllNetworks()

      expect(stubConnect.callCount).to.eq(0)
      expect(stubLoggerWarn.callCount).to.eq(7)
    })
  })

  describe('closeAllNetworks', () => {
    it('should close all WebSocket connections', async () => {
      const networks = {
        ETHEREUM_MAINNET: 'wss://mainnet.infura.io/ws/v3/YOUR_PROJECT_ID',
        ETHEREUM_SEPOLIA: 'wss://sepolia.infura.io/ws/v3/YOUR_PROJECT_ID',
        POLYGON_MAINNET: null,
        BASE_MAINNET: null,
        ARBITRUM_MAINNET: null,
        ZKSYNC_SEPOLIA: null,
        ZKSYNC_MAINNET: null,
      }

      const backupConfig = config.BLOCKCHAIN_NODES
      config.BLOCKCHAIN_NODES = networks

      const fakeProviders = {
        [NetworksEnum.ethereumMainnet]: { destroy: sandbox.stub().resolves() },
        [NetworksEnum.ethereumSepolia]: { destroy: sandbox.stub().resolves() },
      }

      ProviderModule.providerProxies = fakeProviders as any

      const loggerInfoStub = sandbox.stub(Logger, 'info')

      await ProviderModule.closeAllNetworks()

      Object.keys(fakeProviders).forEach(network => {
        expect(fakeProviders[network].destroy.calledOnce).to.be.true
        expect(loggerInfoStub.calledWith(`WebSocket connection closed for ${network}` as any)).to.be.true
      })

      config.BLOCKCHAIN_NODES = backupConfig
    })
  })

  describe('attachEventListeners', () => {
    it('should attach open event listener and resolve on open', () => {
      const mockWebSocket = new MockWebSocket()
      const mockProvider = { websocket: mockWebSocket } as any
      const mockResolve = sandbox.stub()
      const stubLoggerInfo = sandbox.stub(Logger, 'info')

      ProviderModule.attachEventListeners(mockProvider, NetworksEnum.ethereumMainnet, 'wss://mock-url', mockResolve)

      mockWebSocket.onopen()
      expect(stubLoggerInfo.calledOnceWith(`WebSocket connected successfully to ethereum-mainnet` as any)).to.be.true
      expect(mockResolve.calledOnce).to.be.true
    })

    it('should attach close event listener and log error on close', () => {
      const mockWebSocket = new MockWebSocket()
      const mockProvider = { websocket: mockWebSocket } as any
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubReconnect = sandbox.stub(ProviderModule, 'reconnectToNetwork').resolves()

      ProviderModule.attachEventListeners(mockProvider, NetworksEnum.ethereumMainnet, 'wss://mock-url')

      mockWebSocket.onclose()
      expect(
        stubLoggerError.calledOnceWith(
          `WebSocket connection closed unexpectedly for ethereum-mainnet. Attempting to reconnect...` as any,
        ),
      ).to.be.true
      expect(stubReconnect.calledOnce).to.be.true
    })

    it('should attach error event listener and reject on error', () => {
      const mockWebSocket = new MockWebSocket()
      const mockProvider = { websocket: mockWebSocket } as any
      const mockReject = sandbox.stub()
      const stubLoggerError = sandbox.stub(Logger, 'error')

      ProviderModule.attachEventListeners(
        mockProvider,
        NetworksEnum.ethereumMainnet,
        'wss://mock-url',
        undefined,
        mockReject,
      )

      const error = new Error('test error')
      mockWebSocket.onerror(error)
      expect(mockReject.calledOnceWith(error)).to.be.true
    })
  })

  describe('reconnectToNetwork', () => {
    it('should attempt to reconnect to network and succeed', async () => {
      const maxAttempts = config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS
      const reconnectinterval = config.NODE_CONFIG.RECONNECT_INTERVAL
      config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS = 1
      config.NODE_CONFIG.RECONNECT_INTERVAL = 50

      const network = NetworksEnum.ethereumMainnet
      const nodeUrl = 'wss://mock-url'
      const stubConnect = sandbox.stub(ProviderModule, 'connectToNetwork').resolves()
      const stubLoggerInfo = sandbox.stub(Logger, 'info')
      const stubLoggerError = sandbox.stub(Logger, 'error')

      await ProviderModule.reconnectToNetwork(network, nodeUrl, 0)

      expect(stubConnect.calledOnce).to.be.true
      expect(stubLoggerInfo.calledWith(`Reconnecting to ${network}... Attempt 1` as any)).to.be.true
      expect(stubLoggerError.notCalled).to.be.true

      config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS = maxAttempts
      config.NODE_CONFIG.RECONNECT_INTERVAL = reconnectinterval
    })

    it('should attempt to reconnect to network and fail, then retry', async () => {
      const maxAttempts = config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS
      const reconnectInterval = config.NODE_CONFIG.RECONNECT_INTERVAL
      config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS = 2
      config.NODE_CONFIG.RECONNECT_INTERVAL = 50

      const network = NetworksEnum.ethereumMainnet
      const nodeUrl = 'wss://mock-url'
      let attempt = 0

      sandbox.stub(ProviderModule, 'connectToNetwork').callsFake(async () => {
        if (attempt === 0) {
          attempt++
          throw new Error('connection error')
        }
        return Promise.resolve()
      })

      const stubLoggerInfo = sandbox.stub(Logger, 'info')
      const stubLoggerError = sandbox.stub(Logger, 'error')

      await ProviderModule.reconnectToNetwork(network, nodeUrl, 0)

      expect(stubLoggerInfo.calledWith(`Reconnecting to ${network}... Attempt 1` as any)).to.be.true
      expect(stubLoggerInfo.calledWith(`Reconnecting to ${network}... Attempt 2` as any)).to.be.true
      expect(stubLoggerError.calledWith(`Reconnection attempt 1 failed for ${network}` as any)).to.be.true

      config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS = maxAttempts
      config.NODE_CONFIG.RECONNECT_INTERVAL = reconnectInterval
    })

    it('should stop retrying after reaching max attempts', async () => {
      const maxAttempts = config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS
      const reconnectInterval = config.NODE_CONFIG.RECONNECT_INTERVAL
      config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS = 1
      config.NODE_CONFIG.RECONNECT_INTERVAL = 50

      const network = NetworksEnum.ethereumMainnet
      const nodeUrl = 'wss://mock-url'
      const stubConnect = sandbox.stub(ProviderModule, 'connectToNetwork').rejects(new Error('connection error'))
      const stubReconnect = sandbox.stub(ProviderModule, 'reconnectToNetwork').callThrough()
      const stubLoggerError = sandbox.stub(Logger, 'error')

      await ProviderModule.reconnectToNetwork(network, nodeUrl, 1)

      expect(stubConnect.notCalled).to.be.true
      expect(stubReconnect.calledOnce).to.be.true
      expect(stubLoggerError.calledWith(`Max reconnect attempts reached for ${network}` as any)).to.be.true

      config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS = maxAttempts
      config.NODE_CONFIG.RECONNECT_INTERVAL = reconnectInterval
    })
  })
})
