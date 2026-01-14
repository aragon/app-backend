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

  describe('getSpamScore', () => {
    it('should return 0 for legitimate tokens with logo', () => {
      expect(TokenUtils.getSpamScore('Ethereum', 'ETH', 'https://logo.com/eth.png')).to.equal(0)
      expect(TokenUtils.getSpamScore('Bitcoin', 'BTC', 'https://logo.com/btc.png')).to.equal(0)
      expect(TokenUtils.getSpamScore('Uniswap', 'UNI', 'https://logo.com/uni.png')).to.equal(0)
    })

    it('should return 1 for legitimate tokens without logo', () => {
      expect(TokenUtils.getSpamScore('Ethereum', 'ETH', null)).to.equal(1)
      expect(TokenUtils.getSpamScore('Ethereum', 'ETH', '')).to.equal(1)
    })

    it('should return 3+ for URL in name/symbol', () => {
      expect(TokenUtils.getSpamScore('Visit https://scam.com', 'TKN', 'logo')).to.be.gte(3)
      expect(TokenUtils.getSpamScore('Token', 'www.scam.com', 'logo')).to.be.gte(3)
    })

    it('should return 2 for high-risk keywords', () => {
      expect(TokenUtils.getSpamScore('Airdrop Token', 'AIR', 'logo')).to.equal(2)
      expect(TokenUtils.getSpamScore('Free Bonus', 'FREE', 'logo')).to.be.gte(2)
      expect(TokenUtils.getSpamScore('Casino Token', 'CAS', 'logo')).to.equal(2)
    })

    it('should return 1 for low-risk keywords with logo', () => {
      expect(TokenUtils.getSpamScore('Claim Token', 'CLM', 'logo')).to.equal(1)
      expect(TokenUtils.getSpamScore('Reward Token', 'RWD', 'logo')).to.equal(1)
    })

    it('should accumulate scores for multiple indicators', () => {
      // URL (3) + high-risk (2) + low-risk (1) + no logo (1) = 7
      expect(TokenUtils.getSpamScore('Free Airdrop https://scam.com', 'CLAIM', null)).to.be.gte(6)
    })

    it('should handle null/undefined inputs', () => {
      expect(TokenUtils.getSpamScore(null as any, 'TKN', 'logo')).to.equal(0)
      expect(TokenUtils.getSpamScore('Token', null as any, 'logo')).to.equal(0)
      expect(TokenUtils.getSpamScore(null as any, null as any, 'logo')).to.equal(0)
    })

    it('should detect red flags', () => {
      expect(TokenUtils.getSpamScore('Token ▶ Visit', 'TKN', 'logo')).to.be.gte(2)
      expect(TokenUtils.getSpamScore('use official link now', 'TKN', 'logo')).to.be.gte(2)
    })
  })

  describe('analyzeIfSpamToken', () => {
    it('should return true when score >= 3', () => {
      expect(TokenUtils.analyzeIfSpamToken('Visit https://claim.rewards.com', 'TKN')).to.be.true
      expect(TokenUtils.analyzeIfSpamToken('Free Airdrop', 'TKN', null)).to.be.true
    })

    it('should return false when score < 3', () => {
      expect(TokenUtils.analyzeIfSpamToken('Ethereum', 'ETH', 'logo')).to.be.false
      expect(TokenUtils.analyzeIfSpamToken('Claim Token', 'CLM', 'logo')).to.be.false // score = 1
    })

    it('should handle null or undefined inputs', () => {
      expect(TokenUtils.analyzeIfSpamToken(null as any, 'TKN', 'logo')).to.be.false
      expect(TokenUtils.analyzeIfSpamToken('Token', null as any, 'logo')).to.be.false
      expect(TokenUtils.analyzeIfSpamToken(null as any, null as any, 'logo')).to.be.false
    })

    it('should return false for legitimate token names', () => {
      expect(TokenUtils.analyzeIfSpamToken('Ethereum', 'ETH', 'logo')).to.be.false
      expect(TokenUtils.analyzeIfSpamToken('Bitcoin', 'BTC', 'logo')).to.be.false
      expect(TokenUtils.analyzeIfSpamToken('Staking Token', 'STK', 'logo')).to.be.false
    })
  })

  describe('determineIfSpam', () => {
    it('should return true for high score (>= 5) regardless of CoinGecko data', () => {
      const coinGeckoInfo = { priceUsd: '1.5', name: 'Token', symbol: 'TKN' }
      expect(TokenUtils.determineIfSpam('Free Airdrop https://scam.com', 'CLAIM', null, coinGeckoInfo)).to.be.true
    })

    it('should return false for score 0', () => {
      expect(TokenUtils.determineIfSpam('Ethereum', 'ETH', 'logo', null)).to.be.false
    })

    it('should return false for borderline score with valid CoinGecko data', () => {
      const coinGeckoInfo = { priceUsd: '1.5', name: 'Token', symbol: 'TKN' }
      expect(TokenUtils.determineIfSpam('Free Token', 'FREE', 'logo', coinGeckoInfo)).to.be.false // score = 2
    })

    it('should return true for borderline score without CoinGecko data', () => {
      expect(TokenUtils.determineIfSpam('Free Token', 'FREE', 'logo', null)).to.be.true // score = 2, no CoinGecko
    })

    it('should consider CoinGecko name as valid data even with zero price', () => {
      const coinGeckoInfo = { priceUsd: '0', name: 'Token', symbol: 'TKN' }
      expect(TokenUtils.determineIfSpam('Airdrop Token', 'AIR', 'logo', coinGeckoInfo)).to.be.false // score = 2
    })

    it('should return true for score >= 2 with empty CoinGecko data', () => {
      const coinGeckoInfo = { priceUsd: '0', name: '', symbol: '' }
      expect(TokenUtils.determineIfSpam('Airdrop Token', 'AIR', 'logo', coinGeckoInfo)).to.be.true // score = 2
    })
  })

  describe('shouldMarkAsSpam', () => {
    it('should return false for testnet tokens', () => {
      const result = TokenUtils.shouldMarkAsSpam({
        name: 'Free Airdrop',
        symbol: 'SPAM',
        logo: null,
        tokenType: ITokenType.ERC20,
        isGovernance: false,
        isTestnet: true,
        coinGeckoInfo: null,
      })
      expect(result).to.be.false
    })

    it('should return false for governance tokens', () => {
      const result = TokenUtils.shouldMarkAsSpam({
        name: 'Free Airdrop',
        symbol: 'SPAM',
        logo: null,
        tokenType: ITokenType.ERC20,
        isGovernance: true,
        isTestnet: false,
        coinGeckoInfo: null,
      })
      expect(result).to.be.false
    })

    it('should return false for native tokens', () => {
      const result = TokenUtils.shouldMarkAsSpam({
        name: 'Free Airdrop',
        symbol: 'SPAM',
        logo: null,
        tokenType: ITokenType.native,
        isGovernance: false,
        isTestnet: false,
        coinGeckoInfo: null,
      })
      expect(result).to.be.false
    })

    it('should return false for escrowAdapter tokens', () => {
      const result = TokenUtils.shouldMarkAsSpam({
        name: 'Free Airdrop',
        symbol: 'SPAM',
        logo: null,
        tokenType: ITokenType.escrowAdapter,
        isGovernance: false,
        isTestnet: false,
        coinGeckoInfo: null,
      })
      expect(result).to.be.false
    })

    it('should return true for spam token on mainnet', () => {
      const result = TokenUtils.shouldMarkAsSpam({
        name: 'Free Airdrop https://scam.com',
        symbol: 'SPAM',
        logo: null,
        tokenType: ITokenType.ERC20,
        isGovernance: false,
        isTestnet: false,
        coinGeckoInfo: null,
      })
      expect(result).to.be.true
    })

    it('should return false for legit token with CoinGecko data', () => {
      const result = TokenUtils.shouldMarkAsSpam({
        name: 'Airdrop Token',
        symbol: 'AIR',
        logo: 'https://logo.com/air.png',
        tokenType: ITokenType.ERC20,
        isGovernance: false,
        isTestnet: false,
        coinGeckoInfo: { priceUsd: '1.5', name: 'Airdrop Token', symbol: 'AIR' },
      })
      expect(result).to.be.false
    })
  })

  describe('isTokenSyncable', () => {
    let findOneStub: sinon.SinonStub
    let web3HelperStub: sinon.SinonStub
    let analyzeIfSpamTokenStub: sinon.SinonStub

    beforeEach(() => {
      findOneStub = sandbox.stub(Models.Token, 'findOne')
      web3HelperStub = sandbox.stub(Web3Helper, 'getTokenNameAndSymbol')
      analyzeIfSpamTokenStub = sandbox.stub(TokenUtils, 'analyzeIfSpamToken')
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
      analyzeIfSpamTokenStub.returns(false)

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet, prefetchedTokenInfo)

      expect(result).to.be.true
      expect(analyzeIfSpamTokenStub.calledWith('TokenName', 'TKN')).to.be.true
      expect(web3HelperStub.called).to.be.false
    })

    it('should return false if prefetched tokenInfo is scam token', async () => {
      findOneStub.resolves(null)
      const prefetchedTokenInfo = {
        type: ITokenType.ERC20,
        name: 'Claim Free Tokens at scam.com',
        symbol: 'SCAM',
      }
      analyzeIfSpamTokenStub.returns(true)

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
      analyzeIfSpamTokenStub.returns(false)

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet, prefetchedTokenInfo)

      expect(result).to.be.true
      expect(web3HelperStub.called).to.be.true
      expect(analyzeIfSpamTokenStub.calledWith('Web3TokenName', 'W3T')).to.be.true
    })

    it('should try Web3Helper if no prefetched tokenInfo provided', async () => {
      findOneStub.resolves(null)
      web3HelperStub.resolves({
        name: 'TokenName',
        symbol: 'TKN',
      })
      analyzeIfSpamTokenStub.returns(false)

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.be.true
      expect(analyzeIfSpamTokenStub.calledWith('TokenName', 'TKN')).to.be.true
    })

    it('should return false if Web3Helper returns scam token details', async () => {
      findOneStub.resolves(null)
      web3HelperStub.resolves({
        name: 'Claim Rewards',
        symbol: 'scam.io',
      })
      analyzeIfSpamTokenStub.returns(true)

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
      analyzeIfSpamTokenStub.returns(false)

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet, prefetchedTokenInfo)

      expect(result).to.be.true
      expect(analyzeIfSpamTokenStub.calledWith('', '')).to.be.true
    })

    it('should use prefetched tokenInfo and skip Web3Helper call', async () => {
      findOneStub.resolves(null)
      const prefetchedTokenInfo = {
        type: ITokenType.ERC20,
        name: 'PrefetchedToken',
        symbol: 'PFT',
      }
      analyzeIfSpamTokenStub.returns(false)

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet, prefetchedTokenInfo)

      expect(result).to.be.true
      expect(web3HelperStub.called).to.be.false
      expect(analyzeIfSpamTokenStub.calledWith('PrefetchedToken', 'PFT')).to.be.true
    })

    it('should handle undefined prefetched tokenInfo by falling back to Web3Helper', async () => {
      findOneStub.resolves(null)
      web3HelperStub.resolves({
        name: 'TokenName',
        symbol: 'TKN',
      })
      analyzeIfSpamTokenStub.returns(false)

      const result = await TokenUtils.isTokenSyncable('0x123', NetworksEnum.ethereumMainnet, undefined)

      expect(result).to.be.true
      expect(web3HelperStub.called).to.be.true
    })
  })
})
