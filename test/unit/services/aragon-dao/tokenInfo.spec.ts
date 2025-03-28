import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import logger from '@logger'
import TokenDetailFetcherWithRetry from '@services/aragon-dao/tokenInfo'
import TokenDetailProvider from '@providers/tokenDetailProvider/providerFactory'
import Utils from '@helpers/utils'
import { FakeToken } from '@test/mock/fakeToken'
import DbOperations from '@models/utils/dbOperations'

describe('TokenDetailFetcherWithRetry', () => {
  let sandbox: SinonSandbox
  const tokenAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  const network = NetworksEnum.ethereumSepolia

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('hasValidInfo', () => {
    it('should return true for metrics with all required fields', () => {
      const validTokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        totalSupply: '1000',
        totalHolders: 10,
      }
      expect(TokenDetailFetcherWithRetry.hasValidInfo(validTokenDetails)).to.be.true
    })

    it('should return false when missing name', () => {
      const invalidTokenDetails = {
        name: '',
        symbol: 'TEST',
        totalSupply: '1000',
        totalHolders: 10,
      }
      expect(TokenDetailFetcherWithRetry.hasValidInfo(invalidTokenDetails)).to.be.false
    })

    it('should return false when missing symbol', () => {
      const invalidTokenDetails = {
        name: 'Test Token',
        symbol: '',
        totalSupply: '1000',
        totalHolders: 10,
      }
      expect(TokenDetailFetcherWithRetry.hasValidInfo(invalidTokenDetails)).to.be.false
    })

    it('should return false when missing totalSupply', () => {
      const invalidTokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        totalSupply: '',
        totalHolders: 10,
      }
      expect(TokenDetailFetcherWithRetry.hasValidInfo(invalidTokenDetails)).to.be.false
    })

    it('should return false when missing totalHolders', () => {
      const invalidTokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        totalSupply: '1000',
        totalHolders: 0,
      }
      expect(TokenDetailFetcherWithRetry.hasValidInfo(invalidTokenDetails)).to.be.false
    })
  })

  describe('pollWithRetry', () => {
    it('should return valid token details on first attempt', async () => {
      const mockTokenDb = { address: tokenAddress, network }
      const validTokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        totalSupply: '1000',
        totalHolders: 10,
        decimals: 18,
        priceUsd: '1.5',
      }

      sandbox.stub(Models.Token, 'findOne').resolves(mockTokenDb)
      sandbox.stub(TokenDetailProvider, 'fetchBasicTokenInfo').resolves(validTokenDetails)

      const result = await TokenDetailFetcherWithRetry.pollWithRetry(tokenAddress, network, {
        intervalMs: 10,
        timeoutMs: 50,
      })

      expect(result).to.deep.include({
        tokenDb: mockTokenDb,
        tokenDetails: validTokenDetails,
      })
    })

    it('should retry until valid metrics are returned', async () => {
      const mockTokenDb = { address: tokenAddress, network }
      const invalidTokenDetails = {
        name: '',
        symbol: '',
        totalSupply: '',
        totalHolders: 0,
      }
      const validTokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        totalSupply: '1000',
        totalHolders: 10,
        decimals: 18,
        priceUsd: '1.5',
      }

      const findOneStub = sandbox.stub(Models.Token, 'findOne')
      const fetchTokenInfoStub = sandbox.stub(TokenDetailProvider, 'fetchBasicTokenInfo')
      const waitStub = sandbox.stub(Utils, 'wait').resolves()

      findOneStub.resolves(mockTokenDb)
      fetchTokenInfoStub.onFirstCall().resolves(invalidTokenDetails).onSecondCall().resolves(validTokenDetails)

      const result = await TokenDetailFetcherWithRetry.pollWithRetry(tokenAddress, network, {
        intervalMs: 10,
        timeoutMs: 50,
      })

      expect(result).to.deep.include({
        tokenDb: mockTokenDb,
        tokenDetails: validTokenDetails,
      })
      expect(findOneStub.callCount).to.equal(2)
      expect(fetchTokenInfoStub.callCount).to.equal(2)
      expect(waitStub.callCount).to.equal(1)
    })

    it('should throw timeout error if no valid metrics found', async () => {
      const mockTokenDb = { address: tokenAddress, network }
      const invalidTokenDetails = {
        name: '',
        symbol: '',
        totalSupply: '',
        totalHolders: 0,
      }

      sandbox.stub(Models.Token, 'findOne').resolves(mockTokenDb)
      sandbox.stub(TokenDetailProvider, 'fetchBasicTokenInfo').resolves(invalidTokenDetails)
      sandbox.stub(Utils, 'wait').resolves()

      await expect(
        TokenDetailFetcherWithRetry.pollWithRetry(tokenAddress, network, {
          intervalMs: 10,
          timeoutMs: 50,
        }),
      ).to.be.rejectedWith('Token metrics polling timed out after 50ms')
    })

    it('should log error when token is not found on first attempt', async () => {
      sandbox
        .stub(Models.Token, 'findOne')
        .onFirstCall()
        .resolves(null)
        .onSecondCall()
        .resolves({ address: tokenAddress, network })

      const loggerStub = sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'verbose')
      sandbox.stub(TokenDetailProvider, 'fetchBasicTokenInfo').resolves({
        name: 'Test Token',
        symbol: 'TEST',
        totalSupply: '1000',
        totalHolders: 10,
        decimals: 18,
        priceUsd: '1.5',
      })

      await TokenDetailFetcherWithRetry.pollWithRetry(tokenAddress, network, {
        intervalMs: 10,
        timeoutMs: 50,
      })

      expect(loggerStub.calledWith('Token not found in DB. Waiting..' as any)).to.be.true
    })
  })

  describe('update', () => {
    it('should update token metrics successfully', async () => {
      await Models.Token.create({
        ...FakeToken,
        totalSupply: '0',
        holders: 0,
      })

      const validTokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        totalSupply: '1000',
        totalHolders: 10,
        decimals: 18,
        priceUsd: '1.5',
      }

      const pluginStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves({
        tokenAddress: FakeToken.address,
        network: FakeToken.network,
      })

      const loggerStub = sandbox.stub(logger, 'verbose')

      const tokenDetailProviderStub = sandbox
        .stub(TokenDetailProvider, 'fetchBasicTokenInfo')
        .resolves(validTokenDetails)

      await TokenDetailFetcherWithRetry.update(FakeToken.address, FakeToken.network)

      expect(pluginStub.calledOnce).to.be.eq(true)
      expect(pluginStub.calledWith(FakeToken.address, FakeToken.network)).to.be.true
      expect(tokenDetailProviderStub.calledOnce).to.be.true
      expect(tokenDetailProviderStub.args[0][0].address).to.be.eq(FakeToken.address)
      expect(loggerStub.called).to.be.true
      const token = await Models.Token.findOne({ address: FakeToken.address, network: FakeToken.network })
      expect(token.totalSupply).to.be.eq(validTokenDetails.totalSupply)
      expect(token.holders).to.be.eq(validTokenDetails.totalHolders)
      expect(token.decimals).to.be.eq(validTokenDetails.decimals)
      expect(token.priceUsd).to.be.eq(validTokenDetails.priceUsd)
    })

    it('should skip update if plugin token not found', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(null)
      const loggerStub = sandbox.stub(logger, 'warn')

      await TokenDetailFetcherWithRetry.update(tokenAddress, network)

      expect(pluginStub.calledOnceWith(tokenAddress, network)).to.be.true
      expect(loggerStub.calledOnce).to.be.true
    })

    it('throw error if token details update failed', async () => {
      const validTokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        totalSupply: '1000',
        totalHolders: 10,
        decimals: 18,
        priceUsd: '1.5',
      }

      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves({})

      const poolWithRetryStub = sandbox.stub(TokenDetailFetcherWithRetry, 'pollWithRetry').resolves({
        tokenDb: { address: tokenAddress, network },
        tokenDetails: validTokenDetails,
      })

      sandbox.stub(DbOperations, 'updateDocument').throws(new Error('Failed to update token'))

      const loggerStub = sandbox.stub(logger, 'error')

      await TokenDetailFetcherWithRetry.update(tokenAddress, network)

      expect(poolWithRetryStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
    })
  })
})
