import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IConnectionType, IProviderType, NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'

describe('Integ: ProviderModule', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('providerProxies', async () => {
    const networks = ProviderModule.providerProxies
    expect(networks).to.be.an('object')
    expect(networks[NetworksEnum.ethereumMainnet].aragon?.rpc).to.not.exist
    expect(networks[NetworksEnum.ethereumMainnet].alchemy.rpc).to.exist

    expect(networks[NetworksEnum.ethereumSepolia].aragon?.rpc).to.not.exist
    expect(networks[NetworksEnum.ethereumSepolia].alchemy.rpc).to.exist
  })

  it('getProvider', async () => {
    const aragonRpc = ProviderModule.getProvider(
      NetworksEnum.ethereumSepolia,
      IProviderType.ARAGON,
      IConnectionType.RPC,
    )
    if (aragonRpc) {
      expect(aragonRpc).to.be.an('object')
    }
    const alchemyRpc = ProviderModule.getProvider(
      NetworksEnum.ethereumSepolia,
      IProviderType.ALCHEMY,
      IConnectionType.RPC,
    )
    expect(alchemyRpc).to.be.an('object')
  })
})
