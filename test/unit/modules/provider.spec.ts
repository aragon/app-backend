import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ProviderModule from '@modules/provider'
import { NetworksEnum } from '@types'
import { WebSocketProvider } from 'ethers'
import Logger from '@logger'
import config from '@config'
import utils from '@helpers/utils'
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
    it('should connect to network successfully', async () => {
      const mockUrl = 'wss://ethereum-rpc.publicnode.com'
      const stubLoggerInfo = sandbox.stub(Logger, 'info')
      const stubConfigSet = sandbox.stub(ProviderModule.configState, 'setConfigItem')

      const mockWebSocket = new MockWebSocket()

      sandbox.stub(WebSocketProvider.prototype, 'constructor' as any).callsFake(function () {
        return mockWebSocket
      })

      await ProviderModule.connectToNetwork(NetworksEnum.ethereumMainnet, mockUrl)

      // Simulate the WebSocket open event
      if (mockWebSocket.onopen) {
        mockWebSocket.onopen()
      }

      expect(stubLoggerInfo.calledOnce).to.be.true
      expect(stubConfigSet.calledOnceWith(NetworksEnum.ethereumMainnet)).to.be.true
    })

    it('should handle WebSocket error during connection', async () => {
      const backupConfig = config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS
      config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS = 0
      const mockNetwork = NetworksEnum.ethereumMainnet
      const mockUrl = 'wss://invalid-url.com'
      const stubLoggerError = sandbox.stub(Logger, 'error')

      const mockWebSocket = new MockWebSocket()
      sandbox.stub(WebSocketProvider.prototype, 'constructor' as any).callsFake((url: any) => {
        if (url === mockUrl) {
          return mockWebSocket
        } else {
          throw new Error('Unexpected URL')
        }
      })
      try {
        await ProviderModule.connectToNetwork(mockNetwork, mockUrl)
        if (mockWebSocket.onerror) {
          mockWebSocket.onerror(new Error('WebSocket error'))
        }
      } catch (error) {
        expect(stubLoggerError.calledThrice).to.be.true
      }

      config.NODE_CONFIG.MAX_RECONNECT_ATTEMPTS = backupConfig
    })

    it('should handle WebSocket error', async () => {
      const stubError = sandbox.stub(Logger, 'error' as any)
      sandbox.stub(WebSocketProvider.prototype, 'constructor' as any).throws(new Error('Error'))
      await expect(ProviderModule.connectToNetwork(NetworksEnum.ethereumSepolia, 'fake-url')).to.be.rejectedWith(
        Error,
        'fake-url',
      )
      expect(stubError.calledOnce).to.be.true
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

  describe('reconnectToNetwork', () => {
    it('should reconnect on the first attempt', async () => {
      const oldConfig = config.NODE_CONFIG.RECONNECT_INTERVAL
      config.NODE_CONFIG.RECONNECT_INTERVAL = 10

      sandbox.stub(WebSocketProvider.prototype, 'constructor' as any).callsFake(function () {
        return new MockWebSocket()
      })

      const mockUrl = 'wss://ethereum-rpc.publicnode.com'
      const stubLoggerInfo = sandbox.stub(Logger, 'info')
      const stubConnect = sandbox.stub(ProviderModule, 'connectToNetwork').resolves({
        websocket: { addEventListener: sandbox.stub() },
      })

      await ProviderModule.reconnectToNetwork(NetworksEnum.ethereumMainnet, mockUrl)
      await utils.wait(20)

      expect(stubLoggerInfo.calledOnce).to.be.true
      expect(stubConnect.calledOnce).to.be.true

      config.NODE_CONFIG.RECONNECT_INTERVAL = oldConfig
    })

    it('should handle multiple reconnection attempts', async () => {
      const oldConfig = config.NODE_CONFIG.RECONNECT_INTERVAL
      config.NODE_CONFIG.RECONNECT_INTERVAL = 10

      sandbox.stub(WebSocketProvider.prototype, 'constructor' as any).callsFake(function () {
        return new MockWebSocket()
      })

      const mockUrl = 'wss://ethereum-rpc.publicnode.com'
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubLoggerInfo = sandbox.stub(Logger, 'info')
      const stubConnect = sandbox
        .stub(ProviderModule, 'connectToNetwork')
        .resolves()
        .onFirstCall()
        .rejects(new Error('Error'))
        .onSecondCall()
        .resolves({
          websocket: { addEventListener: sandbox.stub() },
        })

      await ProviderModule.reconnectToNetwork(NetworksEnum.ethereumMainnet, mockUrl)
      await utils.wait(100)

      expect(stubLoggerInfo.callCount).to.eq(2)
      expect(stubConnect.callCount).to.eq(2)
      expect(stubLoggerError.callCount).to.eq(1)

      config.NODE_CONFIG.RECONNECT_INTERVAL = oldConfig
    })

    it('should stop attempting to reconnect after reaching max attempts', async () => {
      const oldConfig = config.NODE_CONFIG.RECONNECT_INTERVAL
      config.NODE_CONFIG.RECONNECT_INTERVAL = 5

      sandbox.stub(WebSocketProvider.prototype, 'constructor' as any).callsFake(function () {
        return new MockWebSocket()
      })

      const mockUrl = 'wss://ethereum-rpc.publicnode.com'
      const stubLoggerError = sandbox.stub(Logger, 'error')
      sandbox.stub(ProviderModule, 'connectToNetwork').rejects(new Error('Error'))

      const result = await ProviderModule.reconnectToNetwork(NetworksEnum.ethereumMainnet, mockUrl, 10)

      expect(result).to.eq(undefined)
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.calledWith(`Max reconnect attempts reached for ${NetworksEnum.ethereumMainnet}` as any)).to
        .be.true

      config.NODE_CONFIG.RECONNECT_INTERVAL = oldConfig
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

      const getConfigStub = sandbox
        .stub(ProviderModule.configState, 'getConfigItem')
        .callsFake(network => fakeProviders[network])
      const loggerInfoStub = sandbox.stub(Logger, 'info')

      await ProviderModule.closeAllNetworks()

      Object.keys(fakeProviders).forEach(network => {
        expect(fakeProviders[network].destroy.calledOnce).to.be.true
        expect(loggerInfoStub.calledWith(`WebSocket connection closed for ${network}` as any)).to.be.true
      })

      expect(getConfigStub.calledWith(NetworksEnum.ethereumMainnet)).to.be.true
      expect(getConfigStub.calledWith(NetworksEnum.ethereumSepolia)).to.be.true

      config.BLOCKCHAIN_NODES = backupConfig
    })
  })
})
