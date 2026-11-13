import Web3Helper from '@helpers/web3'
import ProviderModule from '@modules/provider'
import Web3Provider from '@modules/proxyProvider/web3Provider'
import { type IWeb3TokenBalance, NetworksEnum } from '@types'

describe('Manual: Web3', () => {
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
})
