import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import TokenMetrics from '@services/aragon-dao/tokenInfo'
import { Models } from '@dbModels'
import { type ITokenMetrics, ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import logger from '@logger'
import dayjs from '@helpers/dayjs'
import Token from '@models/schema/token'
import CovalentHelper from '@helpers/covalent'
import utils from '@helpers/utils'

describe('TokenInfo Service', () => {
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
      priceChangeOnDayUsd: '1',
      priceUsd: '1',
      lastUpdatedAt: dayjs.utc().toDate() as any,
    }

    await Models.Token.create(rawToken)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('update', async () => {
    it('should update metrics', async () => {
      const metricsMock = { totalSupply: '1000', totalHolders: 10 }

      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubMetrics = sandbox.stub(TokenMetrics, 'pollWithRetry').resolves(metricsMock)

      await TokenMetrics.update(tokenAddress, network)

      const token = await Models.Token.findByTokenAddressAndNetwork(tokenAddress, network)
      expect(token.totalSupply).to.equal(metricsMock.totalSupply)
      expect(token.holders).to.equal(metricsMock.totalHolders)
      expect(stubMetrics.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })

    it('should skip if token not found', async () => {
      const metricsMock = { totalSupply: '1000', totalHolders: 10 }

      const stubLogger = sandbox.stub(logger, 'warn')
      const stubMetrics = sandbox.stub(TokenMetrics, 'pollWithRetry').resolves(metricsMock)
      await TokenMetrics.update('0xED79E70122E06bB036EB6668e772FaCE4566a4cC', network)

      const token = await Models.Token.findByTokenAddressAndNetwork(tokenAddress, network)
      expect(token.totalSupply).to.equal('0')
      expect(token.holders).to.equal(0)
      expect(stubMetrics.notCalled).to.be.true
      expect(stubLogger.calledOnceWith('Token not found' as any)).to.be.true
    })

    it('should skip if metrics fails', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')
      sandbox.stub(TokenMetrics, 'pollWithRetry').rejects(new Error('fake-error'))
      await TokenMetrics.update(tokenAddress, network)

      const token = await Models.Token.findByTokenAddressAndNetwork(tokenAddress, network)
      expect(token.totalSupply).to.equal('0')
      expect(token.holders).to.equal(0)
      expect(stubLogger.notCalled).to.be.true
    })

    it('should throw an error', async () => {
      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').rejects(new Error('fake-error'))
      await TokenMetrics.update(tokenAddress, network)

      expect(stubLogger.calledOnceWith('Failed to update token metrics' as any)).to.be.true
    })
  })

  describe('update', async () => {
    it('should return valid metrics on first attempt', async () => {
      const metricsMock = { totalSupply: '1000', totalHolders: 10 }
      const stubMetrics = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves(metricsMock)
      const stubLogger = sandbox.stub(logger, 'error')

      const result = await TokenMetrics.pollWithRetry(tokenAddress, network)

      expect(result).to.deep.equal(metricsMock)
      expect(stubMetrics.calledOnce).to.be.true
      expect(stubLogger.notCalled).to.be.true
    })

    it('should retry until valid metrics are returned', async () => {
      const validMetrics = { totalSupply: '1000', totalHolders: 10 }
      const invalidMetrics = { totalSupply: '0', totalHolders: 0 }
      const stubMetrics = sandbox
        .stub(CovalentHelper, 'getTokenSupplyAndHolders')
        .onFirstCall()
        .resolves(invalidMetrics)
        .onSecondCall()
        .resolves(validMetrics)

      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(utils, 'wait').resolves()

      const result = await TokenMetrics.pollWithRetry(tokenAddress, network, { intervalMs: 10, timeoutMs: 50 })

      expect(result).to.deep.equal(validMetrics)
      expect(stubMetrics.callCount).to.equal(2)
      expect(stubLogger.notCalled).to.be.true
    })

    it('should timeout if no valid metrics are found', async () => {
      const invalidMetrics = { totalSupply: '0', totalHolders: 0 }
      const stubMetrics = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves(invalidMetrics)
      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(utils, 'wait').resolves()

      await expect(
        TokenMetrics.pollWithRetry(tokenAddress, network, { intervalMs: 10, timeoutMs: 50 }),
      ).to.be.rejectedWith(`Token metrics polling timed out after 50ms`)

      expect(stubMetrics.callCount).to.be.greaterThan(1)
      expect(stubLogger.notCalled).to.be.true
    })
  })

  describe('TokenMetrics Service - isValidMetrics', () => {
    it('should return true for valid metrics', () => {
      const validMetrics: ITokenMetrics = { totalSupply: '1000', totalHolders: 10 }
      expect(TokenMetrics.isValidMetrics(validMetrics)).to.be.true
    })

    it('should return false for metrics with zero totalHolders', () => {
      const invalidMetrics: ITokenMetrics = { totalSupply: '1000', totalHolders: 0 }
      expect(TokenMetrics.isValidMetrics(invalidMetrics)).to.be.false
    })

    it('should return false for metrics with zero totalSupply', () => {
      const invalidMetrics: ITokenMetrics = { totalSupply: '0', totalHolders: 10 }
      expect(TokenMetrics.isValidMetrics(invalidMetrics)).to.be.false
    })

    it('should return false for metrics with zero totalSupply and zero totalHolders', () => {
      const invalidMetrics: ITokenMetrics = { totalSupply: '0', totalHolders: 0 }
      expect(TokenMetrics.isValidMetrics(invalidMetrics)).to.be.false
    })
  })
})
