import * as sinon from 'sinon'
import { expect } from 'chai'
import { SubscanProvider } from '@providers/accountAssetProvider/subscanProvider'
import SubscanApiHelper from '@helpers/subscanApi'
import { NetworksEnum } from '@types'
import { ethers } from 'ethers'

describe('SubscanProvider', () => {
  let sandbox: sinon.SinonSandbox
  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })
  afterEach(() => {
    sandbox.restore()
  })

  it('should fetch account token balance ', async () => {
    const accountAddress = 'accountAddress'
    const network = NetworksEnum.peaqMainnet

    const getAccountBalanceStub = sandbox.stub(SubscanApiHelper, 'getAccountBalance').resolves([
      {
        tokenBalance: `${1e18}`,
        decimals: 18,
        contractAddress: '0xb07de4b2989e180f8907b8c7e617637c26ce2776',
      },
    ] as any)

    const result = await SubscanProvider.getAccountBalances(accountAddress, network)
    expect(result).to.deep.equal([
      {
        tokenBalance: '1.0',
        contractAddress: ethers.getAddress('0xb07de4b2989e180f8907b8c7e617637c26ce2776'),
      },
    ])

    expect(getAccountBalanceStub.calledOnce).to.be.true
    expect(getAccountBalanceStub.calledWith(accountAddress, network)).to.be.true
  })
})
