import EnsHelper from '@helpers/ens'
import Web3Helper from '@helpers/web3'
import ProviderModule from '@modules/provider'
import Web3Provider from '@modules/proxyProvider/web3Provider'
import { type IWeb3TokenBalance, NetworksEnum } from '@types'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Manual: Web3', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should getTokenBalanceAtBlock', async () => {
    await ProviderModule.connectToAllNetworks()

    const balance = await Web3Helper.getTokenBalanceAtBlock({
      address: '0x4B32847160549dfFf886fAf7987660a8cF278C41',
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      blockNumber: 15963460,
      network: NetworksEnum.ethereumMainnet,
    })
    console.log(balance)
  })

  it('should get ens from address as viem way', async () => {
    await ProviderModule.connectToAllNetworks()

    const testAddresses = [
      '0x42E6DD8D517abB3E4f6611Ca53a8D1243C183fB0',
      '0xd5fb864ACfD6BB2f72939f122e89fF7F475924f5',
      '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
    ]

    for (const address of testAddresses) {
      const ensName = await EnsHelper.getEnsWithUniversalResolver(address)
      console.log(address, ' => ', ensName)
    }
  })
})
