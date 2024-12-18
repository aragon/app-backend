import sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworkHelper } from '@helpers/network'
import { NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'

describe('Helpers:Network', () => {
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

    sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network])

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
})
