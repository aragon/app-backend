import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Provider from '@modules/provider'
import { NetworksEnum } from '@types'
import { WebSocketProvider } from 'ethers'
import Logger from '@logger'
import config from '@config'

describe('Module: provider', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
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

      try {
        await Provider.connectToNetwork(NetworksEnum.mainnet, mockUrl)
      } catch (error) {
        expect(stubLoggerError.calledOnce).to.be.true
        console.log(stubLoggerError.args)
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
  })

  it('connectToAllNetworks', async () => {
    config.BLOCKCHAIN_NODES.MAINNET = 'wss://ethereum-rpc.publicnode.com'
    const stubConneect = sandbox.stub(Provider, 'connectToNetwork')
    await Provider.connectToAllNetworks()

    expect(stubConneect.callCount).to.eq(4)
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
