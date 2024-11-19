import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ProviderModule from '@modules/provider'
import { NetworksEnum } from '@types'
import Logger from '@logger'
import config from '@config'
import proxyquire from 'proxyquire'
import { Network } from 'alchemy-sdk'

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

  it('alchemyNetworksMap', () => {
    expect(ProviderModule.alchemyNetworksMap[NetworksEnum.ethereumMainnet]).to.equal(Network.ETH_MAINNET)
    expect(ProviderModule.alchemyNetworksMap[NetworksEnum.ethereumSepolia]).to.equal(Network.ETH_SEPOLIA)
    expect(ProviderModule.alchemyNetworksMap[NetworksEnum.polygonMainnet]).to.equal(Network.MATIC_MAINNET)
    expect(ProviderModule.alchemyNetworksMap[NetworksEnum.baseMainnet]).to.equal(Network.BASE_MAINNET)
    expect(ProviderModule.alchemyNetworksMap[NetworksEnum.arbitrumMainnet]).to.equal(Network.ARB_MAINNET)
    expect(ProviderModule.alchemyNetworksMap[NetworksEnum.zksyncSepolia]).to.equal(Network.ZKSYNC_SEPOLIA)
    expect(ProviderModule.alchemyNetworksMap[NetworksEnum.zksyncMainnet]).to.equal(Network.ZKSYNC_MAINNET)
  })

  it('should correctly parseNetwork', () => {
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

  it('should correctly parseAlchemyNetwork', () => {
    const result = ProviderModule.parseAlchemyNetwork(NetworksEnum.ethereumMainnet)
    expect(result).to.equal(Network.ETH_MAINNET)

    const result2 = ProviderModule.parseAlchemyNetwork(NetworksEnum.ethereumSepolia)
    expect(result2).to.equal(Network.ETH_SEPOLIA)

    const result3 = ProviderModule.parseAlchemyNetwork(NetworksEnum.polygonMainnet)
    expect(result3).to.equal(Network.MATIC_MAINNET)

    const result4 = ProviderModule.parseAlchemyNetwork(NetworksEnum.baseMainnet)
    expect(result4).to.equal(Network.BASE_MAINNET)

    const result5 = ProviderModule.parseAlchemyNetwork(NetworksEnum.arbitrumMainnet)
    expect(result5).to.equal(Network.ARB_MAINNET)

    const result6 = ProviderModule.parseAlchemyNetwork(NetworksEnum.zksyncSepolia)
    expect(result6).to.equal(Network.ZKSYNC_SEPOLIA)

    const result7 = ProviderModule.parseAlchemyNetwork(NetworksEnum.zksyncMainnet)
    expect(result7).to.equal(Network.ZKSYNC_MAINNET)
  })

  it('should connect to all networks', async () => {
    // Mock the config.BLOCKCHAIN_NODES
    sandbox.stub(config, 'NODES').value({
      ETHEREUM_MAINNET: {
        WS: 'ws://localhost:8545',
      },
      POLYGON_MAINNET: {
        WS: 'ws://localhost:8546',
      },
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
    sandbox.stub(config, 'NODES').value({
      ETHEREUM_MAINNET: {},
    })

    const loggerWarnStub = sandbox.stub(Logger, 'warn')
    await ProviderModule.connectToAllNetworks()

    expect(loggerWarnStub.calledWithMatch('Node URL for ethereum-mainnet is not configured.' as any)).to.be.true
  })

  it('should connect to a network', async () => {
    const network = NetworksEnum.ethereumMainnet
    const nodeUrl = 'ws://localhost:8545'

    const providerStub = {
      ws: {
        on: sandbox.stub(),
      },
      core: {},
    } as any

    const ProviderModule = proxyquire('@modules/provider', {
      'alchemy-sdk': {
        Alchemy: sandbox.stub().returns(providerStub),
      },
    }).default

    await ProviderModule.connectToNetwork(network, nodeUrl)

    expect(ProviderModule.providerProxies[network].provider).to.eq(providerStub.core)
    expect(providerStub.ws.on.calledThrice).to.be.true

    expect(providerStub.ws.on.getCall(0).args[0]).to.eq('open')
    expect(providerStub.ws.on.getCall(1).args[0]).to.eq('error')
    expect(providerStub.ws.on.getCall(2).args[0]).to.eq('close')
  })

  it('should get provider', () => {
    const network = NetworksEnum.ethereumMainnet

    const providerStub = {
      provider: {
        core: {},
      },
      subscriptions: [],
      alchemy: {
        ws: {
          on: sandbox.stub(),
        },
      },
    }

    ProviderModule.providerProxies[network] = providerStub
    const proxy = ProviderModule.getProvider(network)
    expect(proxy.core).to.exist
  })

  it('should subscribe to event', () => {
    const network = NetworksEnum.ethereumMainnet

    const providerStub = {
      provider: {
        core: {},
      },
      subscriptions: [],
      alchemy: {
        ws: {
          on: sandbox.stub(),
        },
      },
    }

    ProviderModule.providerProxies[network] = providerStub
    const filter = {}
    const listener = () => {}

    ProviderModule.subscribeToEvent(network, filter, listener)

    expect(providerStub.alchemy.ws.on.calledWith(filter)).to.be.true
  })

  it('should close all networks', async () => {
    const loggerInfoStub = sandbox.stub(Logger, 'info')

    const providerStub = {
      provider: {
        core: {},
      },
      subscriptions: [],
      alchemy: {
        ws: {
          on: sandbox.stub(),
        },
      },
    }

    ProviderModule.providerProxies[NetworksEnum.ethereumMainnet] = providerStub

    await ProviderModule.closeAllNetworks()

    expect(loggerInfoStub.calledWith('WebSocket connection closed for ethereum-mainnet' as any)).to.be.true
  })
})
