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
import provider from '@modules/provider'

describe('Module: provider', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    await Provider.closeAllNetworks()
    sandbox?.restore()
  })

  it('networksMap', () => {
    expect(provider.networksMap.ETHEREUM_MAINNET).to.equal(NetworksEnum.ethereumMainnet)
    expect(provider.networksMap.ETHEREUM_SEPOLIA).to.equal(NetworksEnum.ethereumSepolia)
    expect(provider.networksMap.POLYGON_MAINNET).to.equal(NetworksEnum.polygonMainnet)
    expect(provider.networksMap.BASE_MAINNET).to.equal(NetworksEnum.baseMainnet)
  })

  it('should correctly parse ETHEREUM_MAINNET to NetworksEnum.ethereumMainnet', () => {
    const result = provider.parseNetwork('ETHEREUM_MAINNET')
    expect(result).to.equal(NetworksEnum.ethereumMainnet)

    const result2 = provider.parseNetwork('ETHEREUM_SEPOLIA')
    expect(result2).to.equal(NetworksEnum.ethereumSepolia)

    const result3 = provider.parseNetwork('POLYGON_MAINNET')
    expect(result3).to.equal(NetworksEnum.polygonMainnet)

    const result4 = provider.parseNetwork('BASE_MAINNET')
    expect(result4).to.equal(NetworksEnum.baseMainnet)

    const result5 = provider.parseNetwork('ARBITRUM_MAINNET')
    expect(result5).to.equal(NetworksEnum.arbitrumMainnet)

    const result6 = provider.parseNetwork('ZKSYNC_SEPOLIA')
    expect(result6).to.equal(NetworksEnum.zksyncSepolia)
  })

  describe('connectToNetwork', async () => {
    it('Should connectToNetwork', async () => {
      sandbox.stub(WebSocketProvider.prototype, 'on').callsFake((event: any, callback: any): any => {
        if (event === 'connect') callback()
      })

      const mockUrl = 'wss://ethereum-rpc.publicnode.com'
      const stubLoggerInfo = sandbox.stub(Logger, 'info')
      const stubConfigSet = sandbox.stub(Provider.configState, 'setConfigItem')

      await Provider.connectToNetwork(NetworksEnum.ethereumMainnet, mockUrl)

      expect(stubLoggerInfo.calledOnce).to.be.true
      expect(stubConfigSet.calledWith(NetworksEnum.ethereumMainnet)).to.be.true
    })

    it('Should fail create connectToNetwork', async () => {
      const mockUrl = 'wss://nonexistent-url.com'
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubReconnect = sandbox.stub(Provider, 'reconnectToNetwork').resolves()

      try {
        await Provider.connectToNetwork(NetworksEnum.ethereumMainnet, mockUrl)
      } catch (error) {
        expect(stubLoggerError.calledTwice).to.be.true
        expect(stubReconnect.calledOnce).to.be.true
        expect(stubLoggerError.calledWith('WebSocket error' as any)).to.be.true
      }
    })

    it('Should fail create WebSocketProvider ', async () => {
      const mockNetwork = NetworksEnum.ethereumMainnet
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
      const network = NetworksEnum.ethereumMainnet

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
      const backupConfig = config.BLOCKCHAIN_NODES.ETHEREUM_MAINNET
      config.BLOCKCHAIN_NODES.ETHEREUM_MAINNET = 'wss://ethereum-rpc.publicnode.com'

      const stubConneect = sandbox.stub(Provider, 'connectToNetwork')
      await Provider.connectToAllNetworks()

      expect(stubConneect.callCount).to.eq(1)
      config.BLOCKCHAIN_NODES.ETHEREUM_MAINNET = backupConfig
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

      await Provider.reconnectToNetwork(NetworksEnum.ethereumMainnet, mockUrl)
      await utils.wait(20)
      expect(stubLoggerInfo.calledOnce).to.be.true
      expect(stubConnect.calledOnce).to.be.true
      expect(stubConnect.calledWith(NetworksEnum.ethereumMainnet, mockUrl)).to.be.true

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

      await Provider.reconnectToNetwork(NetworksEnum.ethereumMainnet, mockUrl)
      await utils.wait(100)
      expect(stubLoggerInfo.calledTwice).to.be.true
      expect(stubConnect.calledTwice).to.be.true
      expect(stubConnect.calledWith(NetworksEnum.ethereumMainnet, mockUrl)).to.be.true
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

      const result = await Provider.reconnectToNetwork(NetworksEnum.ethereumMainnet, mockUrl, 10)

      expect(result).to.eq(undefined)
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith(`Max reconnect attempts reached for ${NetworksEnum.ethereumMainnet}` as any)).to.be
        .true

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
      }

      const backupConfig = config.BLOCKCHAIN_NODES
      config.BLOCKCHAIN_NODES = networks

      const fakeProviders = {
        [NetworksEnum.ethereumMainnet]: { destroy: sandbox.stub().resolves() },
        [NetworksEnum.ethereumSepolia]: { destroy: sandbox.stub().resolves() },
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

      expect(getConfigStub.calledWith(NetworksEnum.ethereumMainnet)).to.be.true
      expect(getConfigStub.calledWith(NetworksEnum.ethereumSepolia)).to.be.true

      config.BLOCKCHAIN_NODES = backupConfig
    })
  })
})
