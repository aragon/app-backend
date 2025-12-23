import BlockScoutHelper from '@helpers/blockScout'
import TokenUtils from '@helpers/tokenUtils'
import utils from '@helpers/utils'
import logger from '@logger'
import BlockScoutProvider from '@modules/proxyProvider/blockscoutProvider'
import { ProxyToken } from '@modules/proxyToken'
import { ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Modules: BlockScoutProvider', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('getTokenBalances', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678'
    const network = NetworksEnum.ethereumMainnet

    const mockTokenInfo = {
      address: '0xa0b86a33e6776896ada63c629b4ed1d8fe7dbcc3',
      name: 'Test Token',
      symbol: 'TT',
      decimals: 18,
      priceUsd: '1.0',
      type: ITokenType.ERC20,
    }

    const mockTokenBalance = {
      contractAddress: '0xa0b86a33e6776896ada63c629b4ed1d8fe7dbcc3',
      tokenBalance: '1000000000000000000',
      tokenName: 'Test Token',
      tokenSymbol: 'TT',
      tokenDecimals: '18',
      tokenType: 'ERC-20',
    }

    beforeEach(() => {
      sandbox.stub(BlockScoutHelper, 'getTokenBalances').resolves([mockTokenBalance])
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockTokenInfo as any)
      sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(false)
    })

    it('should fetch and parse token balances successfully', async () => {
      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result).to.have.length(1)
      expect(result[0]).to.deep.include({
        contractAddress: '0xa0B86a33e6776896Ada63c629B4ED1d8FE7dbCc3',
        tokenBalance: '1.0',
        originalBalance: '1000000000000000000',
      })
    })

    it('should handle multiple token balances', async () => {
      const mockTokenBalances = [
        {
          contractAddress: '0xa0b86a33e6776896ada63c629b4ed1d8fe7dbcc3',
          tokenBalance: '1000000000000000000',
          tokenName: 'Test Token 1',
          tokenSymbol: 'TT1',
          tokenDecimals: '18',
          tokenType: 'ERC-20',
        },
        {
          contractAddress: '0xb0b86a33e6776896ada63c629b4ed1d8fe7dbcc4',
          tokenBalance: '500000',
          tokenName: 'Test Token 2',
          tokenSymbol: 'TT2',
          tokenDecimals: '6',
          tokenType: 'ERC-20',
        },
      ]

      const mockTokenInfo2 = {
        address: '0xb0b86a33e6776896ada63c629b4ed1d8fe7dbcc4',
        name: 'Test Token 2',
        symbol: 'TT2',
        decimals: 6,
        priceUsd: '2.0',
        type: ITokenType.ERC20,
      }

      const getTokenBalancesStub = BlockScoutHelper.getTokenBalances as sinon.SinonStub
      const saveAndGetTokenStub = ProxyToken.saveAndGetToken as sinon.SinonStub
      const analyzeIfScamTokenStub = TokenUtils.analyzeIfScamToken as sinon.SinonStub

      getTokenBalancesStub.resolves(mockTokenBalances)
      saveAndGetTokenStub.onFirstCall().resolves(mockTokenInfo as any)
      saveAndGetTokenStub.onSecondCall().resolves(mockTokenInfo2 as any)
      analyzeIfScamTokenStub.returns(false)

      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result).to.have.length(2)
      expect(result[0].tokenBalance).to.equal('1.0')
      expect(result[1].tokenBalance).to.equal('0.5')
    })

    it('should filter out tokens with empty data balance', async () => {
      const mockTokenBalanceWithEmptyData = {
        ...mockTokenBalance,
        tokenBalance: '0x',
      }

      const getTokenBalancesStub = BlockScoutHelper.getTokenBalances as sinon.SinonStub
      const saveAndGetTokenStub = ProxyToken.saveAndGetToken as sinon.SinonStub
      const analyzeIfScamTokenStub = TokenUtils.analyzeIfScamToken as sinon.SinonStub

      getTokenBalancesStub.resolves([mockTokenBalanceWithEmptyData])
      saveAndGetTokenStub.resolves(mockTokenInfo as any)
      analyzeIfScamTokenStub.returns(false)
      sandbox.stub(utils, 'emptyData').value('0x')

      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result).to.have.length(0)
    })

    it('should filter out tokens that are not found in database', async () => {
      const getTokenBalancesStub = BlockScoutHelper.getTokenBalances as sinon.SinonStub
      const saveAndGetTokenStub = ProxyToken.saveAndGetToken as sinon.SinonStub
      const analyzeIfScamTokenStub = TokenUtils.analyzeIfScamToken as sinon.SinonStub

      getTokenBalancesStub.resolves([mockTokenBalance])
      saveAndGetTokenStub.resolves(null)
      analyzeIfScamTokenStub.returns(false)

      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result).to.have.length(0)
    })

    it('should filter out scam tokens', async () => {
      const getTokenBalancesStub = BlockScoutHelper.getTokenBalances as sinon.SinonStub
      const saveAndGetTokenStub = ProxyToken.saveAndGetToken as sinon.SinonStub
      const analyzeIfScamTokenStub = TokenUtils.analyzeIfScamToken as sinon.SinonStub

      getTokenBalancesStub.resolves([mockTokenBalance])
      saveAndGetTokenStub.resolves(mockTokenInfo as any)
      analyzeIfScamTokenStub.returns(true)

      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result).to.have.length(0)
    })

    it('should handle NFT tokens (ERC-721)', async () => {
      const mockNFTBalance = {
        contractAddress: '0xc0b86a33e6776896ada63c629b4ed1d8fe7dbcc5',
        tokenBalance: '1',
        tokenName: 'NFT Collection',
        tokenSymbol: 'NFT',
        tokenDecimals: '0',
        tokenType: 'ERC-721',
      }

      const mockNFTInfo = {
        address: '0xc0b86a33e6776896ada63c629b4ed1d8fe7dbcc5',
        name: 'NFT Collection',
        symbol: 'NFT',
        decimals: 0,
        priceUsd: '0',
        type: ITokenType.ERC721,
      }

      const getTokenBalancesStub = BlockScoutHelper.getTokenBalances as sinon.SinonStub
      const saveAndGetTokenStub = ProxyToken.saveAndGetToken as sinon.SinonStub
      const analyzeIfScamTokenStub = TokenUtils.analyzeIfScamToken as sinon.SinonStub

      getTokenBalancesStub.resolves([mockNFTBalance])
      saveAndGetTokenStub.resolves(mockNFTInfo as any)
      analyzeIfScamTokenStub.returns(false)

      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result).to.have.length(1)
      expect(result[0].tokenBalance).to.equal('1')
    })

    it('should handle empty token balance list', async () => {
      const getTokenBalancesStub = BlockScoutHelper.getTokenBalances as sinon.SinonStub
      getTokenBalancesStub.resolves([])

      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result).to.be.an('array').that.is.empty
    })

    it('should handle errors gracefully', async () => {
      const getTokenBalancesStub = BlockScoutHelper.getTokenBalances as sinon.SinonStub
      getTokenBalancesStub.rejects(new Error('API Error'))

      const loggerStub = sandbox.stub(logger, 'error')

      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result).to.be.an('array').that.is.empty
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Error in getTokenBalances' as any)).to.be.true
    })

    it('should properly format addresses using ethers.getAddress', async () => {
      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result[0].contractAddress).to.equal('0xa0B86a33e6776896Ada63c629B4ED1d8FE7dbCc3')
    })

    it('should preserve original balance for reference', async () => {
      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result[0].originalBalance).to.equal('1000000000000000000')
      expect(result[0].tokenBalance).to.equal('1.0')
    })
  })
})
