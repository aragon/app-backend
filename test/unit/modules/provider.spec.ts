import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ProviderModule from '@modules/provider'
import { IProviderType, NetworksEnum } from '@types'
import config from '@config'
import { Network } from 'alchemy-sdk'
import logger from '@logger'
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
    expect(ProviderModule.networksMap.OPTIMISM_MAINNET).to.equal(NetworksEnum.optimismMainnet)
  })

  it('alchemyNetworksMap', () => {
    expect(ProviderModule.alchemyNetworksMap[NetworksEnum.ethereumMainnet]).to.equal(Network.ETH_MAINNET)
    expect(ProviderModule.alchemyNetworksMap[NetworksEnum.ethereumSepolia]).to.equal(Network.ETH_SEPOLIA)
    expect(ProviderModule.alchemyNetworksMap[NetworksEnum.polygonMainnet]).to.equal(Network.MATIC_MAINNET)
    expect(ProviderModule.alchemyNetworksMap[NetworksEnum.baseMainnet]).to.equal(Network.BASE_MAINNET)
    expect(ProviderModule.alchemyNetworksMap[NetworksEnum.arbitrumMainnet]).to.equal(Network.ARB_MAINNET)
    expect(ProviderModule.alchemyNetworksMap[NetworksEnum.zksyncSepolia]).to.equal(Network.ZKSYNC_SEPOLIA)
    expect(ProviderModule.alchemyNetworksMap[NetworksEnum.zksyncMainnet]).to.equal(Network.ZKSYNC_MAINNET)
    expect(ProviderModule.alchemyNetworksMap[NetworksEnum.optimismMainnet]).to.equal(Network.OPT_MAINNET)
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

    const result8 = ProviderModule.parseNetwork('OPTIMISM_MAINNET')
    expect(result8).to.equal(NetworksEnum.optimismMainnet)
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

  it('connectToAllNetworks should call connectToNetwork for each node configured', async () => {
    const rawNodes = {
      ETHEREUM_MAINNET: {
        ALCHEMY_API_KEY: 'test-alchemy-key',
        ARAGON_RPC: 'http://localhost:8545',
        FROM_BLOCK: 0,
        CONFIRMATION_BLOCKS: 12,
        INTERVAL_BLOCK_TIME: 15,
        ETHERSCAN_API_KEY: 'test',
        ETHERSCAN_API_URL: 'test',
        BLOCKSCOUT_API_URL: 'test',
        BLOCKSCOUT_API_KEY: 'test',
      },
      POLYGON_MAINNET: {
        ALCHEMY_API_KEY: 'test-alchemy-key2',
        ARAGON_RPC: 'http://localhost:8546',
        FROM_BLOCK: 0,
        CONFIRMATION_BLOCKS: 12,
        INTERVAL_BLOCK_TIME: 15,
        ETHERSCAN_API_KEY: 'test',
        ETHERSCAN_API_URL: 'test',
        BLOCKSCOUT_API_URL: 'test',
        BLOCKSCOUT_API_KEY: 'test',
      },
    }
    sandbox.stub(config, 'NODES').value(rawNodes)

    const connectToNetworkStub = sandbox.stub(ProviderModule, 'connectToNetwork').resolves()
    await ProviderModule.connectToAllNetworks()

    // Two networks * two providers = 4 calls.
    expect(connectToNetworkStub.callCount).to.equal(4)
    const calls: any = connectToNetworkStub.args
    expect(calls.find(w => w[0] === NetworksEnum.polygonMainnet).length).to.equal(2)
    expect(calls.find(w => w[0] === NetworksEnum.ethereumMainnet).length).to.equal(2)
    expect(calls.find(w => w[1].providerType === IProviderType.ALCHEMY).length).to.equal(2)
    expect(calls.find(w => w[1].providerType === IProviderType.ARAGON).length).to.equal(2)
  })

  describe('connectToNetwork', () => {
    it('connectToNetwork should configure an Alchemy connection', async () => {
      const network = NetworksEnum.ethereumMainnet
      const alchemyConfig = {
        providerType: IProviderType.ALCHEMY,
        alchemyApiKey: 'test-alchemy-key',
        fromBlock: 0,
        confirmationBlocks: 12,
        intervalBlockTime: 15,
      }
      const fakeAlchemy = {
        core: {},
      }
      const alchemyStub = sandbox.stub().returns(fakeAlchemy)
      sandbox.replace(require('alchemy-sdk'), 'Alchemy', alchemyStub)

      await ProviderModule.connectToNetwork(network, alchemyConfig)
      const proxy = ProviderModule.providerProxies[network]
      expect(proxy.alchemy).to.exist
      expect(alchemyStub.calledOnce).to.be.true
    })

    it('connectToNetwork should configure an Aragon connection', async () => {
      const providerStub = { on: sandbox.stub(), websocket: { on: sandbox.stub() } }
      const { default: ProviderModule } = proxyquire.noCallThru()('@modules/provider', {
        ethers: {
          WebSocketProvider: function () {
            return providerStub
          },
          JsonRpcProvider: function () {
            return providerStub
          },
        },
      })

      const network = NetworksEnum.ethereumMainnet
      const aragonConfig = {
        providerType: IProviderType.ARAGON,
        rpcEndpoint: 'http://localhost:8545',
        fromBlock: 0,
        confirmationBlocks: 12,
        intervalBlockTime: 15,
      }

      await ProviderModule.connectToNetwork(network, aragonConfig)

      const proxy = ProviderModule.providerProxies[network]
      expect(proxy.aragon).to.exist
    })
  })

  describe('getProvider', () => {
    it('getProvider should return the requested provider connection', () => {
      const network = NetworksEnum.ethereumMainnet
      const fakeConnection = { rpc: {} }
      ProviderModule.providerProxies[network] = { [IProviderType.ALCHEMY]: fakeConnection }
      const provider = ProviderModule.getProvider(network, IProviderType.ALCHEMY)
      expect(provider).to.equal(fakeConnection)
    })

    it('getAnyRpcProvider should return Aragon rpc if available, else Alchemy rpc', () => {
      const network = NetworksEnum.ethereumMainnet
      const fakeAragonRpc = {}
      const fakeAlchemyRpc = {}
      ProviderModule.providerProxies[network] = {
        aragon: { rpc: fakeAragonRpc },
        alchemy: { rpc: fakeAlchemyRpc },
      }
      expect(ProviderModule.getAnyRpcProvider(network)).to.equal(fakeAragonRpc)
      ProviderModule.providerProxies[network].aragon = undefined
      expect(ProviderModule.getAnyRpcProvider(network)).to.equal(fakeAlchemyRpc)
    })
  })

  describe('closeAllNetworks', () => {
    it('closeAllNetworks should close all websocket connections', async () => {
      ProviderModule.providerProxies[NetworksEnum.ethereumMainnet] = {
        alchemy: { rpc: {} },
        aragon: { rpc: {} },
      }
      await ProviderModule.closeAllNetworks()
      expect(ProviderModule.providerProxies[NetworksEnum.ethereumMainnet]).to.be.undefined
    })
  })
})
