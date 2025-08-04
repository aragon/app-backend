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

    // Ethereum Mainnet should have Alchemy but no Aragon (based on env config)
    expect(networks[NetworksEnum.ethereumMainnet]).to.exist
    expect(networks[NetworksEnum.ethereumMainnet].alchemy).to.exist
    expect(networks[NetworksEnum.ethereumMainnet].alchemy.rpc).to.exist
    expect(networks[NetworksEnum.ethereumMainnet].aragon).to.not.exist

    // Ethereum Sepolia should have Alchemy but no Aragon (ARAGON_RPC is empty)
    expect(networks[NetworksEnum.ethereumSepolia]).to.exist
    expect(networks[NetworksEnum.ethereumSepolia].alchemy).to.exist
    expect(networks[NetworksEnum.ethereumSepolia].alchemy.rpc).to.exist
    expect(networks[NetworksEnum.ethereumSepolia].aragon).to.not.exist
  })

  it('getProvider', async () => {
    // Since ARAGON_RPC is not configured for ethereum-sepolia, this should return undefined
    const aragonRpc = ProviderModule.getProvider(
      NetworksEnum.ethereumSepolia,
      IProviderType.ARAGON,
      IConnectionType.RPC,
    )
    expect(aragonRpc).to.be.undefined

    // Alchemy should work since it's configured
    const alchemyRpc = ProviderModule.getProvider(
      NetworksEnum.ethereumSepolia,
      IProviderType.ALCHEMY,
      IConnectionType.RPC,
    )
    expect(alchemyRpc).to.be.an('object')

    // Test a network that has Aragon RPC configured (peaq-mainnet)
    const peaqAragonRpc = ProviderModule.getProvider(
      NetworksEnum.peaqMainnet,
      IProviderType.ARAGON,
      IConnectionType.RPC,
    )
    expect(peaqAragonRpc).to.be.an('object')
  })
})
