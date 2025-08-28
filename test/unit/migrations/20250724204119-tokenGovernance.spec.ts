import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { Models } from '@dbModels'
import { expect } from 'chai'
import tokenGovernanceMigration from '@src/migrations/20250724204119-tokenGovernance'
import { IClockMode, NetworksEnum } from '@types'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import GovernanceVeHelper from '@helpers/governanceVe'
import logger from '@logger'

describe('migration: migrateTokenGovernance', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    // Reset migration state
    tokenGovernanceMigration.countDocs = 0
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('tokenGovernanceMigration', () => {
    it('should migrate token has clock mode', async () => {
      const dbTokenData = [
        {
          id: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3-ethereum-sepolia',
          network: NetworksEnum.ethereumSepolia,
          transactionHash: '0x81e8037e8b29b0faf09a7a8e024c3ebb87b2ca32bf628b591e870639c44655f5',
          blockNumber: 8575352,
          type: 'escrowAdapter' as any,
          address: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          mintableByDao: false,
          implementationAddress: '0x30005E2beebbFcE6ec94556ff43780d47cD68F90',
          logo: null,
          skipFetchRate: true,
          isGovernance: true,
          name: null,
          symbol: null,
          decimals: 18,
          underlying: null,
          holders: 0,
          totalSupply: '0',
          priceUsd: '0',
          hasDelegate: true,
          hasBalanceOfERC20: true,
          hasBalanceOfERC777: false,
          hasName: false,
          hasSymbol: false,
          hasDecimals: false,
          hasTotalSupply: false,
          refetch: false,
        },
      ]

      await Promise.all(dbTokenData.map(async data => Models.Token.create(data)))

      const stubGetClockMode = sandbox.stub(GovernanceErc20Helper, 'getClockMode').resolves(IClockMode.BlockNumber)
      const stubGetUnderlying = sandbox.stub(GovernanceVeHelper, 'getUnderlyingTokenNameAndSymbol').resolves({
        name: 'Test Token',
        symbol: 'TEST',
        underlying: '0x1234567890abcdef1234567890abcdef12345678',
      })

      await tokenGovernanceMigration.start()

      expect(stubGetClockMode.calledOnceWith(dbTokenData[0].address, dbTokenData[0].network)).to.be.true
      expect(stubGetUnderlying.calledOnceWith(dbTokenData[0].address, dbTokenData[0].network)).to.be.true

      const token = await Models.Token.findOne({ address: dbTokenData[0].address }).lean().exec()
      expect(token).to.exist
      expect(token.name).to.eq('Test Token')
      expect(token.symbol).to.eq('TEST')
      expect(token.underlying).to.eq('0x1234567890abcdef1234567890abcdef12345678')
    })

    it('should handle non-escrowAdapter tokens', async () => {
      const dbTokenData = {
        id: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3-ethereum-sepolia',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: '0x81e8037e8b29b0faf09a7a8e024c3ebb87b2ca32bf628b591e870639c44655f5',
        blockNumber: 8575352,
        type: 'ERC20', // Not escrowAdapter
        address: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
        isGovernance: true,
        name: 'Original Name',
        symbol: 'ORIG',
        decimals: 18,
      }

      await Models.Token.create(dbTokenData)

      const stubGetClockMode = sandbox.stub(GovernanceErc20Helper, 'getClockMode').resolves(IClockMode.Timestamp)
      const stubGetUnderlying = sandbox.stub(GovernanceVeHelper, 'getUnderlyingTokenNameAndSymbol')

      await tokenGovernanceMigration.start()

      expect(stubGetClockMode.calledOnceWith(dbTokenData.address, dbTokenData.network)).to.be.true
      expect(stubGetUnderlying.notCalled).to.be.true // Should not be called for non-escrowAdapter

      const token = await Models.Token.findOne({ address: dbTokenData.address }).lean().exec()
      expect(token).to.exist
      expect(token.clockMode).to.eq(IClockMode.Timestamp)
      expect(token.name).to.eq('Original Name') // Name should not change
      expect(token.symbol).to.eq('ORIG') // Symbol should not change
      expect(token.underlying).to.be.null // Underlying should not be set
    })

    it('should handle error during token processing', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      
      const dbTokenData = {
        id: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3-ethereum-sepolia',
        network: NetworksEnum.ethereumSepolia,
        address: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
        isGovernance: true,
        type: 'escrowAdapter' as any,
      }

      await Models.Token.create(dbTokenData)

      // Make getClockMode throw an error
      const stubGetClockMode = sandbox.stub(GovernanceErc20Helper, 'getClockMode').rejects(new Error('RPC Error'))

      // The migration should continue despite the error
      await tokenGovernanceMigration.start()

      expect(stubGetClockMode.called).to.be.true
      
      // Check that error was logged
      expect(loggerErrorStub.called).to.be.true
      expect(loggerErrorStub.firstCall.args[0]).to.equal('Error save token hasClockMode')
    })

    it('should handle migration failure', async () => {
      // Create multiple tokens to trigger the migration
      const dbTokenData = {
        id: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3-ethereum-sepolia',
        network: NetworksEnum.ethereumSepolia,
        address: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
        isGovernance: true,
      }

      await Models.Token.create(dbTokenData)

      // Stub the DBCrawler to throw an error
      const DBCrawler = require('@models/utils/crawler').default
      const originalCrawl = DBCrawler.prototype.crawl
      sandbox.stub(DBCrawler.prototype, 'crawl').rejects(new Error('Crawler failed'))
      
      const logErrorStub = sandbox.stub(console, 'error')

      try {
        await tokenGovernanceMigration.start()
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Crawler failed')
        
        // Check that error was logged
        const errorCalls = logErrorStub.getCalls().filter(call => 
          call.args[0]?.includes('Migration failed')
        )
        expect(errorCalls.length).to.be.greaterThan(0)
      }
    })

    it('should process multiple tokens correctly', async () => {
      const tokens = [
        {
          id: '0x111-ethereum-sepolia',
          network: NetworksEnum.ethereumSepolia,
          address: '0x1111111111111111111111111111111111111111',
          isGovernance: true,
          type: 'ERC20',
        },
        {
          id: '0x222-ethereum-sepolia',
          network: NetworksEnum.ethereumSepolia,
          address: '0x2222222222222222222222222222222222222222',
          isGovernance: true,
          type: 'escrowAdapter' as any,
        },
      ]

      await Promise.all(tokens.map(async data => Models.Token.create(data)))

      const stubGetClockMode = sandbox.stub(GovernanceErc20Helper, 'getClockMode')
      stubGetClockMode.onCall(0).resolves(IClockMode.BlockNumber)
      stubGetClockMode.onCall(1).resolves(IClockMode.Timestamp)

      const stubGetUnderlying = sandbox.stub(GovernanceVeHelper, 'getUnderlyingTokenNameAndSymbol').resolves({
        name: 'Underlying Token',
        symbol: 'UNDER',
        underlying: '0x3333333333333333333333333333333333333333',
      })

      await tokenGovernanceMigration.start()

      expect(stubGetClockMode.callCount).to.equal(2)
      expect(stubGetUnderlying.calledOnce).to.be.true // Only called for escrowAdapter

      const token1 = await Models.Token.findOne({ address: tokens[0].address }).lean().exec()
      expect(token1.clockMode).to.eq(IClockMode.BlockNumber)
      expect(token1.underlying).to.be.null

      const token2 = await Models.Token.findOne({ address: tokens[1].address }).lean().exec()
      expect(token2.clockMode).to.eq(IClockMode.Timestamp)
      expect(token2.underlying).to.eq('0x3333333333333333333333333333333333333333')
      expect(token2.name).to.eq('Underlying Token')
      expect(token2.symbol).to.eq('UNDER')
    })

    it('should only process governance tokens', async () => {
      const tokens = [
        {
          id: '0x111-ethereum-sepolia',
          network: NetworksEnum.ethereumSepolia,
          address: '0x1111111111111111111111111111111111111111',
          isGovernance: true,
          type: 'ERC20',
        },
        {
          id: '0x222-ethereum-sepolia',
          network: NetworksEnum.ethereumSepolia,
          address: '0x2222222222222222222222222222222222222222',
          isGovernance: false, // Not a governance token
          type: 'ERC20',
        },
      ]

      await Promise.all(tokens.map(async data => Models.Token.create(data)))

      const stubGetClockMode = sandbox.stub(GovernanceErc20Helper, 'getClockMode').resolves(IClockMode.BlockNumber)

      await tokenGovernanceMigration.start()

      expect(stubGetClockMode.calledOnce).to.be.true // Only called for governance token
      expect(stubGetClockMode.calledWith(tokens[0].address, tokens[0].network)).to.be.true

      const token1 = await Models.Token.findOne({ address: tokens[0].address }).lean().exec()
      expect(token1.clockMode).to.eq(IClockMode.BlockNumber)

      const token2 = await Models.Token.findOne({ address: tokens[1].address }).lean().exec()
      expect(token2.clockMode).to.be.null // Should not have clockMode set
    })
  })
})
