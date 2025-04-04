import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'
import TokenUtils from '@helpers/tokenUtils'
import { RateModule } from '@modules/rates'
import BlockScoutHelper from '@helpers/blockScout'
import CovalentHelper from '@helpers/covalent'
import Web3Helper from '@helpers/web3'
import { ITokenType, NetworksEnum } from '@types'
import type Token from '@models/schema/token'
import { ProxyToken } from '@modules/proxyToken'
import Web3Utils from '@helpers/web3Utils'

describe('fetchTokenUpdate', () => {
  let sandbox: SinonSandbox

  const baseToken: Token = {
    address: '0xToken',
    network: NetworksEnum.ethereumMainnet,
    type: ITokenType.ERC20,
  } as any

  let rateFetchStub: sinon.SinonStub
  let blockScoutStub: sinon.SinonStub
  let covalentStub: sinon.SinonStub

  const rawRate = {
    name: 'Token',
    symbol: 'TKN',
    type: ITokenType.ERC20,
    decimals: 18,
    priceUsd: '100',
    priceChangeOnDayUsd: '5',
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()

    rateFetchStub = sandbox.stub(RateModule, 'fetchRate')
    blockScoutStub = sandbox.stub(BlockScoutHelper, 'getTokenFullDetails')
    covalentStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders')
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should return null if rawRate.decimals is null and blockScoutInfo is null', async () => {
    rateFetchStub.resolves({ decimals: null } as any)
    blockScoutStub.resolves(null)
    covalentStub.resolves({ totalHolders: 0, totalSupply: '0' })

    const result = await TokenUtils.fetchTokenUpdate(baseToken)
    expect(result).to.be.null
    expect(rateFetchStub.calledOnce).to.be.true
    expect(blockScoutStub.calledOnce).to.be.true
    expect(covalentStub.calledOnce).to.be.true
  })

  it('should use rawRate data for price if rawRate.decimals is not null', async () => {
    rateFetchStub.resolves(rawRate as any)
    blockScoutStub.resolves(null)
    covalentStub.resolves({ totalHolders: 10, totalSupply: '1000' })

    const result = await TokenUtils.fetchTokenUpdate(baseToken)
    expect(result).to.deep.equal({
      priceUsd: '100',
      priceChangeOnDayUsd: '5',
      holders: 0,
      totalSupply: '0',
    })
  })

  it('should fallback to blockScout for price when rawRate.decimals is null', async () => {
    rateFetchStub.resolves({ decimals: null } as any)
    blockScoutStub.resolves({
      priceUsd: '150',
      holders: 20,
      totalSupply: '2000',
    })
    covalentStub.resolves({ totalHolders: 0, totalSupply: '0' })

    const result = await TokenUtils.fetchTokenUpdate(baseToken)
    expect(result).to.deep.equal({
      priceUsd: '150',
      priceChangeOnDayUsd: '0',
      holders: 20,
      totalSupply: '2000',
    })
  })

  it('should fallback to covalent for holders and totalSupply if blockScout is missing and token qualifies (GovernanceERC20)', async () => {
    const governanceToken = { ...baseToken, type: ITokenType.ERC20, isGovernance: true } as any
    rateFetchStub.resolves({
      decimals: 18,
      priceUsd: '200',
      priceChangeOnDayUsd: '10',
    })
    blockScoutStub.resolves(null)
    covalentStub.resolves({ totalHolders: 25, totalSupply: '3000' })

    const result = await TokenUtils.fetchTokenUpdate(governanceToken)
    expect(result).to.deep.equal({
      priceUsd: '200',
      priceChangeOnDayUsd: '10',
      holders: 25,
      totalSupply: '3000',
    })
  })

  it('should fallback to covalent for holders and totalSupply if blockScout is missing and token qualifies (whitelisted token)', async () => {
    const whitelistedToken = { ...baseToken, type: ITokenType.ERC20 } as any
    rateFetchStub.resolves({
      decimals: 18,
      priceUsd: '300',
      priceChangeOnDayUsd: '20',
    })
    blockScoutStub.resolves(null)
    covalentStub.resolves({ totalHolders: 30, totalSupply: '4000' })
    sandbox.stub(Web3Utils, 'isWhitelistedToken').returns(true)

    const result = await TokenUtils.fetchTokenUpdate(whitelistedToken)

    expect(result).to.deep.equal({
      priceUsd: '300',
      priceChangeOnDayUsd: '20',
      holders: 30,
      totalSupply: '4000',
    })
  })

  it('should return null if all merged fields are default values', async () => {
    rateFetchStub.resolves({
      decimals: 18,
      priceUsd: '0',
      priceChangeOnDayUsd: '0',
    })
    blockScoutStub.resolves({
      priceUsd: '0',
      holders: 0,
      totalSupply: '0',
    })
    covalentStub.resolves({ totalHolders: 0, totalSupply: '0' })

    const result = await TokenUtils.fetchTokenUpdate(baseToken)
    expect(result).to.be.null
  })

  describe('isTokenSyncable', () => {
    let isTokenScamStub: sinon.SinonStub

    beforeEach(() => {
      isTokenScamStub = sandbox.stub(ProxyToken, 'analyzeIfScamToken').returns(false)
    })

    it('should return true if Web3Helper returns valid token details', async () => {
      sandbox.stub(Web3Helper, 'getTokenNameAndSymbol').resolves({
        name: 'TokenName',
        symbol: 'TKN',
      } as any)

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.be.equal(true)
      expect(blockScoutStub.notCalled).to.be.true
    })

    it('should return true if BlockScoutHelper returns valid token details', async () => {
      sandbox.stub(Web3Helper, 'getTokenNameAndSymbol').resolves({
        name: undefined,
        symbol: 'Te',
      } as any)

      blockScoutStub.resolves({
        type: 'ERC-20',
        name: 'TokenName',
        symbol: 'TKN',
      } as any)

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.be.eq(true)
    })

    it('should return false if both Web3Helper and BlockScoutHelper return invalid token details', async () => {
      sandbox.stub(Web3Helper, 'getTokenNameAndSymbol').resolves({
        name: undefined,
        symbol: undefined,
      } as any)

      blockScoutStub.resolves(null)
      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.be.false
    })

    it('should return false if Web3Helper returns missing details and BlockScout returns unknown type', async () => {
      sandbox.stub(Web3Helper, 'getTokenNameAndSymbol').resolves({
        name: '',
        symbol: '',
      } as any)
      blockScoutStub.resolves({
        type: ITokenType.unknown,
      } as any)
      sandbox.stub(BlockScoutHelper, 'parseTokenType').returns(ITokenType.unknown)
      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.be.false
    })
  })
})
