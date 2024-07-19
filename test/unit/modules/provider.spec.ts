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
})
