import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { NetworksEnum } from '@types'
import { ProxyMember } from '@modules/proxyMember'
import { expect } from 'chai'

describe('Manual: Member Balance', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle', async function () {
    this.timeout(1600000) // Increase timeout for the test

    const memberAddress = '0x0Member'
    const tokenAddress = '0x0Token'
    const network = NetworksEnum.ethereumMainnet

    let tokenBalanceDb = await ProxyMember.getBalances({
      address: memberAddress,
      tokenAddress,
      network,
    })
    expect(tokenBalanceDb?.amount).to.eq('0')

    tokenBalanceDb = await tokenBalanceDb?.increaseBalance({
      amount: '1',
      blockNumber: 0,
      tokenId: '0',
    })

    expect(tokenBalanceDb?.amount).to.eq('1')

    tokenBalanceDb = await tokenBalanceDb?.decreaseBalance({
      amount: '1',
      blockNumber: 1,
      tokenId: '0',
    })

    expect(tokenBalanceDb?.amount).to.eq('0')

    await ProviderModule.connectToAllNetworks()
  })
})
