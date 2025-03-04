import { PeaqNetworkTokenProvider } from '@providers/tokenDetailProvider/peaqNetworkProvider'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { ITokenType, NetworksEnum } from '@types'
import SubscanApi from '@helpers/subscanApi'
import { expect } from 'chai'
import utils from '@helpers/utils'

describe('Module: PeaqTokenProvider', () => {
  let sandbox: SinonSandbox
  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('Should fetch token detail for peaq network', async () => {
    const tokenInfo = {
      type: ITokenType.ERC20,
      isGovernance: false,
    }

    const tokenDetails = {
      totalHolders: 100,
      totalSupply: '1000000',
      name: 'TestToken',
      symbol: 'TT',
      decimals: 18,
      logo: 'http://test.com/logo.png',
      type: ITokenType.ERC20,
      priceUsd: 1,
    }

    const getNativeTokenInfoStub = sandbox.stub(SubscanApi, 'getNativeTokenInfo')
    const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails').resolves(tokenDetails as any)

    const response = await PeaqNetworkTokenProvider.fetchTokenDetails(tokenInfo, '0x123', NetworksEnum.peaqMainnet)

    expect(response.tokenMetrics).to.deep.equal({
      totalHolders: tokenDetails.totalHolders,
      totalSupply: tokenDetails.totalSupply,
    })

    expect(response.tokenDetails).to.deep.equal(tokenDetails)
    expect(getNativeTokenInfoStub.calledOnce).to.be.false
    expect(getTokenFullDetailsStub.calledOnce).to.be.true
    expect(getTokenFullDetailsStub.calledWith('0x123', NetworksEnum.peaqMainnet)).to.be.true
  })

  it('Should fetch native token detail for peaq network', async () => {
    const tokenInfo = {
      type: ITokenType.native,
      isGovernance: false,
    }

    const tokenDetails = {
      totalHolders: 100,
      totalSupply: '1000000',
      name: 'PEAQ',
      symbol: 'PEAQ',
      decimals: 18,
      logo: 'http://test.com/logo.png',
      type: ITokenType.native,
      priceUsd: 1,
    }

    const getNativeTokenInfoStub = sandbox.stub(SubscanApi, 'getNativeTokenInfo').resolves(tokenDetails as any)
    const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails')

    const response = await PeaqNetworkTokenProvider.fetchTokenDetails(
      tokenInfo,
      utils.zeroAddress,
      NetworksEnum.peaqMainnet,
    )

    expect(response.tokenMetrics).to.deep.equal({
      totalHolders: tokenDetails.totalHolders,
      totalSupply: tokenDetails.totalSupply,
    })

    expect(response.tokenDetails).to.deep.equal(tokenDetails)
    expect(getNativeTokenInfoStub.calledOnce).to.be.true
    expect(getTokenFullDetailsStub.calledOnce).to.be.false
    expect(getNativeTokenInfoStub.calledWith(NetworksEnum.peaqMainnet)).to.be.true
  })
})
