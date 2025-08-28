import * as sinon from 'sinon'
import { expect } from 'chai'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { Models } from '@dbModels'
import logger from '@logger'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { NetworksEnum } from '@types'

describe('AragonDao: DaoTransactions', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should process all transfer types successfully', async () => {
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')
      const mockDao = {
        id: 'test-dao-id',
        address: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1000,
      }

      const findByAddressStub = sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao)
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()

      // Execute
      await DaoTransactions.start({
        daoAddress: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
      })

      // Verify
      expect(findByAddressStub.calledOnce).to.be.true
      expect(findByAddressStub.calledWith('0x0000000000000000000000000000000000000123', NetworksEnum.ethereumMainnet))
        .to.be.true

      // We expect 4 crawlers to be created and crawl to be called 4 times
      // 1. incoming token transfers
      // 2. outgoing token transfers
      // 3. native deposits
      // 4. executed events (withdrawals)
      expect(crawlStub.callCount).to.equal(4)

      expect(verboseLoggerStub.calledWith(sinon.match('Start DaoTransactions'))).to.be.true
      expect(verboseLoggerStub.calledWith(sinon.match('End DaoTransactions'))).to.be.true
    })

    it('should exit gracefully if DAO is not found', async () => {
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')
      const findByAddressStub = sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')

      // Execute
      await DaoTransactions.start({
        daoAddress: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
      })

      // Verify
      expect(findByAddressStub.calledOnce).to.be.true
      expect(crawlStub.called).to.be.false
      expect(verboseLoggerStub.calledWith(sinon.match('Start DaoTransactions'))).to.be.true
      // When DAO is not found, it exits early without logging End
      expect(verboseLoggerStub.calledWith(sinon.match('End DaoTransactions'))).to.be.false
    })

    it('should handle errors gracefully', async () => {
      const errorLoggerStub = sandbox.stub(logger, 'error')
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      const findByAddressStub = sandbox.stub(Models.Dao, 'findByAddress').rejects(new Error('Database error'))

      // Execute
      await DaoTransactions.start({
        daoAddress: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
      })

      // Verify
      expect(findByAddressStub.calledOnce).to.be.true
      expect(errorLoggerStub.calledOnce).to.be.true
      expect(errorLoggerStub.firstCall.args[0]).to.equal('Error start DaoTransactions')
      expect(verboseLoggerStub.calledWith(sinon.match('Start DaoTransactions'))).to.be.true
    })

    it('should handle crawl errors gracefully', async () => {
      const errorLoggerStub = sandbox.stub(logger, 'error')
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')
      const mockDao = {
        id: 'test-dao-id',
        address: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1000,
      }

      const findByAddressStub = sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao)
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')

      // Make the first crawl fail
      crawlStub.onFirstCall().rejects(new Error('Crawl failed'))
      crawlStub.resolves()

      // Execute
      await DaoTransactions.start({
        daoAddress: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
      })

      // Verify
      expect(findByAddressStub.calledOnce).to.be.true
      expect(errorLoggerStub.calledOnce).to.be.true
      expect(errorLoggerStub.firstCall.args[0]).to.equal('Error start DaoTransactions')
      expect(verboseLoggerStub.calledWith(sinon.match('Start DaoTransactions'))).to.be.true
    })
  })
})
