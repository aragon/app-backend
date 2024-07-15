import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import Web3Helper from '@helpers/web3'
import { NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
import config from '@config'
import { expect } from 'chai'
import { ethers, type WebSocketProvider } from 'ethers'
import { ConfigState } from '@state/configState'

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

  it.skip('should get ens from address as viem way', async () => {
    config.BLOCKCHAIN_NODES.ETHEREUM_MAINNET = 'wss://eth-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY'

    await ProviderModule.connectToAllNetworks()

    const testAddresses = [
      '0x42E6DD8D517abB3E4f6611Ca53a8D1243C183fB0',
      '0xd5fb864ACfD6BB2f72939f122e89fF7F475924f5',
      '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
    ]

    for (const address of testAddresses) {
      const ensName = await Web3Helper.getEnsWithUniversalResolver(address)
      console.log(address, ' => ', ensName)
    }
  })
})
