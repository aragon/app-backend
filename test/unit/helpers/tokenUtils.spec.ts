import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import TokenUtils from '@helpers/tokenUtils'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Token from '@models/schema/token'
import { ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'

describe('TokenUtils', () => {
  let sandbox: SinonSandbox

  const baseToken: Token = {
    address: '0xToken',
    network: NetworksEnum.ethereumMainnet,
    type: ITokenType.ERC20,
  } as any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'error').returns(undefined as any)
    sandbox.stub(logger, 'logMeta').returns({})
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('firstValid', () => {
    it('should return the first valid value', () => {
      expect(TokenUtils.firstValid(null, undefined, '0', 0, 'valid')).to.equal('valid')
      expect(TokenUtils.firstValid('first', 'second')).to.equal('first')
      expect(TokenUtils.firstValid(null, undefined, '0', 0, 42)).to.equal(42)
    })

    it('should return null if no valid values are provided', () => {
      expect(TokenUtils.firstValid(null, undefined, '0', 0)).to.be.null
    })
  })

  describe('shouldSkipFetch', () => {
    it('should return true when token is governance', () => {
      const token = { ...baseToken, isGovernance: true, symbol: 'GOV' }
      const tokenRate = { priceUsd: '0' }
      expect(TokenUtils.shouldSkipFetch(token, tokenRate)).to.be.true
    })

    it('should return true when token type is unknown', () => {
      const token = { ...baseToken, type: ITokenType.unknown, symbol: 'UNK' }
      const tokenRate = { priceUsd: '0' }
      expect(TokenUtils.shouldSkipFetch(token, tokenRate)).to.be.true
    })

    it('should return true when token is from test networks', () => {
      const token = { ...baseToken, network: NetworksEnum.ethereumSepolia, symbol: 'TEST' }
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(true)
      const tokenRate = { priceUsd: '0' }
      expect(TokenUtils.shouldSkipFetch(token, tokenRate)).to.be.true
    })

    it('should return false when token rate is not zero', () => {
      const token = { ...baseToken, isGovernance: true, symbol: 'GOV' }
      const tokenRate = { priceUsd: '0.1' }
      expect(TokenUtils.shouldSkipFetch(token, tokenRate)).to.be.false
    })

    it('should return true when token has no symbol', () => {
      const token = { ...baseToken, symbol: null }
      const tokenRate = { priceUsd: '0' }
      expect(TokenUtils.shouldSkipFetch(token, tokenRate)).to.be.true
    })

    it('should return false for normal token with price', () => {
      const token = { ...baseToken, symbol: 'TKN' }
      const tokenRate = { priceUsd: '10' }
      expect(TokenUtils.shouldSkipFetch(token, tokenRate)).to.be.false
    })
  })

  describe('analyzeIfScamToken', () => {
    it('should identify scam tokens with URLs in name', () => {
      expect(TokenUtils.analyzeIfScamToken('Visit https://claim.rewards.com', 'TKN')).to.be.true
      expect(TokenUtils.analyzeIfScamToken('Join www.airdrop.com now', 'TKN')).to.be.true
      expect(TokenUtils.analyzeIfScamToken('Free Bonus at tokens.com', 'TKN')).to.be.true
    })

    it('should identify scam tokens with URLs in symbol', () => {
      expect(TokenUtils.analyzeIfScamToken('Token', 'VISIT-claim.io')).to.be.true
      expect(TokenUtils.analyzeIfScamToken('Token', 'JOIN-www.rewards.io')).to.be.true
    })

    it('should identify scam tokens with keywords across name and symbol', () => {
      expect(TokenUtils.analyzeIfScamToken('Visit tokens.com', 'CLAIM')).to.be.true
      expect(TokenUtils.analyzeIfScamToken('Free Token', 'visit.io')).to.be.true
    })

    it('should handle null or undefined inputs', () => {
      expect(TokenUtils.analyzeIfScamToken(null as any, 'TKN')).to.be.false
      expect(TokenUtils.analyzeIfScamToken('Token', null as any)).to.be.false
      expect(TokenUtils.analyzeIfScamToken(null as any, null as any)).to.be.false
    })

    it('should return false for legitimate token names', () => {
      expect(TokenUtils.analyzeIfScamToken('Ethereum', 'ETH')).to.be.false
      expect(TokenUtils.analyzeIfScamToken('Bitcoin', 'BTC')).to.be.false
      expect(TokenUtils.analyzeIfScamToken('Staking Token', 'STK')).to.be.false
    })
  })

  describe('isTokenSyncable', () => {
    let findOneStub: sinon.SinonStub
    let web3HelperStub: sinon.SinonStub
    let analyzeIfScamTokenStub: sinon.SinonStub

    beforeEach(() => {
      findOneStub = sandbox.stub(Models.Token, 'findOne')
      web3HelperStub = sandbox.stub(Web3Helper, 'getTokenNameAndSymbol')
      analyzeIfScamTokenStub = sandbox.stub(TokenUtils, 'analyzeIfScamToken')
    })

    it('should return true if token exists in the database', async () => {
      findOneStub.resolves({ address: '0x123', network: NetworksEnum.ethereumMainnet })

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.be.true
      expect(web3HelperStub.called).to.be.false
    })

    it('should return true if prefetched tokenInfo is valid non-scam token', async () => {
      findOneStub.resolves(null)
      const prefetchedTokenInfo = {
        type: ITokenType.ERC20,
        name: 'TokenName',
        symbol: 'TKN',
      }
      analyzeIfScamTokenStub.returns(false)

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet, prefetchedTokenInfo)

      expect(result).to.be.true
      expect(analyzeIfScamTokenStub.calledWith('TokenName', 'TKN')).to.be.true
      expect(web3HelperStub.called).to.be.false
    })

    it('should return false if prefetched tokenInfo is scam token', async () => {
      findOneStub.resolves(null)
      const prefetchedTokenInfo = {
        type: ITokenType.ERC20,
        name: 'Claim Free Tokens at scam.com',
        symbol: 'SCAM',
      }
      analyzeIfScamTokenStub.returns(true)

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet, prefetchedTokenInfo)

      expect(result).to.be.false
      expect(web3HelperStub.called).to.be.false
    })

    it('should fallback to Web3Helper if prefetched tokenInfo has unknown type', async () => {
      findOneStub.resolves(null)
      const prefetchedTokenInfo = {
        type: ITokenType.unknown,
        name: 'TokenName',
        symbol: 'TKN',
      }
      web3HelperStub.resolves({
        name: 'Web3TokenName',
        symbol: 'W3T',
      })
      analyzeIfScamTokenStub.returns(false)

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet, prefetchedTokenInfo)

      expect(result).to.be.true
      expect(web3HelperStub.called).to.be.true
      expect(analyzeIfScamTokenStub.calledWith('Web3TokenName', 'W3T')).to.be.true
    })

    it('should try Web3Helper if no prefetched tokenInfo provided', async () => {
      findOneStub.resolves(null)
      web3HelperStub.resolves({
        name: 'TokenName',
        symbol: 'TKN',
      })
      analyzeIfScamTokenStub.returns(false)

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.be.true
      expect(analyzeIfScamTokenStub.calledWith('TokenName', 'TKN')).to.be.true
    })

    it('should return false if Web3Helper returns scam token details', async () => {
      findOneStub.resolves(null)
      web3HelperStub.resolves({
        name: 'Claim Rewards',
        symbol: 'scam.io',
      })
      analyzeIfScamTokenStub.returns(true)

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.be.false
    })

    it('should return false if Web3Helper returns no valid details', async () => {
      findOneStub.resolves(null)
      web3HelperStub.resolves({
        name: undefined,
        symbol: undefined,
      })

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.be.false
    })

    it('should return false and log error when an exception occurs', async () => {
      findOneStub.throws(new Error('Database connection error'))

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.be.false
    })

    it('should handle null values in prefetched tokenInfo properly', async () => {
      findOneStub.resolves(null)
      const prefetchedTokenInfo = {
        type: ITokenType.ERC20,
        name: undefined,
        symbol: undefined,
      }
      analyzeIfScamTokenStub.returns(false)

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet, prefetchedTokenInfo)

      expect(result).to.be.true
      expect(analyzeIfScamTokenStub.calledWith('', '')).to.be.true
    })

    it('should use prefetched tokenInfo and skip Web3Helper call', async () => {
      findOneStub.resolves(null)
      const prefetchedTokenInfo = {
        type: ITokenType.ERC20,
        name: 'PrefetchedToken',
        symbol: 'PFT',
      }
      analyzeIfScamTokenStub.returns(false)

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet, prefetchedTokenInfo)

      expect(result).to.be.true
      expect(web3HelperStub.called).to.be.false
      expect(analyzeIfScamTokenStub.calledWith('PrefetchedToken', 'PFT')).to.be.true
    })

    it('should handle undefined prefetched tokenInfo by falling back to Web3Helper', async () => {
      findOneStub.resolves(null)
      web3HelperStub.resolves({
        name: 'TokenName',
        symbol: 'TKN',
      })
      analyzeIfScamTokenStub.returns(false)

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet, undefined)

      expect(result).to.be.true
      expect(web3HelperStub.called).to.be.true
    })
  })
})
