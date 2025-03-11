import { PeaqNetworkTokenProvider } from '@providers/tokenDetailProvider/peaqNetworkProvider'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { ITokenType, NetworksEnum } from '@types'
import SubscanApi from '@helpers/subscanApi'
import { expect } from 'chai'
import utils from '@helpers/utils'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import logger from '@logger'

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

  it('should call to rabbitmq if the token info is not complete', async () => {
    const tokenInfo = {
      type: ITokenType.native,
      isGovernance: false,
    }

    const tokenDetails = {
      totalHolders: 100,
      totalSupply: '1000000',
      name: null,
      symbol: null,
      decimals: 18,
      logo: 'http://test.com/logo.png',
      type: ITokenType.native,
      priceUsd: 1,
    }

    const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails').resolves({
      ...tokenDetails,
    } as any)

    sandbox.stub(Web3Helper, 'getTokenInfo').resolves({
      name: 'TestToken',
      symbol: 'tt',
    } as any)

    const rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    const warnStub = sandbox.stub(logger, 'warn')

    const response = await PeaqNetworkTokenProvider.fetchTokenDetails(tokenInfo, '0x123', NetworksEnum.peaqMainnet)

    expect(response.tokenMetrics).to.deep.equal({
      totalHolders: tokenDetails.totalHolders,
      totalSupply: tokenDetails.totalSupply,
    })

    expect(response.tokenDetails).to.deep.equal({
      ...tokenDetails,
      name: 'TestToken',
      symbol: 'tt',
    })
    expect(warnStub.calledOnce).to.be.true
    expect(getTokenFullDetailsStub.calledOnce).to.be.true
    expect(rabbitMqStub.calledOnce).to.be.true
  })

  it('should fetch contract creation', async () => {
    const fetchContractCreationStub = sandbox
      .stub(SubscanApi, 'fetchContractCreation')
      .resolves({ blockNumber: 0, transactionHash: null, address: '0x123' } as any)
    const response = await PeaqNetworkTokenProvider.fetchContractCreation('0x123', NetworksEnum.peaqMainnet)
    expect(response).to.deep.equal({ blockNumber: 0, transactionHash: null, address: '0x123' })
    expect(fetchContractCreationStub.calledOnce).to.be.true
    expect(fetchContractCreationStub.calledWith('0x123', NetworksEnum.peaqMainnet)).to.be.true
  })

  it('should return default values if contract creation is not found', async () => {
    const fetchContractCreationStub = sandbox.stub(SubscanApi, 'fetchContractCreation').resolves(null as any)
    const response = await PeaqNetworkTokenProvider.fetchContractCreation('0x123', NetworksEnum.peaqMainnet)
    expect(response).to.deep.equal({ blockNumber: 0, transactionHash: null, address: '0x123' })
    expect(fetchContractCreationStub.calledOnce).to.be.true
    expect(fetchContractCreationStub.calledWith('0x123', NetworksEnum.peaqMainnet)).to.be.true
  })

  it('should fetch contract source code', async () => {
    const getContractSourceCodeStub = sandbox.stub(SubscanApi, 'getContractSourceCode').resolves(['source code'] as any)
    const response = await PeaqNetworkTokenProvider.fetchContractSourceCode('0x123', NetworksEnum.peaqMainnet)
    expect(response[0]).to.equal('source code')
    expect(getContractSourceCodeStub.calledOnce).to.be.true
    expect(getContractSourceCodeStub.calledWith('0x123', NetworksEnum.peaqMainnet)).to.be.true
  })

  it('should return details with subscan api', async () => {
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

    const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails').resolves(tokenDetails as any)

    const response = await PeaqNetworkTokenProvider.fetchBasicTokenInfo({
      address: '0x123',
      network: NetworksEnum.peaqMainnet,
    } as any)

    expect(response).to.deep.equal(tokenDetails)
    expect(getTokenFullDetailsStub.calledOnce).to.be.true
  })
})
