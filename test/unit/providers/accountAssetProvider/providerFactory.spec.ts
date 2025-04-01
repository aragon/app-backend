import * as sinon from 'sinon'
import { expect } from 'chai'
import { SubscanProvider } from '@providers/accountAssetProvider/subscanProvider'
import { AlchemyProvider } from '@providers/accountAssetProvider/alchemyProvider'
import AccountAssetProvider from '@providers/accountAssetProvider/providerFactory'
import { NetworksEnum } from '@types'

describe('Asset ProviderFactory', () => {
  let sandbox: sinon.SinonSandbox
  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })
  afterEach(() => {
    sandbox.restore()
  })

  it('should token balances of an address based on network peaq', async () => {
    const balanceResposne = [
      {
        tokenBalance: `1`,
        contractAddress: '0xTokenContract',
      },
    ]

    const getAccountBalanceStubWithSubscan = sandbox
      .stub(SubscanProvider, 'getAccountBalances')
      .resolves(balanceResposne)
    const getAccountBalanceStubWithAlchemy = sandbox
      .stub(AlchemyProvider, 'getAccountBalances')
      .resolves(balanceResposne)

    const accountAddress = 'accountAddress'
    const network = NetworksEnum.peaqMainnet

    const resultSubscan = await AccountAssetProvider.getAccountBalances(accountAddress, network)
    expect(resultSubscan).to.deep.equal([
      {
        tokenBalance: '1',
        contractAddress: '0xTokenContract',
      },
    ])

    expect(getAccountBalanceStubWithSubscan.calledOnce).to.be.true
    expect(getAccountBalanceStubWithAlchemy.calledOnce).to.be.false
  })

  it('should token balances of an address based on network ethereum', async () => {
    const balanceResposne = [
      {
        tokenBalance: `1`,
        contractAddress: '0xTokenContract',
      },
    ]

    const getAccountBalanceStubWithSubscan = sandbox
      .stub(SubscanProvider, 'getAccountBalances')
      .resolves(balanceResposne)
    const getAccountBalanceStubWithAlchemy = sandbox
      .stub(AlchemyProvider, 'getAccountBalances')
      .resolves(balanceResposne)

    const accountAddress = 'accountAddress'
    const network = NetworksEnum.ethereumMainnet

    const resultAlchemy = await AccountAssetProvider.getAccountBalances(accountAddress, network)
    expect(resultAlchemy).to.deep.equal([
      {
        tokenBalance: '1',
        contractAddress: '0xTokenContract',
      },
    ])

    expect(getAccountBalanceStubWithSubscan.calledOnce).to.be.false
    expect(getAccountBalanceStubWithAlchemy.calledOnce).to.be.true
  })
})
