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

  it.only('should get address from ens', async () => {
    config.BLOCKCHAIN_NODES.ETHEREUM_MAINNET = 'wss://eth-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY'
    await ProviderModule.connectToAllNetworks()
    const aavegotchiAddress = '0x42E6DD8D517abB3E4f6611Ca53a8D1243C183fB0'
    const name = 'leuts.eth'
    const address = await Web3Helper.getAddressFromEns(name, NetworksEnum.ethereumMainnet)
    expect(address).to.eq(aavegotchiAddress)
  })

  it.only('should get ens from address', async () => {
    config.BLOCKCHAIN_NODES.ETHEREUM_MAINNET = 'wss://eth-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY'
    await ProviderModule.connectToAllNetworks()

    //leuts.eth 0x42E6DD8D517abB3E4f6611Ca53a8D1243C183fB0
    // sio.eth 0xd5fb864ACfD6BB2f72939f122e89fF7F475924f5

    const aavegotchiAddress = '0x42E6DD8D517abB3E4f6611Ca53a8D1243C183fB0'
    const name = 'leuts.eth'
    const ensName = await Web3Helper.getEnsWithAlchemy(aavegotchiAddress)
    console.log(ensName)
    // expect(ensName).to.eq(name)
  })
})
