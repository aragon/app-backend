import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ProviderModule from '@modules/provider'
import { IWebSocketStatus, NetworksEnum } from '@types'
import Logger from '@logger'
import config from '@config'
import Utils from '@helpers/utils'
import proxyquire from 'proxyquire'

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

  it('should connect to all networks', async () => {
    // Mock the config.BLOCKCHAIN_NODES
    sandbox.stub(config, 'BLOCKCHAIN_NODES').value({
      ETHEREUM_MAINNET: 'ws://localhost:8545',
      POLYGON_MAINNET: 'ws://localhost:8546',
    })

    // Mock ProviderModule.connectToNetwork
    const connectToNetworkStub = sandbox.stub(ProviderModule, 'connectToNetwork').resolves()

    await ProviderModule.connectToAllNetworks()

    expect(connectToNetworkStub.calledTwice).to.be.true
    expect(connectToNetworkStub.getCall(0).args[0]).to.equal(NetworksEnum.ethereumMainnet)
    expect(connectToNetworkStub.getCall(0).args[1]).to.equal('ws://localhost:8545')
    expect(connectToNetworkStub.getCall(1).args[0]).to.equal(NetworksEnum.polygonMainnet)
    expect(connectToNetworkStub.getCall(1).args[1]).to.equal('ws://localhost:8546')
  })

  it('should handle missing node URL in connectToAllNetworks', async () => {
    sandbox.stub(config, 'BLOCKCHAIN_NODES').value({
      ETHEREUM_MAINNET: '',
    })

    const loggerWarnStub = sandbox.stub(Logger, 'warn')
    await ProviderModule.connectToAllNetworks()

    expect(loggerWarnStub.calledWithMatch('Node URL for ETHEREUM_MAINNET is not configured.' as any)).to.be.true
  })

  it('should connect to a network', async () => {
    const network = NetworksEnum.ethereumMainnet
    const nodeUrl = 'ws://localhost:8545'

    const providerStub = {
      removeAllListeners: sandbox.stub(),
      websocket: {
        addEventListener: sandbox.stub(),
      },
    } as any

    const ethersStub = {
      WebSocketProvider: sandbox.stub().returns(providerStub),
    }

    const ProviderModule = proxyquire('@modules/provider', {
      ethers: ethersStub,
    }).default

    await ProviderModule.connectToNetwork(network, nodeUrl)

    expect(ProviderModule.providerProxies[network].provider).to.equal(providerStub)
    expect(providerStub.websocket.addEventListener.calledThrice).to.be.true
  })

  it('should get provider', () => {
    const network = NetworksEnum.ethereumMainnet
    const providerStub = {
      removeAllListeners: sandbox.stub(),
    }
    ProviderModule.providerProxies[network] = {
      provider: providerStub as any,
      reconnectAttempts: 0,
      subscriptions: [],
    }
    const proxy = ProviderModule.getProvider(network)
    expect(proxy).to.exist
  })

  it('should subscribe to event', () => {
    const network = NetworksEnum.ethereumMainnet
    const providerStub = {
      on: sandbox.spy(),
      removeAllListeners: sandbox.stub(),
    }
    ProviderModule.providerProxies[network] = {
      provider: providerStub as any,
      reconnectAttempts: 0,
      subscriptions: [],
    }
    const filter = {}
    const listener = () => {}

    ProviderModule.subscribeToEvent(network, filter, listener)

    expect(ProviderModule.providerProxies[network].subscriptions.length).to.equal(1)
    expect(providerStub.on.calledWith(filter)).to.be.true
  })

  it('should close all networks', async () => {
    const loggerInfoStub = sandbox.stub(Logger, 'info')
    const providerStub = {
      destroy: sandbox.stub().resolves(),
      removeAllListeners: sandbox.stub(),
    }
    ProviderModule.providerProxies[NetworksEnum.ethereumMainnet] = {
      provider: providerStub as any,
      reconnectAttempts: 0,
      subscriptions: [],
    }

    await ProviderModule.closeAllNetworks()

    expect(providerStub.removeAllListeners.calledOnce).to.be.true
    expect(providerStub.destroy.calledOnce).to.be.true
    expect(loggerInfoStub.calledWith('WebSocket connection closed for ethereum-mainnet' as any)).to.be.true
  })

  it('should check if connection is open', () => {
    const network = NetworksEnum.ethereumMainnet
    const providerStub = {
      removeAllListeners: sandbox.stub(),
      websocket: {
        readyState: IWebSocketStatus.OPEN,
      },
    }
    ProviderModule.providerProxies[network] = {
      provider: providerStub as any,
      reconnectAttempts: 0,
      subscriptions: [],
    }
    const isOpen = ProviderModule.isConnectionOpen(network)
    expect(isOpen).to.be.true
  })
})
