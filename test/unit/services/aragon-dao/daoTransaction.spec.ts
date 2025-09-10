import * as sinon from 'sinon'
import { expect } from 'chai'
import proxyquire from 'proxyquire'
import { NetworksEnum, IDaoTransferLogs, LockErc721Token } from '@types'

describe('AragonDao: DaoTransactions', () => {
  let sandbox: sinon.SinonSandbox
  let DaoTransactions: any
  let mockDao: any
  let crawlerConfigs: any[] = []
  let crawlerInstances: any[] = []
  let loggerStub: any
  let modelsStub: any
  let configIndexerHelperStub: any
  let daoTransferHandlerStub: any
  let zeroPadValueStub: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    crawlerConfigs = []
    crawlerInstances = []

    mockDao = {
      id: 'test-dao-id',
      address: '0x0000000000000000000000000000000000000123',
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 1000,
    }

    loggerStub = {
      verbose: sandbox.stub(),
      error: sandbox.stub(),
      logMeta: {
        bind: sandbox.stub().returns((data: any) => ({ service: 'service:aragon-dao:DaoTransactions', ...data })),
      },
    }

    modelsStub = {
      Dao: {
        findByAddress: sandbox.stub().resolves(mockDao),
      },
    }

    // Stub the DaoTransferHandler methods
    daoTransferHandlerStub = {
      incomingErc20Transfer: sandbox.stub().resolves(),
      incomingErc721Transfer: sandbox.stub().resolves(),
      withdrawErc20Transfer: sandbox.stub().resolves(),
      withdrawErc721Transfer: sandbox.stub().resolves(),
      incomingNativeDeposits: sandbox.stub().resolves(),
      withdrawNativeDeposits: sandbox.stub().resolves(),
    }

    configIndexerHelperStub = {
      builders: {
        tokenDeposit: sandbox.stub().returns('tokenDeposit-service'),
        nativeDeposit: sandbox.stub().returns('nativeDeposit-service'),
        tokenWithdraw: sandbox.stub().returns('tokenWithdraw-service'),
        nativeWithdraw: sandbox.stub().returns('nativeWithdraw-service'),
      },
    }

    // Stub ethers zeroPadValue
    zeroPadValueStub = sandbox.stub().returns('0xpadded')

    // Mock BlockchainLogCrawler to capture configurations
    const BlockchainLogCrawlerMock = function (this: any, config: any) {
      crawlerConfigs.push(config)
      this.crawl = sandbox.stub().resolves()
      crawlerInstances.push(this)
    }

    // Use proxyquire to inject mocks
    DaoTransactions = proxyquire('@services/aragon-dao/daoTransactions', {
      '@dbModels': { Models: modelsStub },
      '@logger': { default: loggerStub },
      '@modules/blockchainLogCrawler': { default: BlockchainLogCrawlerMock },
      '@helpers/configIndexer': { default: configIndexerHelperStub },
      '@handlers/daoTransferHanlder': { DaoTransferHandler: daoTransferHandlerStub },
      ethers: { zeroPadValue: zeroPadValueStub },
    }).DaoTransactions
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('start function', () => {
    it('should process all transfer types successfully', async () => {
      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(modelsStub.Dao.findByAddress.calledOnce).to.be.true
      expect(modelsStub.Dao.findByAddress.calledWith(mockDao.address, NetworksEnum.ethereumMainnet)).to.be.true
      expect(crawlerConfigs.length).to.equal(4)
      expect(loggerStub.verbose.calledWith('Start DaoTransactions')).to.be.true
      expect(loggerStub.verbose.calledWith('End DaoTransactions')).to.be.true
    })

    it('should exit gracefully if DAO is not found', async () => {
      modelsStub.Dao.findByAddress.resolves(null)

      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(crawlerConfigs.length).to.equal(0)
      expect(loggerStub.verbose.calledWith('Start DaoTransactions')).to.be.true
      expect(loggerStub.verbose.calledWith('End DaoTransactions')).to.be.false
    })

    it('should handle errors gracefully', async () => {
      modelsStub.Dao.findByAddress.rejects(new Error('Database error'))

      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(loggerStub.error.calledOnce).to.be.true
      expect(loggerStub.error.firstCall.args[0]).to.equal('Error start DaoTransactions')
    })

    it('should create crawlers with correct configurations', async () => {
      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })

      // Check that 4 crawlers were created
      expect(crawlerConfigs.length).to.equal(4)

      // Verify first crawler configuration (incoming transfers)
      const incomingTransferCrawler = crawlerConfigs[0]
      expect(incomingTransferCrawler.network).to.equal(NetworksEnum.ethereumMainnet)
      expect(incomingTransferCrawler.isTopicObject).to.be.true
      expect(incomingTransferCrawler.events).to.exist
      expect(incomingTransferCrawler.events[0].event).to.equal(LockErc721Token.Transfer)
      expect(incomingTransferCrawler.events[0].config).to.have.lengthOf(2) // ERC20 and ERC721 handlers
      expect(incomingTransferCrawler.fromBlock).to.equal(mockDao.blockNumber)
      expect(incomingTransferCrawler.stopOnError).to.be.true
      expect(incomingTransferCrawler.logService).to.equal('tokenDeposit-service')

      // Verify second crawler configuration (native deposits)
      const nativeDepositCrawler = crawlerConfigs[1]
      expect(nativeDepositCrawler.network).to.equal(NetworksEnum.ethereumMainnet)
      expect(nativeDepositCrawler.address).to.include(mockDao.address)
      expect(nativeDepositCrawler.events[0].event).to.equal(IDaoTransferLogs.NativeTokenDeposited)
      expect(nativeDepositCrawler.fromBlock).to.equal(mockDao.blockNumber)
      expect(nativeDepositCrawler.stopOnError).to.be.true
      expect(nativeDepositCrawler.logService).to.equal('nativeDeposit-service')

      // Verify third crawler configuration (outgoing transfers)
      const outgoingTransferCrawler = crawlerConfigs[2]
      expect(outgoingTransferCrawler.network).to.equal(NetworksEnum.ethereumMainnet)
      expect(outgoingTransferCrawler.isTopicObject).to.be.true
      expect(outgoingTransferCrawler.events[0].event).to.equal(LockErc721Token.Transfer)
      expect(outgoingTransferCrawler.events[0].config).to.have.lengthOf(2) // ERC20 and ERC721 handlers
      expect(outgoingTransferCrawler.fromBlock).to.equal(mockDao.blockNumber)
      expect(outgoingTransferCrawler.stopOnError).to.be.true
      expect(outgoingTransferCrawler.logService).to.equal('tokenWithdraw-service')

      // Verify fourth crawler configuration (executed events)
      const executedEventCrawler = crawlerConfigs[3]
      expect(executedEventCrawler.network).to.equal(NetworksEnum.ethereumMainnet)
      expect(executedEventCrawler.address).to.include(mockDao.address)
      expect(executedEventCrawler.events).to.have.lengthOf(2) // DAO v1 and v2
      expect(executedEventCrawler.events[0].event).to.equal(IDaoTransferLogs.Executed)
      expect(executedEventCrawler.events[1].event).to.equal(IDaoTransferLogs.Executed)
      expect(executedEventCrawler.fromBlock).to.equal(mockDao.blockNumber)
      expect(executedEventCrawler.stopOnError).to.be.true
      expect(executedEventCrawler.logService).to.equal('nativeWithdraw-service')
    })

    it('should configure correct topic filters for token transfers', async () => {
      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })

      // Check incoming token transfer topics
      const incomingTopics = crawlerConfigs[0].events[0].topic
      expect(incomingTopics).to.be.an('array')
      expect(incomingTopics).to.have.lengthOf(3)
      expect(incomingTopics[1]).to.be.null // from address (any)
      expect(zeroPadValueStub.calledWith(mockDao.address, 32)).to.be.true

      // Check outgoing token transfer topics
      const outgoingTopics = crawlerConfigs[2].events[0].topic
      expect(outgoingTopics).to.be.an('array')
      expect(outgoingTopics).to.have.lengthOf(3)
      expect(outgoingTopics[2]).to.be.null // to address (any)
    })

    it('should configure handlers correctly for each crawler', async () => {
      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })

      // Check incoming transfer handlers
      const incomingConfig = crawlerConfigs[0].events[0].config
      expect(incomingConfig[0].handler).to.equal(daoTransferHandlerStub.incomingErc20Transfer)
      expect(incomingConfig[1].handler).to.equal(daoTransferHandlerStub.incomingErc721Transfer)

      // Check native deposit handler
      const nativeDepositConfig = crawlerConfigs[1].events[0].config
      expect(nativeDepositConfig[0].handler).to.equal(daoTransferHandlerStub.incomingNativeDeposits)

      // Check outgoing transfer handlers
      const outgoingConfig = crawlerConfigs[2].events[0].config
      expect(outgoingConfig[0].handler).to.equal(daoTransferHandlerStub.withdrawErc20Transfer)
      expect(outgoingConfig[1].handler).to.equal(daoTransferHandlerStub.withdrawErc721Transfer)

      // Check executed event handlers
      const executedConfig = crawlerConfigs[3].events[0].config
      expect(executedConfig[0].handler).to.equal(daoTransferHandlerStub.withdrawNativeDeposits)
    })

    it('should configure error handlers for all crawlers', async () => {
      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })

      // Verify all crawlers have error handlers
      crawlerConfigs.forEach(config => {
        expect(config.onError).to.be.a('function')
      })

      // Test error handlers
      await crawlerConfigs[0].onError(new Error('Test error'), { transactionHash: '0xtest' })
      expect(loggerStub.error.calledWith('Error crawling transfer events')).to.be.true

      await crawlerConfigs[1].onError(new Error('Native deposit error'), { transactionHash: '0xtest' })
      expect(loggerStub.error.calledWith('Error crawling native deposit events')).to.be.true

      await crawlerConfigs[2].onError(new Error('Outgoing transfer error'), { transactionHash: '0xtest' })
      expect(loggerStub.error.calledWith('Error crawling transfer events')).to.be.true

      await crawlerConfigs[3].onError(new Error('Executed event error'), { transactionHash: '0xtest' })
      expect(loggerStub.error.calledWith('Error crawling Executed events')).to.be.true
    })

    it('should call crawl on all crawler instances', async () => {
      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(crawlerInstances).to.have.lengthOf(4)
      crawlerInstances.forEach(crawler => {
        expect(crawler.crawl.calledOnce).to.be.true
      })
    })

    it('should use correct ConfigIndexer builders for each crawler', async () => {
      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(configIndexerHelperStub.builders.tokenDeposit.calledOnce).to.be.true
      expect(configIndexerHelperStub.builders.tokenDeposit.calledWith(mockDao.network, mockDao.address)).to.be.true

      expect(configIndexerHelperStub.builders.nativeDeposit.calledOnce).to.be.true
      expect(configIndexerHelperStub.builders.nativeDeposit.calledWith(mockDao.network, mockDao.address)).to.be.true

      expect(configIndexerHelperStub.builders.tokenWithdraw.calledOnce).to.be.true
      expect(configIndexerHelperStub.builders.tokenWithdraw.calledWith(mockDao.network, mockDao.address)).to.be.true

      expect(configIndexerHelperStub.builders.nativeWithdraw.calledOnce).to.be.true
      expect(configIndexerHelperStub.builders.nativeWithdraw.calledWith(mockDao.network, mockDao.address)).to.be.true
    })

    it('should log duration in verbose end message', async () => {
      const dateNowStub = sandbox.stub(Date, 'now')
      dateNowStub.onCall(0).returns(1000) // start time
      dateNowStub.onCall(1).returns(2500) // end time

      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })

      const endLogCall = loggerStub.verbose.getCalls().find(call => call.args[0] === 'End DaoTransactions')
      expect(endLogCall).to.exist
      const logData = endLogCall.args[1]
      expect(logData.duration).to.equal('1500ms')
      expect(logData.daoId).to.equal('test-dao-id')
      expect(logData.daoAddress).to.equal(mockDao.address)
    })

    it('should process crawlers in parallel', async () => {
      let resolveOrder: number[] = []
      let resolveIndex = 0

      const BlockchainLogCrawlerMock = function (this: any, config: any) {
        crawlerConfigs.push(config)
        const currentIndex = resolveIndex++
        this.crawl = sandbox.stub().callsFake(() => {
          return new Promise(resolve => {
            // Simulate async work
            setTimeout(() => {
              resolveOrder.push(currentIndex)
              resolve(undefined)
            }, Math.random() * 10)
          })
        })
        crawlerInstances.push(this)
      }

      DaoTransactions = proxyquire('@services/aragon-dao/daoTransactions', {
        '@dbModels': { Models: modelsStub },
        '@logger': { default: loggerStub },
        '@modules/blockchainLogCrawler': { default: BlockchainLogCrawlerMock },
        '@helpers/configIndexer': { default: configIndexerHelperStub },
        '@handlers/daoTransferHanlder': { DaoTransferHandler: daoTransferHandlerStub },
        ethers: { zeroPadValue: zeroPadValueStub },
      }).DaoTransactions

      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })

      // All crawlers should have been called
      expect(crawlerInstances).to.have.lengthOf(4)
      expect(resolveOrder).to.have.lengthOf(4)
      // Order might vary due to parallel execution
      expect(resolveOrder).to.include.members([0, 1, 2, 3])
    })
  })

  describe('Error handling in start', () => {
    it('should handle crawl promise rejection', async () => {
      const BlockchainLogCrawlerMock = function (this: any, config: any) {
        crawlerConfigs.push(config)
        this.crawl = sandbox.stub().rejects(new Error('Crawl failed'))
      }

      DaoTransactions = proxyquire('@services/aragon-dao/daoTransactions', {
        '@dbModels': { Models: modelsStub },
        '@logger': { default: loggerStub },
        '@modules/blockchainLogCrawler': { default: BlockchainLogCrawlerMock },
        '@helpers/configIndexer': { default: configIndexerHelperStub },
        '@handlers/daoTransferHanlder': { DaoTransferHandler: daoTransferHandlerStub },
        ethers: { zeroPadValue: zeroPadValueStub },
      }).DaoTransactions

      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(loggerStub.error.calledWith('Error start DaoTransactions')).to.be.true
      const errorCall = loggerStub.error.getCall(0)
      expect(errorCall.args[1].error.message).to.equal('Crawl failed')
    })

    it('should handle partial crawler failures', async () => {
      let crawlerIndex = 0
      const BlockchainLogCrawlerMock = function (this: any, config: any) {
        crawlerConfigs.push(config)
        const currentIndex = crawlerIndex++
        // Make the second crawler fail
        if (currentIndex === 1) {
          this.crawl = sandbox.stub().rejects(new Error('Second crawler failed'))
        } else {
          this.crawl = sandbox.stub().resolves()
        }
        crawlerInstances.push(this)
      }

      DaoTransactions = proxyquire('@services/aragon-dao/daoTransactions', {
        '@dbModels': { Models: modelsStub },
        '@logger': { default: loggerStub },
        '@modules/blockchainLogCrawler': { default: BlockchainLogCrawlerMock },
        '@helpers/configIndexer': { default: configIndexerHelperStub },
        '@handlers/daoTransferHanlder': { DaoTransferHandler: daoTransferHandlerStub },
        ethers: { zeroPadValue: zeroPadValueStub },
      }).DaoTransactions

      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(loggerStub.error.calledWith('Error start DaoTransactions')).to.be.true
      const errorCall = loggerStub.error.getCall(0)
      // Check if the error was logged - the structure should be { daoAddress, error }
      expect(errorCall.args[1]).to.have.property('error')
      expect(errorCall.args[1].error.message).to.equal('Second crawler failed')
    })

    it('should handle DAO lookup errors', async () => {
      modelsStub.Dao.findByAddress.rejects(new Error('MongoDB connection failed'))

      await DaoTransactions.start({
        daoAddress: '0xtest',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(loggerStub.error.calledOnce).to.be.true
      expect(loggerStub.error.firstCall.args[0]).to.equal('Error start DaoTransactions')
      const errorCall = loggerStub.error.getCall(0)
      expect(errorCall.args[1].daoAddress).to.equal('0xtest')
      expect(errorCall.args[1].error.message).to.equal('MongoDB connection failed')
    })

    it('should handle undefined DAO gracefully', async () => {
      modelsStub.Dao.findByAddress.resolves(undefined)

      await DaoTransactions.start({
        daoAddress: '0xnonexistent',
        network: NetworksEnum.ethereumMainnet,
      })

      // Should exit early without creating crawlers
      expect(crawlerConfigs.length).to.equal(0)
      expect(loggerStub.verbose.calledWith('Start DaoTransactions')).to.be.true
      expect(loggerStub.verbose.calledWith('End DaoTransactions')).to.be.false
      expect(loggerStub.error.called).to.be.false
    })
  })

  describe('Network handling', () => {
    it('should handle different networks correctly', async () => {
      const polygonDao = {
        ...mockDao,
        network: NetworksEnum.polygonMainnet,
      }
      modelsStub.Dao.findByAddress.resolves(polygonDao)

      await DaoTransactions.start({
        daoAddress: polygonDao.address,
        network: NetworksEnum.polygonMainnet,
      })

      expect(modelsStub.Dao.findByAddress.calledWith(polygonDao.address, NetworksEnum.polygonMainnet)).to.be.true

      // All crawlers should use the polygon network
      crawlerConfigs.forEach(config => {
        expect(config.network).to.equal(NetworksEnum.polygonMainnet)
      })

      // ConfigIndexer builders should be called with polygon network
      expect(configIndexerHelperStub.builders.tokenDeposit.calledWith(NetworksEnum.polygonMainnet, polygonDao.address))
        .to.be.true
      expect(configIndexerHelperStub.builders.nativeDeposit.calledWith(NetworksEnum.polygonMainnet, polygonDao.address))
        .to.be.true
      expect(configIndexerHelperStub.builders.tokenWithdraw.calledWith(NetworksEnum.polygonMainnet, polygonDao.address))
        .to.be.true
      expect(
        configIndexerHelperStub.builders.nativeWithdraw.calledWith(NetworksEnum.polygonMainnet, polygonDao.address),
      ).to.be.true
    })
  })

  describe('Block number handling', () => {
    it('should use DAO block number as fromBlock for all crawlers', async () => {
      const daoWithHighBlock = {
        ...mockDao,
        blockNumber: 999999,
      }
      modelsStub.Dao.findByAddress.resolves(daoWithHighBlock)

      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })

      crawlerConfigs.forEach(config => {
        expect(config.fromBlock).to.equal(999999)
      })
    })

    it('should handle missing block number', async () => {
      const daoWithoutBlock = {
        ...mockDao,
        blockNumber: undefined,
      }
      modelsStub.Dao.findByAddress.resolves(daoWithoutBlock)

      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })

      crawlerConfigs.forEach(config => {
        expect(config.fromBlock).to.be.undefined
      })
    })
  })
})
