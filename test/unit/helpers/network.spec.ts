import sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworkHelper } from '@helpers/network'
import { UnitTestUtils } from '@test/lib/utils'
import Provider from '@modules/provider'

describe('Helpers:Network', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should get the supported network', () => {
    const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
    sandbox.stub(Provider.configState, 'getConfigItem').callsFake(network => fakeProviders[network])
    const networkCount = Object.keys(fakeProviders).length
    const activeNetworks = NetworkHelper.supportedNetworks()

    expect(activeNetworks.length).to.equal(networkCount)
  })

  it('should return empty array if no network is supported', () => {
    sandbox.stub(Provider.configState, 'getConfigItem').returns(null)
    const activeNetworks = NetworkHelper.supportedNetworks()
    expect(activeNetworks).to.be.empty
  })
})
