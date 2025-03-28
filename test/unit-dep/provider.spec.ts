import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IConnectionType, IProviderType, NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'

describe('ProviderModule', () => {
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
    expect(networks[NetworksEnum.ethereumMainnet].aragon?.ws).to.not.exist
    expect(networks[NetworksEnum.ethereumMainnet].alchemy.rpc).to.exist
    expect(networks[NetworksEnum.ethereumMainnet].alchemy.ws).to.exist
    expect(networks[NetworksEnum.ethereumMainnet].alchemy.nft).to.exist

    expect(networks[NetworksEnum.ethereumSepolia].aragon.rpc).to.exist
    expect(networks[NetworksEnum.ethereumSepolia].aragon.ws).to.exist
    expect(networks[NetworksEnum.ethereumSepolia].alchemy.rpc).to.exist
    expect(networks[NetworksEnum.ethereumSepolia].alchemy.ws).to.exist
    expect(networks[NetworksEnum.ethereumSepolia].alchemy.nft).to.exist
  })

  it('getProvider', async () => {
    const aragonRpc = ProviderModule.getProvider(
      NetworksEnum.ethereumSepolia,
      IProviderType.ARAGON,
      IConnectionType.RPC,
    )
    expect(aragonRpc).to.be.an('object')
    const aragonWs = ProviderModule.getProvider(NetworksEnum.ethereumSepolia, IProviderType.ARAGON, IConnectionType.WS)
    expect(aragonWs).to.be.an('object')
    const alchemyRpc = ProviderModule.getProvider(
      NetworksEnum.ethereumSepolia,
      IProviderType.ALCHEMY,
      IConnectionType.RPC,
    )
    expect(alchemyRpc).to.be.an('object')
    const alchemyWs = ProviderModule.getProvider(
      NetworksEnum.ethereumSepolia,
      IProviderType.ALCHEMY,
      IConnectionType.WS,
    )
    expect(alchemyWs).to.be.an('object')
    const alchemyNft = ProviderModule.getProvider(
      NetworksEnum.ethereumSepolia,
      IProviderType.ALCHEMY,
      IConnectionType.NFT,
    )
    expect(alchemyNft).to.be.an('object')
  })
})
