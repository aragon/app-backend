import { Models } from '@dbModels'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import ProxyUtils from '@modules/proxyProvider/utils'
import { ProxyToken } from '@modules/proxyToken'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe('ProxyUtils', () => {
  let sandbox: sinon.SinonSandbox
  let loggerStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerStub = sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getProgressFromConfigIndexer', () => {
    it('should return ConfigIndexer data when a record exists', async () => {
      const network = NetworksEnum.ethereumMainnet
      const syncKey = 'test-sync-key'
      const mockConfigData = { lastSync: 5, end: false }

      const findExistingLogStub = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(mockConfigData)

      const result = await ProxyUtils.getProgressFromConfigIndexer(network, syncKey as any)

      expect(findExistingLogStub.calledOnceWith({ network, service: syncKey })).to.be.true
      expect(result).to.deep.equal(mockConfigData)
    })

    it('should return null when no record exists', async () => {
      const network = NetworksEnum.ethereumMainnet
      const syncKey = 'test-sync-key'

      const findExistingLogStub = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(null)

      const result = await ProxyUtils.getProgressFromConfigIndexer(network, syncKey as any)

      expect(findExistingLogStub.calledOnceWith({ network, service: syncKey })).to.be.true
      expect(result).to.be.null
    })
  })

  describe('updateProgressInConfigIndexer', () => {
    it('should update existing ConfigIndexer record when it exists', async () => {
      const network = NetworksEnum.ethereumMainnet
      const syncKey = 'test-sync-key'
      const lastPage = 10
      const hasMore = true

      const mockExistingRecord = {
        update: sandbox.stub().resolves(),
      }

      const findExistingLogStub = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(mockExistingRecord)
      const createStub = sandbox.stub(Models.ConfigIndexer, 'create')

      await ProxyUtils.updateProgressInConfigIndexer(network, syncKey as any, lastPage, hasMore)

      expect(findExistingLogStub.calledOnceWith({ network, service: syncKey })).to.be.true
      expect(mockExistingRecord.update.calledOnce).to.be.true
      expect(mockExistingRecord.update.calledWith({ lastSync: lastPage, end: hasMore })).to.be.true
      expect(createStub.notCalled).to.be.true
    })

    it('should create new ConfigIndexer record when none exists', async () => {
      const network = NetworksEnum.ethereumMainnet
      const syncKey = 'test-sync-key'
      const lastPage = 10
      const hasMore = true

      const findExistingLogStub = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(null)
      const createStub = sandbox.stub(Models.ConfigIndexer, 'create').resolves()

      await ProxyUtils.updateProgressInConfigIndexer(network, syncKey as any, lastPage, hasMore)

      expect(findExistingLogStub.calledOnceWith({ network, service: syncKey })).to.be.true
      expect(createStub.calledOnce).to.be.true
      expect(
        createStub.calledWith({
          network,
          service: syncKey,
          lastSync: lastPage,
          end: hasMore,
        }),
      ).to.be.true
    })
  })

  describe('enrichTokenBalances', () => {
    it('should enrich token balances with valid tokens', async () => {
      const network = NetworksEnum.ethereumMainnet
      const tokensBalance = [
        { contractAddress: '0xtoken1', tokenBalance: '1000', originalBalance: '1000', priceUsd: '1.5' },
        { contractAddress: '0xtoken2', tokenBalance: '2000', originalBalance: '2000', priceUsd: '2.5' },
      ]

      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      saveAndGetTokenStub.withArgs('0xtoken1', network).resolves({ address: '0xtoken1' } as any)
      saveAndGetTokenStub.withArgs('0xtoken2', network).resolves({ address: '0xtoken2' } as any)

      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress')
      parseAddressStub.withArgs('0xtoken1').returns('0xToken1Parsed')
      parseAddressStub.withArgs('0xtoken2').returns('0xToken2Parsed')

      const result = await ProxyUtils.enrichTokenBalances(tokensBalance, network)

      expect(result).to.have.lengthOf(2)
      expect(result[0].contractAddress).to.equal('0xToken1Parsed')
      expect(result[0].tokenBalance).to.equal('1000')
      expect(result[1].contractAddress).to.equal('0xToken2Parsed')
    })

    it('should filter out tokens that are not found', async () => {
      const network = NetworksEnum.ethereumMainnet
      const tokensBalance = [
        { contractAddress: '0xtoken1', tokenBalance: '1000', originalBalance: '1000', priceUsd: '1.5' },
        { contractAddress: '0xtoken2', tokenBalance: '2000', originalBalance: '2000', priceUsd: '2.5' },
      ]

      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      saveAndGetTokenStub.withArgs('0xtoken1', network).resolves({ address: '0xtoken1' } as any)
      saveAndGetTokenStub.withArgs('0xtoken2', network).resolves(null)

      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress')
      parseAddressStub.withArgs('0xtoken1').returns('0xToken1Parsed')

      const result = await ProxyUtils.enrichTokenBalances(tokensBalance, network)

      expect(result).to.have.lengthOf(1)
      expect(result[0].contractAddress).to.equal('0xToken1Parsed')
    })

    it('should use original address when parseAddress returns null', async () => {
      const network = NetworksEnum.ethereumMainnet
      const tokensBalance = [
        { contractAddress: '0xtoken1', tokenBalance: '1000', originalBalance: '1000', priceUsd: '1.5' },
      ]

      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ address: '0xtoken1' } as any)
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await ProxyUtils.enrichTokenBalances(tokensBalance, network)

      expect(result).to.have.lengthOf(1)
      expect(result[0].contractAddress).to.equal('0xtoken1')
    })

    it('should return empty array when all tokens are not found', async () => {
      const network = NetworksEnum.ethereumMainnet
      const tokensBalance = [
        { contractAddress: '0xtoken1', tokenBalance: '1000', originalBalance: '1000', priceUsd: '1.5' },
      ]

      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)

      const result = await ProxyUtils.enrichTokenBalances(tokensBalance, network)

      expect(result).to.be.an('array').that.is.empty
    })
  })
})
