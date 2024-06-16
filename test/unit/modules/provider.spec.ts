import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Provider from '@modules/provider'
import { NetworksEnum } from '@types'
import { WebSocketProvider } from 'ethers'
import Logger from '@logger'
import config from '@config'
import logger from '@logger'
import utils from '@helpers/utils'

describe('Module: provider', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    await Provider.closeAllNetworks()
    sandbox?.restore()
  })

  describe('connectToNetwork', async () => {
    it('Should connectToNetwork', async () => {
      sandbox.stub(WebSocketProvider.prototype, 'on').callsFake((event: any, callback: any): any => {
        if (event === 'connect') callback()
      })

      const mockUrl = 'wss://ethereum-rpc.publicnode.com'
      const stubLoggerInfo = sandbox.stub(Logger, 'info')
      const stubConfigSet = sandbox.stub(Provider.configState, 'setConfigItem')

      await Provider.connectToNetwork(NetworksEnum.mainnet, mockUrl)

      expect(stubLoggerInfo.calledOnce).to.be.true
      expect(stubConfigSet.calledWith(NetworksEnum.mainnet)).to.be.true
    })

    it('Should fail create connectToNetwork', async () => {
      const mockUrl = 'wss://nonexistent-url.com'
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubReconnect = sandbox.stub(Provider, 'reconnectToNetwork').resolves()

      try {
        await Provider.connectToNetwork(NetworksEnum.mainnet, mockUrl)
      } catch (error) {
        expect(stubLoggerError.calledTwice).to.be.true
        expect(stubReconnect.calledOnce).to.be.true
        expect(stubLoggerError.calledWith('WebSocket error' as any)).to.be.true
      }
    })

    it('Should fail create WebSocketProvider ', async () => {
      const mockNetwork = NetworksEnum.mainnet
      const mockUrl = ''

      const mockWebSocket = {
        onopen: sandbox.stub(),
        onerror: sandbox.stub(),
      }

      sandbox.stub(WebSocketProvider.prototype, 'websocket').get(() => mockWebSocket)
      const stubConfig = sandbox.stub(Provider.configState, 'setConfigItem')
      const stubLogger = sandbox.stub(Logger, 'info')
      const stubLoggerError = sandbox.stub(Logger, 'error')

      const promise = Provider.connectToNetwork(mockNetwork, mockUrl)
      mockWebSocket.onerror()

      try {
        await promise
      } catch (error) {
        expect(stubLoggerError.calledOnce).to.be.true
        expect(stubLoggerError.calledWith('Failed to create WebSocketProvider' as any)).to.be.true
        expect(stubLogger.notCalled).to.be.true
        expect(stubConfig.notCalled).to.be.true
      }
    })

    it('Should trigger reconnect on WebSocket close', async () => {
      const mockUrl = 'wss://ethereum-rpc.publicnode.com'
      const network = NetworksEnum.mainnet

      // Stub the WebSocketProvider and simulate 'close' event
      const provider = new WebSocketProvider(mockUrl)
      sandbox.stub(WebSocketProvider.prototype, 'websocket').value({
        on: (event: any, callback: any) => {
          if (event === 'close') setTimeout(callback, 10) // Simulate close event
          if (event === 'open') callback() // Simulate open event
        },
      })

      const reconnectStub = sandbox.stub(Provider, 'reconnectToNetwork')

      await Provider.connectToNetwork(network, mockUrl)
      await new Promise(resolve => setTimeout(resolve, 50)) // Wait for the close event to be handled

      expect(reconnectStub.calledOnceWith(network, mockUrl)).to.be.true
    })
  })

  describe('connectToAllNetworks', async () => {
    it('should connectToAllNetworks', async () => {
      const backupConfig = config.BLOCKCHAIN_NODES.MAINNET
      config.BLOCKCHAIN_NODES.MAINNET = 'wss://ethereum-rpc.publicnode.com'

      const stubConneect = sandbox.stub(Provider, 'connectToNetwork')
      await Provider.connectToAllNetworks()

      expect(stubConneect.callCount).to.eq(1)
      config.BLOCKCHAIN_NODES.MAINNET = backupConfig
    })

    it('should fail connectToAllNetworks', async () => {
      const stubLoggerError = sandbox.stub(logger, 'warn')
      const stubConneect = sandbox.stub(Provider, 'connectToNetwork')
      await Provider.connectToAllNetworks()

      expect(stubConneect.callCount).to.eq(0)
      expect(stubLoggerError.callCount).to.eq(5)
    })
  })

  describe('reconnectToNetwork', () => {
    it('Should reconnectToNetwork first time', async () => {
      const oldConfig = config.NODE_CONFIG.RECONNECT_INTERVAL
      config.NODE_CONFIG.RECONNECT_INTERVAL = 10
      sandbox.stub(WebSocketProvider.prototype, 'on').callsFake((event: any, callback: any): any => {
        if (event === 'connect') callback()
      })

      const mockUrl = 'wss://ethereum-rpc.publicnode.com'
      const stubLoggerInfo = sandbox.stub(Logger, 'info')
      const stubConnect = sandbox.stub(Provider, 'connectToNetwork').resolves().resolves()

      await Provider.reconnectToNetwork(NetworksEnum.mainnet, mockUrl)
      await utils.wait(20)
      expect(stubLoggerInfo.calledOnce).to.be.true
      expect(stubConnect.calledOnce).to.be.true
      expect(stubConnect.calledWith(NetworksEnum.mainnet, mockUrl)).to.be.true

      config.NODE_CONFIG.RECONNECT_INTERVAL = oldConfig
    })

    it('Should reconnectToNetwork second time', async () => {
      const oldConfig = config.NODE_CONFIG.RECONNECT_INTERVAL
      config.NODE_CONFIG.RECONNECT_INTERVAL = 10
      sandbox.stub(WebSocketProvider.prototype, 'on').callsFake((event: any, callback: any): any => {
        if (event === 'connect') callback()
      })

      const mockUrl = 'wss://ethereum-rpc.publicnode.com'
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubLoggerInfo = sandbox.stub(Logger, 'info')
      const stubConnect = sandbox
        .stub(Provider, 'connectToNetwork')
        .resolves()
        .onFirstCall()
        .rejects(new Error('Error'))
        .onSecondCall()
        .resolves()

      await Provider.reconnectToNetwork(NetworksEnum.mainnet, mockUrl)
      await utils.wait(100)
      expect(stubLoggerInfo.calledTwice).to.be.true
      expect(stubConnect.calledTwice).to.be.true
      expect(stubConnect.calledWith(NetworksEnum.mainnet, mockUrl)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true

      config.NODE_CONFIG.RECONNECT_INTERVAL = oldConfig
    })

    it('Should fail reconnectToNetwork', async () => {
      const oldConfig = config.NODE_CONFIG.RECONNECT_INTERVAL
      config.NODE_CONFIG.RECONNECT_INTERVAL = 0
      sandbox.stub(WebSocketProvider.prototype, 'on').callsFake((event: any, callback: any): any => {
        if (event === 'connect') callback()
      })

      const mockUrl = 'wss://ethereum-rpc.publicnode.com'
      const stubLogger = sandbox.stub(Logger, 'error')

      await Provider.reconnectToNetwork(NetworksEnum.mainnet, mockUrl, 10)

      expect(stubLogger.calledOnce).to.be.true

      config.NODE_CONFIG.RECONNECT_INTERVAL = oldConfig
    })
  })

  describe('closeAllNetworks', () => {
    it('should close all WebSocket connections', async () => {
      const networks = {
        MAINNET: 'wss://mainnet.infura.io/ws/v3/YOUR_PROJECT_ID',
        SEPOLIA: 'wss://sepolia.infura.io/ws/v3/YOUR_PROJECT_ID',
        POLYGON: null,
        BASE: null,
        ARBITRUM: null,
      }

      const backupConfig = config.BLOCKCHAIN_NODES
      config.BLOCKCHAIN_NODES = networks

      const fakeProviders = {
        mainnet: { destroy: sandbox.stub().resolves() },
        sepolia: { destroy: sandbox.stub().resolves() },
      }

      const getConfigStub = sandbox
        .stub(Provider.configState, 'getConfigItem')
        .callsFake(network => fakeProviders[network])
      const loggerInfoStub = sandbox.stub(Logger, 'info')

      await Provider.closeAllNetworks()

      Object.keys(fakeProviders).forEach(network => {
        expect(fakeProviders[network].destroy.calledOnce).to.be.true
        expect(loggerInfoStub.calledWith(`WebSocket connection closed for ${network}` as any)).to.be.true
      })

      expect(getConfigStub.calledWith('mainnet')).to.be.true
      expect(getConfigStub.calledWith('sepolia')).to.be.true

      config.BLOCKCHAIN_NODES = backupConfig
    })
  })
})
