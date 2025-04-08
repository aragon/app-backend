import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'
import { expect } from 'chai'
import config from '@config'
import logger from '@logger'
import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import ProxyWeb3Provider from '@modules/proxyProvider'
import DbOperations from '@models/utils/dbOperations'
import TokenFetcher from '@services/aragon-dao/tokenFetcher'
import { NetworksEnum } from '@types'

describe('TokenFetcher', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('start', () => {
    it('should initialize DBCrawler with correct parameters and start crawling', async () => {
      // Arrange
      const stubVerbose = sandbox.stub(logger, 'verbose')
      const stubOnDocument = sandbox.stub(TokenFetcher, 'onDocument')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onDocument({})
      })

      // Act
      await TokenFetcher.start()

      // Assert
      expect(stubVerbose.calledWithMatch('Start TokenFetcher' as any)).to.be.true
      expect(stubOnDocument.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true

      const crawlerArgs = crawlerStub.firstCall.thisValue
      expect(crawlerArgs.model).to.equal(Models.Token)
      expect(crawlerArgs.onDocument).to.equal(TokenFetcher.onDocument)
      expect(typeof crawlerArgs.onError).to.equal('function')
      expect(crawlerArgs.where).to.deep.equal({
        $and: [{ refetch: true }],
      })
      expect(crawlerArgs.batchSize).to.equal(config.CRAWLER_CONFIG.TOKEN_RATES_BATCH_SIZE)
      expect(crawlerArgs.concurrency).to.equal(config.CRAWLER_CONFIG.TOKEN_RATES_CONCURRENCY)
    })

    it('should handle errors during crawling', async () => {
      // Arrange
      const stubError = sandbox.stub(logger, 'error')
      const stubVerbose = sandbox.stub(logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError('Test error', {})
      })

      // Act
      await TokenFetcher.start()

      // Assert
      expect(stubVerbose.calledWithMatch('Start TokenFetcher' as any)).to.be.true
      expect(stubError.calledOnce).to.be.true
      expect(stubError.calledWithMatch('Error TokenFetcher' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should process tokens that need refetching', async () => {
      // Arrange
      const tokens = [
        {
          address: '0xtoken1',
          network: NetworksEnum.ethereumMainnet,
          refetch: true,
        },
        {
          address: '0xtoken2',
          network: NetworksEnum.ethereumMainnet,
          refetch: true,
        },
      ]


      const stubOnDocument = sandbox.stub(TokenFetcher, 'onDocument')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        for (const token of tokens) {
          await this.onDocument(token)
        }
      })

      // Act
      await TokenFetcher.start()

      // Assert
      expect(stubOnDocument.calledTwice).to.be.true
      expect(stubOnDocument.firstCall.args[0]).to.equal(tokens[0])
      expect(stubOnDocument.secondCall.args[0]).to.equal(tokens[1])
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  describe('onDocument', () => {
    it('should update token data when plugin is found and token data is valid', async () => {
      // Arrange
      const document = {
        id: 'token123',
        address: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
        refetch: true,
      }

      const plugin = { id: 'plugin1', name: 'Plugin1' }
      const tokenData = {
        totalSupply: '1000000000000000000000000',
        totalHolders: 500,
      }

      const findByTokenAddressStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(plugin)
      const fetchTokenHolderAndSupplyStub = sandbox
        .stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply')
        .resolves(tokenData)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()

      // Act
      await TokenFetcher.onDocument(document as any)

      // Assert
      expect(findByTokenAddressStub.calledOnce).to.be.true
      expect(findByTokenAddressStub.firstCall.args[0]).to.equal(document.address)
      expect(findByTokenAddressStub.firstCall.args[1]).to.equal(document.network)

      expect(fetchTokenHolderAndSupplyStub.calledOnce).to.be.true
      expect(fetchTokenHolderAndSupplyStub.firstCall.args[0]).to.deep.equal({
        address: document.address,
        network: document.network,
      })

      expect(updateDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.firstCall.args[0]).to.equal(document)
      expect(updateDocumentStub.firstCall.args[1]).to.deep.equal({
        totalSupply: tokenData.totalSupply,
        holders: tokenData.totalHolders,
        refetch: false,
      })
      expect(updateDocumentStub.firstCall.args[2]).to.deep.equal({
        logId: document.id,
        network: document.network,
        refetch: false,
      })
      expect(updateDocumentStub.firstCall.args[3]).to.equal('Token Fetcher Updated')
    })

    it('should handle case when no plugin is found', async () => {
      // Arrange
      const document = {
        id: 'token123',
        address: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
        refetch: true,
      }

      const stubWarn = sandbox.stub(logger, 'warn')
      const findByTokenAddressStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(null)
      const fetchTokenHolderAndSupplyStub = sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply')
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()

      // Act
      await TokenFetcher.onDocument(document as any)

      // Assert
      expect(findByTokenAddressStub.calledOnce).to.be.true
      expect(stubWarn.calledOnce).to.be.true
      expect(stubWarn.calledWithMatch('No plugin found for token during re-fetch.' as any)).to.be.true

      expect(updateDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.firstCall.args[0]).to.equal(document)
      expect(updateDocumentStub.firstCall.args[1]).to.deep.equal({
        refetch: false,
      })
      expect(updateDocumentStub.firstCall.args[3]).to.equal('Token Fetcher No Plugin')

      expect(fetchTokenHolderAndSupplyStub.notCalled).to.be.true
    })

    it('should not update when token data is empty or invalid', async () => {
      // Arrange
      const document = {
        id: 'token123',
        address: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
        refetch: true,
      }

      const plugin = { id: 'plugin1', name: 'Plugin1' }
      const tokenData = {
        totalSupply: '0',
        totalHolders: 0,
      }

      const stubWarn = sandbox.stub(logger, 'warn')
      const findByTokenAddressStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(plugin)
      const fetchTokenHolderAndSupplyStub = sandbox
        .stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply')
        .resolves(tokenData)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      // Act
      await TokenFetcher.onDocument(document as any)

      // Assert
      expect(findByTokenAddressStub.calledOnce).to.be.true
      expect(fetchTokenHolderAndSupplyStub.calledOnce).to.be.true
      expect(stubWarn.calledOnce).to.be.true
      expect(stubWarn.calledWithMatch('Token data not found during refetch' as any)).to.be.true
      expect(updateDocumentStub.notCalled).to.be.true
    })

    it('should handle errors during document processing', async () => {
      // Arrange
      const document = {
        id: 'token123',
        address: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
        refetch: true,
      }

      const error = new Error('Test error')
      const stubError = sandbox.stub(logger, 'error')
      const findByTokenAddressStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').throws(error)

      // Act
      await TokenFetcher.onDocument(document as any)

      // Assert
      expect(findByTokenAddressStub.calledOnce).to.be.true
      expect(stubError.calledOnce).to.be.true
      expect(stubError.calledWithMatch('Error onDocument TokenFetcher' as any)).to.be.true
    })
  })
})
