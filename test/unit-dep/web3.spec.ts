import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'

describe('Web3Helper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('getTransactionReceipt', async () => {
    const txHash = '0x179d3ab9e36fdf4cbbba323b1234917b7a76839d65a6fefb4ddcbbfbf7923959'
    const network = NetworksEnum.ethereumSepolia
    const tx = await Web3Helper.getTransactionReceipt(txHash, network)
    expect(tx).to.be.an('object')
    expect(tx?.hash).to.eq(txHash)
  })
})
