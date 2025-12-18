import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import Utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe.skip('Integ: etherscan v2', () => {
  let sandbox: sinon.SinonSandbox
  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })
  afterEach(() => {
    sandbox.restore()
  })

  describe('test getTokenInfo', function () {
    this.timeout(10000000)
    const tokens = {
      [NetworksEnum.ethereumMainnet]: {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        symbol: 'USDC',
      },
      [NetworksEnum.ethereumSepolia]: {
        address: '0x6F6bB5dADDB05718382A0192B65603492C939f8F',
        symbol: 'USDC',
      },
      [NetworksEnum.polygonMainnet]: {
        address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        symbol: 'USDC',
      },
      [NetworksEnum.arbitrumMainnet]: {
        address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        symbol: 'USDC',
      },
      [NetworksEnum.optimismMainnet]: {
        address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        symbol: 'USDC',
      },
      [NetworksEnum.baseMainnet]: {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        symbol: 'USDC',
      },
      [NetworksEnum.zksyncMainnet]: {
        address: '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4',
        symbol: 'USDC',
      },
      [NetworksEnum.zksyncSepolia]: {
        address: '0xd45ab0E1dc7F503Eb177949c2Fb2Ab772B4B6CFC',
        symbol: 'USDC',
      },
    }

    for (const network in tokens) {
      it(`getTokenInfo ${network}`, async () => {
        const token = tokens[network as NetworksEnum]
        const result = await evmExplorerClient.fetchContractCreation(
          EvmExplorerEnum.ETHERSCAN,
          token.address,
          network as NetworksEnum,
        )

        expect(result).to.be.not.null
        const resultItem: any = result
        expect(resultItem).to.have.property('blockNumber')
        expect(resultItem).to.have.property('transactionHash')
        expect(resultItem.blockNumber).to.be.not.null
        expect(resultItem.transactionHash).to.be.not.null

        const txReceipt = await Web3Helper.getTransactionReceipt(resultItem.transactionHash, network as NetworksEnum)

        expect(txReceipt).to.be.not.null
        expect(txReceipt).to.have.property('blockNumber')
        expect(txReceipt!.blockNumber).to.be.eq(parseInt(resultItem.blockNumber))

        await Utils.wait(1000)
      })
    }
  })
})
