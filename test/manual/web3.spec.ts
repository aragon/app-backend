import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import EnsHelper from '@helpers/ens'
import Web3Helper from '@helpers/web3'
import { type IAlchemyTokenBalance, NetworksEnum } from '@types'
import ProxyWeb3 from '@modules/proxyWeb3'

describe('Manual: Web3', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('getBalance - handleAlchemyCrazyBalance', async function () {
    this.timeout(1600000)
    await ProviderModule.connectToAllNetworks()

    const testCases = [
      { address: '0x9c25a6b1bf3F6Fd2F68a62169c043045C2460482', network: NetworksEnum.ethereumMainnet },
      { address: '0x35a0db8c6F2903Bc21C45d582B167e19Faf60d43', network: NetworksEnum.ethereumMainnet },
      { address: '0xC432356F9f2da794DDA3DF10706eA34DC18A725d', network: NetworksEnum.ethereumMainnet },

      { address: '0x8474A43DBC168d4D7cC10432E1b3267Dc16974d5', network: NetworksEnum.polygonMainnet },
      { address: '0x1234567890abcdef1234567890abcdef12345678', network: NetworksEnum.polygonMainnet },
      { address: '0xD8981e488Dc62bc0f7aE6ce4bec09db0786aC2Db', network: NetworksEnum.polygonMainnet },

      { address: '0x5B98a0c38d3684644A9Ada0baaeAae452aE3267B', network: NetworksEnum.ethereumSepolia },
    ]

    for (const testCase of testCases) {
      const { address, network } = testCase
      try {
        const balance = await ProxyWeb3.getNativeBalance(address, network)
        console.log(`Balance for ${address} on ${network}:`, balance)
      } catch (error) {
        console.error(`Error fetching balance for ${address} on ${network}:`, error)
      }
    }
  })

  it('getTokenBalance - handleAlchemyCrazyBalance', async function () {
    this.timeout(1600000)
    await ProviderModule.connectToAllNetworks()

    const testCases = [
      { address: '0x9c25a6b1bf3F6Fd2F68a62169c043045C2460482', network: NetworksEnum.ethereumMainnet },
      { address: '0x35a0db8c6F2903Bc21C45d582B167e19Faf60d43', network: NetworksEnum.ethereumMainnet },
      { address: '0xC432356F9f2da794DDA3DF10706eA34DC18A725d', network: NetworksEnum.ethereumMainnet },

      { address: '0x8474A43DBC168d4D7cC10432E1b3267Dc16974d5', network: NetworksEnum.polygonMainnet },
      { address: '0x1234567890abcdef1234567890abcdef12345678', network: NetworksEnum.polygonMainnet },
      { address: '0xD8981e488Dc62bc0f7aE6ce4bec09db0786aC2Db', network: NetworksEnum.polygonMainnet },

      { address: '0x5B98a0c38d3684644A9Ada0baaeAae452aE3267B', network: NetworksEnum.ethereumSepolia },
    ]

    for (const testCase of testCases) {
      const { address, network } = testCase
      try {
        const balances = await Web3Helper.getTokenBalances(address, network)

        balances.map((tk: IAlchemyTokenBalance) => {
          console.log(
            `Balance for ${address} of ${tk.contractAddress} on ${network}:`,
            tk.originalBalance,
            tk.tokenBalance,
          )
        })
      } catch (error) {
        console.error(`Error fetching balance for ${address} on ${network}:`, error)
      }
    }
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
