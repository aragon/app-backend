import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import TokenDetailFetcherWithRetry from '@services/aragon-dao/tokenInfo'
import { Models } from '@dbModels'
import { NetworksEnum, ITokenType } from '@types'
import { expect } from 'chai'
import logger from '@logger'
import dayjs from '@helpers/dayjs'
import Token from '@models/schema/token'
import CovalentHelper from '@helpers/covalent'
import BlockScoutHelper from '@helpers/blockScout'
import utils from '@helpers/utils'
import DbOperations from '@models/utils/dbOperations'

describe('TokenDetailFetcherWithRetry Service', () => {
  let sandbox: SinonSandbox
  const tokenAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  const network = NetworksEnum.ethereumSepolia
  let rawToken: Partial<Token>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawToken = {
      network,
      type: ITokenType.ERC20,
      address: tokenAddress,
      logo: 'fake-logo',
      name: 'token name',
      symbol: 'WETH',
      decimals: 18,
      totalSupply: '0',
      holders: 0,
      priceUsd: '1',
      lastUpdatedAt: dayjs.utc().toDate() as any,
    }

    await Models.Token.create(rawToken)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('update', () => {
    it('should update token metrics successfully when plugin is attached', async () => {
      // Mock plugin being attached to token
      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves({ id: 'plugin-id' })

      // Mock token in DB
      const tokenDbMock = { ...rawToken, id: 'token-id' }

      // Mock metrics data
      const metricsData = { totalSupply: '1000', holders: 10 }

      // Create stubs
      const logVerboseStub = sandbox.stub(logger, 'verbose')
      const pollWithRetryStub = sandbox.stub(TokenDetailFetcherWithRetry, 'pollWithRetry').resolves({
        tokenDb: tokenDbMock,
        tokenDetails: metricsData,
      })
      const dbUpdateStub = sandbox.stub(DbOperations, 'updateDocument').resolves()

      // Execute update
      await TokenDetailFetcherWithRetry.update(tokenAddress, network)

      // Assert stubs were called correctly
      expect(pollWithRetryStub.calledOnce).to.be.true
      expect(dbUpdateStub.calledOnce).to.be.true
      expect(logVerboseStub.calledTwice).to.be.true

      // Verify update params
      const updateParams = dbUpdateStub.args[0]
      expect(updateParams[0]).to.equal(tokenDbMock)
      expect(updateParams[1]).to.deep.equal({
        totalSupply: metricsData.totalSupply,
        holders: metricsData.holders,
      })
      expect(updateParams[2]).to.deep.equal({ address: tokenAddress, network })
    })

    it('should skip update if no plugin is attached to token', async () => {
      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(null)

      const logWarnStub = sandbox.stub(logger, 'warn')
      const pollWithRetryStub = sandbox.stub(TokenDetailFetcherWithRetry, 'pollWithRetry')

      await TokenDetailFetcherWithRetry.update(tokenAddress, network)

      expect(logWarnStub.calledOnce).to.be.true
      expect(pollWithRetryStub.notCalled).to.be.true
    })

    it('should handle errors in pollWithRetry and continue execution', async () => {
      // Mock plugin being attached to token
      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves({ id: 'plugin-id' })

      // Make pollWithRetry throw error
      sandbox.stub(TokenDetailFetcherWithRetry, 'pollWithRetry').rejects(new Error('polling error'))

      const logVerboseStub = sandbox.stub(logger, 'verbose')
      const dbUpdateStub = sandbox.stub(DbOperations, 'updateDocument')

      await TokenDetailFetcherWithRetry.update(tokenAddress, network)

      expect(logVerboseStub.calledOnce).to.be.true
      expect(dbUpdateStub.notCalled).to.be.true
    })

    it('should handle errors during update execution', async () => {
      // Force an error in findByTokenAddress
      sandbox.stub(Models.Plugin, 'findByTokenAddress').rejects(new Error('db error'))

      const logErrorStub = sandbox.stub(logger, 'error')

      await TokenDetailFetcherWithRetry.update(tokenAddress, network)

      expect(logErrorStub.calledOnce).to.be.true
      expect(logErrorStub.args[0][0]).to.equal('Error updating token metrics')
    })
  })

  describe('fetchBasicTokenInfo', () => {
    it('should fetch token info from Covalent successfully', async () => {
      const tokenDb = { ...rawToken, id: 'token-id' }
      const covalentResponse = { totalSupply: '1000', totalHolders: 10 }

      // Mock Covalent response
      sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves(covalentResponse)

      // Mock BlockScout (shouldn't be called)
      const blockScoutStub = sandbox.stub(BlockScoutHelper, 'getTokenFullDetails')

      const result = await TokenDetailFetcherWithRetry.fetchBasicTokenInfo(tokenDb)

      expect(result).to.deep.equal({
        totalSupply: covalentResponse.totalSupply,
        holders: covalentResponse.totalHolders,
      })
      expect(blockScoutStub.notCalled).to.be.true
    })

    it('should fallback to BlockScout if Covalent returns empty values', async () => {
      const tokenDb = { ...rawToken, id: 'token-id' }
      const covalentResponse = { totalSupply: '0', totalHolders: 0 }
      const blockScoutResponse = { totalSupply: '2000', holders: 20 }

      // Mock Covalent returning empty data
      sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves(covalentResponse)

      // Mock BlockScout response
      sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves(blockScoutResponse as any)

      const result = await TokenDetailFetcherWithRetry.fetchBasicTokenInfo(tokenDb)

      expect(result).to.deep.equal({
        totalSupply: blockScoutResponse.totalSupply,
        holders: blockScoutResponse.holders,
      })
    })

    it('should handle BlockScout returning null', async () => {
      const tokenDb = { ...rawToken, id: 'token-id' }
      const covalentResponse = { totalSupply: '0', totalHolders: 0 }

      // Mock Covalent returning empty data
      sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves(covalentResponse)

      // Mock BlockScout returning null
      sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves(null)

      const result = await TokenDetailFetcherWithRetry.fetchBasicTokenInfo(tokenDb)

      expect(result).to.deep.equal({
        totalSupply: '0',
        holders: 0,
      })
    })
  })

  describe('pollWithRetry', () => {
    it('should return valid metrics on first attempt', async () => {
      const tokenDbMock = { ...rawToken, id: 'token-id' }
      const validMetrics = { totalSupply: '1000', holders: 10 }

      // Mock token lookup
      sandbox.stub(Models.Token, 'findOne').resolves(tokenDbMock)

      // Mock fetchBasicTokenInfo
      sandbox.stub(TokenDetailFetcherWithRetry, 'fetchBasicTokenInfo').resolves(validMetrics)

      // Mock hasValidInfo
      sandbox.stub(TokenDetailFetcherWithRetry, 'hasValidInfo').returns(true)

      const logVerboseStub = sandbox.stub(logger, 'verbose')

      const result = await TokenDetailFetcherWithRetry.pollWithRetry(tokenAddress, network)

      expect(result).to.deep.equal({
        tokenDb: tokenDbMock,
        tokenDetails: validMetrics,
      })
      expect(logVerboseStub.calledOnce).to.be.true
    })

    it('should retry until valid metrics are found', async () => {
      const tokenDbMock = { ...rawToken, id: 'token-id' }
      const invalidMetrics = { totalSupply: '0', holders: 0 }
      const validMetrics = { totalSupply: '1000', holders: 10 }

      sandbox.stub(Models.Token, 'findOne').resolves(tokenDbMock)

      const fetchInfoStub = sandbox.stub(TokenDetailFetcherWithRetry, 'fetchBasicTokenInfo')
      fetchInfoStub.onFirstCall().resolves(invalidMetrics)
      fetchInfoStub.onSecondCall().resolves(validMetrics)

      // Mock hasValidInfo behavior
      const hasValidInfoStub = sandbox.stub(TokenDetailFetcherWithRetry, 'hasValidInfo')
      hasValidInfoStub.onFirstCall().returns(false)
      hasValidInfoStub.onSecondCall().returns(true)

      // Mock wait function
      sandbox.stub(utils, 'wait').resolves()

      const logVerboseStub = sandbox.stub(logger, 'verbose')

      const result = await TokenDetailFetcherWithRetry.pollWithRetry(tokenAddress, network, {
        intervalMs: 10,
        timeoutMs: 500,
      })

      expect(fetchInfoStub.calledTwice).to.be.true
      expect(result).to.deep.equal({
        tokenDb: tokenDbMock,
        tokenDetails: validMetrics,
      })
      expect(logVerboseStub.calledOnce).to.be.true
    })

    it('should log warning when token not found in DB', async () => {
      // Mock token lookup returns null first time, then finds token
      const tokenLookupStub = sandbox.stub(Models.Token, 'findOne')
      tokenLookupStub.onFirstCall().resolves(null)
      tokenLookupStub.onSecondCall().resolves({ ...rawToken, id: 'token-id' })

      sandbox.stub(logger, 'verbose')
      // Mock valid metrics on second attempt
      sandbox.stub(TokenDetailFetcherWithRetry, 'fetchBasicTokenInfo').resolves({
        totalSupply: '1000',
        holders: 10,
      })

      // Always return valid on second attempt
      const hasValidInfoStub = sandbox.stub(TokenDetailFetcherWithRetry, 'hasValidInfo')
      hasValidInfoStub.returns(true)

      // Mock wait function
      sandbox.stub(utils, 'wait').resolves()

      const logWarnStub = sandbox.stub(logger, 'warn')

      await TokenDetailFetcherWithRetry.pollWithRetry(tokenAddress, network, { intervalMs: 10, timeoutMs: 500 })

      expect(logWarnStub.calledOnce).to.be.true
      expect(logWarnStub.args[0][0]).to.equal('Token not found in DB. Waiting..')
    })

    it('should timeout if no valid metrics are found within timeout period', async () => {
      const tokenDbMock = { ...rawToken, id: 'token-id' }
      const invalidMetrics = { totalSupply: '0', holders: 0 }

      // Always find token but never get valid metrics
      sandbox.stub(Models.Token, 'findOne').resolves(tokenDbMock)
      sandbox.stub(TokenDetailFetcherWithRetry, 'fetchBasicTokenInfo').resolves(invalidMetrics)
      sandbox.stub(TokenDetailFetcherWithRetry, 'hasValidInfo').returns(false)

      // Mock wait function
      sandbox.stub(utils, 'wait').resolves()

      try {
        await TokenDetailFetcherWithRetry.pollWithRetry(tokenAddress, network, { intervalMs: 10, timeoutMs: 50 })
        // Should not reach here
        expect.fail('Should have thrown timeout error')
      } catch (error: any) {
        expect(error.message).to.equal('Token metrics polling timed out after 50ms')
      }
    })
  })

  describe('hasValidInfo', () => {
    it('should return true for valid token details', () => {
      const validDetails = { totalSupply: '1000', holders: 10 }
      expect(TokenDetailFetcherWithRetry.hasValidInfo(validDetails)).to.be.true
    })

    it('should return true if only totalSupply is valid', () => {
      const partialDetails = { totalSupply: '1000', holders: 0 }
      expect(TokenDetailFetcherWithRetry.hasValidInfo(partialDetails)).to.be.true
    })

    it('should return true if only totalHolders is valid', () => {
      const partialDetails = { totalSupply: '0', holders: 10 }
      expect(TokenDetailFetcherWithRetry.hasValidInfo(partialDetails)).to.be.true
    })

    it('should return false if both totalSupply and totalHolders are invalid', () => {
      const invalidDetails = { totalSupply: '0', holders: 0 }
      expect(TokenDetailFetcherWithRetry.hasValidInfo(invalidDetails)).to.be.false
    })
  })
})
