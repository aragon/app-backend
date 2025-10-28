import sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworkHelper } from '@helpers/network'
import { NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
import config from '@config'
import utils from '@helpers/utils'

describe('Helpers: Network', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should get the supported network', () => {
    const fakeProviders = {
      [NetworksEnum.ethereumMainnet]: {},
      [NetworksEnum.ethereumSepolia]: {},
    }

    sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(network => fakeProviders[network])

    const networkCount = Object.keys(fakeProviders).length
    const activeNetworks = NetworkHelper.supportedNetworks()

    expect(activeNetworks.length).to.equal(networkCount)
    expect(activeNetworks).to.deep.equal([
      { networkName: NetworksEnum.ethereumMainnet, provider: fakeProviders[NetworksEnum.ethereumMainnet] },
      { networkName: NetworksEnum.ethereumSepolia, provider: fakeProviders[NetworksEnum.ethereumSepolia] },
    ])
  })

  it('should return empty array if no network is supported', () => {
    sandbox.stub(ProviderModule, 'getProvider').returns(undefined)
    const activeNetworks = NetworkHelper.supportedNetworks()
    expect(activeNetworks).to.be.empty
  })

  describe('getAverageBlockTime', () => {
    it('should return correct average block time in milliseconds', () => {
      sandbox.stub(config, 'NODES').value({
        ETHEREUM_MAINNET: {
          INTERVAL_BLOCK_TIME: 12,
        },
        POLYGON_MAINNET: {
          INTERVAL_BLOCK_TIME: 2,
        },
      })

      const networkToAragonStub = sandbox.stub(utils, 'networkToAragon')
      networkToAragonStub.withArgs(NetworksEnum.ethereumMainnet).returns('ETHEREUM_MAINNET')
      networkToAragonStub.withArgs(NetworksEnum.polygonMainnet).returns('POLYGON_MAINNET')
      networkToAragonStub.returns('')

      const ethBlockTime = NetworkHelper.getAverageBlockTime(NetworksEnum.ethereumMainnet)
      expect(ethBlockTime).to.equal(12)

      const polyBlockTime = NetworkHelper.getAverageBlockTime(NetworksEnum.polygonMainnet)
      expect(polyBlockTime).to.equal(2)
    })

    it('should use network configuration correctly', () => {
      const mockConfig = {
        ETHEREUM_MAINNET: {
          INTERVAL_BLOCK_TIME: 15,
        },
      }
      sandbox.stub(config, 'NODES').value(mockConfig)
      const networkToAragonStub = sandbox.stub(utils, 'networkToAragon').returns('ETHEREUM_MAINNET')

      const blockTime = NetworkHelper.getAverageBlockTime(NetworksEnum.ethereumMainnet)

      expect(blockTime).to.equal(15)
      expect(networkToAragonStub.calledWith(NetworksEnum.ethereumMainnet)).to.be.true
    })
  })
})
