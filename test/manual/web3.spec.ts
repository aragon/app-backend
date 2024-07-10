import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import Web3Helper from '@helpers/web3'
import { NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
import config from '@config'
import { expect } from 'chai'

describe('Manual: Web3', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should get address from ens', async () => {
    config.BLOCKCHAIN_NODES.ETHEREUM_MAINNET = ''
    await ProviderModule.connectToAllNetworks()
    const aavegotchiAddress = '0xF1cf9aFc900Ce3426A235212e164587A6274736A'
    const name = 'aavegotchi.dao.eth'
    const address = await Web3Helper.getAddressFromEns(name, NetworksEnum.ethereumMainnet)
    expect(address).to.eq(aavegotchiAddress)
  })

  it.skip('should get ens from address', async () => {
    config.BLOCKCHAIN_NODES.ETHEREUM_MAINNET = ''
    await ProviderModule.connectToAllNetworks()
    const aavegotchiAddress = '0xF1cf9aFc900Ce3426A235212e164587A6274736A'
    const name = 'aavegotchi.dao.eth'
    const ensName = await Web3Helper.getEnsFromAddress(aavegotchiAddress, NetworksEnum.ethereumMainnet)
    expect(ensName).to.eq(name)
  })
})
