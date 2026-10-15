import { Models } from '@dbModels'
import ConfigIndexerHelper from '@helpers/configIndexer'
import RabbitMQHelper from '@helpers/rabbitMQ'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { ProxyToken } from '@modules/proxyToken'
import { DaoTransactions as DaoTransactionsService } from '@services/aragon-dao/daoTransactions'
import {
  EnumQueueName,
  IDaoTransferLogs,
  ITokenType,
  ITransactionSide,
  ITransactionType,
  NetworksEnum,
  TokenTransfer,
} from '@types'
import { expect } from 'chai'
import { Interface, id, zeroPadValue } from 'ethers'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'

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
  let daoExecutionHandlerStub: any
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

    daoExecutionHandlerStub = {
      executedEvent: sandbox.stub().resolves(),
    }

    configIndexerHelperStub = {
      builders: {
        tokenDeposit: sandbox.stub().returns('tokenDeposit-service'),
        nativeDeposit: sandbox.stub().returns('nativeDeposit-service'),
        tokenWithdraw: sandbox.stub().returns('tokenWithdraw-service'),
        nativeWithdraw: sandbox.stub().returns('nativeWithdraw-service'),
        execution: sandbox.stub().returns('execution-service'),
      },
    }

    // Stub ethers zeroPadValue
    zeroPadValueStub = sandbox.stub().returns('0xpadded')

    // Mock BlockchainLogCrawler to capture configurations
    const BlockchainLogCrawlerMock = function (this: any, config: any) {
      crawlerConfigs.push(config)
      this.crawl = sandbox.stub().resolves()
      this.crawlSetting = {
        crawling: false,
        shutdown: false,
      }
      crawlerInstances.push(this)
    }

    // Use proxyquire to inject mocks
    DaoTransactions = proxyquire('@services/aragon-dao/daoTransactions', {
      '@dbModels': { Models: modelsStub },
      '@logger': { default: loggerStub },
      '@modules/crawlers': { BlockchainLogCrawler: BlockchainLogCrawlerMock },
      '@helpers/configIndexer': { default: configIndexerHelperStub },
      '@handlers/daoTransferHanlder': { DaoTransferHandler: daoTransferHandlerStub },
      '@handlers/daoExecutionHandler': { DaoExecutionHandler: daoExecutionHandlerStub },
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
      expect(incomingTransferCrawler.events[0].event).to.equal(TokenTransfer.Transfer)
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
      expect(outgoingTransferCrawler.events[0].event).to.equal(TokenTransfer.Transfer)
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
        '@modules/crawlers': { BlockchainLogCrawler: BlockchainLogCrawlerMock },
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

    it('should call resetTransactions when reset parameter is true', async () => {
      // Setup stubs for resetTransactions internal dependencies
      const transactionDeleteStub = sandbox.stub().resolves({ deletedCount: 5 })
      const configIndexerDeleteStub = sandbox.stub().resolves({ deletedCount: 4 })

      modelsStub.Transaction = {
        deleteMany: transactionDeleteStub,
      }
      modelsStub.ConfigIndexer = {
        deleteMany: configIndexerDeleteStub,
      }

      // Mock DbTx.executeTxFn to immediately call the callback
      const dbTxStub = {
        executeTxFn: sandbox.stub().callsFake(async callback => {
          const mockSession = {
            commitTransaction: sandbox.stub().resolves(),
            endSession: sandbox.stub().resolves(),
            abortTransaction: sandbox.stub().resolves(),
          }
          return callback({ session: mockSession })
        }),
      }

      // Re-initialize DaoTransactions with the new stubs
      const BlockchainLogCrawlerMock = function (this: any, config: any) {
        crawlerConfigs.push(config)
        this.crawl = sandbox.stub().resolves()
        crawlerInstances.push(this)
      }

      DaoTransactions = proxyquire('@services/aragon-dao/daoTransactions', {
        '@dbModels': { Models: modelsStub },
        '@logger': { default: loggerStub },
        '@modules/crawlers': { BlockchainLogCrawler: BlockchainLogCrawlerMock },
        '@helpers/configIndexer': { default: configIndexerHelperStub },
        '@handlers/daoTransferHanlder': { DaoTransferHandler: daoTransferHandlerStub },
        '@modules/dbTx': { default: dbTxStub },
        ethers: { zeroPadValue: zeroPadValueStub },
      }).DaoTransactions

      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
        reset: true,
      })

      // Verify resetTransactions was called by checking internal operations
      expect(transactionDeleteStub.calledOnce).to.be.true
      expect(transactionDeleteStub.getCall(0).args[0]).to.deep.equal({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
        type: { $ne: ITransactionType.execution },
      })
      expect(configIndexerDeleteStub.calledOnce).to.be.true
      expect(dbTxStub.executeTxFn.calledOnce).to.be.true
      expect(crawlerConfigs.length).to.equal(4)
    })

    it('should reset and re-index only executions when resetExecutions is true', async () => {
      const transactionDeleteStub = sandbox.stub().resolves({ deletedCount: 3 })
      const configIndexerDeleteStub = sandbox.stub().resolves({ deletedCount: 1 })

      modelsStub.Transaction = { deleteMany: transactionDeleteStub }
      modelsStub.ConfigIndexer = { deleteMany: configIndexerDeleteStub }

      const dbTxStub = {
        executeTxFn: sandbox.stub().callsFake(async callback => {
          const mockSession = {
            commitTransaction: sandbox.stub().resolves(),
            endSession: sandbox.stub().resolves(),
            abortTransaction: sandbox.stub().resolves(),
          }
          return callback({ session: mockSession })
        }),
      }

      const BlockchainLogCrawlerMock = function (this: any, config: any) {
        crawlerConfigs.push(config)
        this.crawl = sandbox.stub().resolves()
        crawlerInstances.push(this)
      }

      DaoTransactions = proxyquire('@services/aragon-dao/daoTransactions', {
        '@dbModels': { Models: modelsStub },
        '@logger': { default: loggerStub },
        '@modules/crawlers': { BlockchainLogCrawler: BlockchainLogCrawlerMock },
        '@helpers/configIndexer': { default: configIndexerHelperStub },
        '@handlers/daoTransferHanlder': { DaoTransferHandler: daoTransferHandlerStub },
        '@handlers/daoExecutionHandler': { DaoExecutionHandler: daoExecutionHandlerStub },
        '@modules/dbTx': { default: dbTxStub },
        ethers: { zeroPadValue: zeroPadValueStub },
      }).DaoTransactions

      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
        resetExecutions: true,
      })

      // Only the execution crawler runs — the four transfer crawlers are skipped entirely
      expect(crawlerConfigs.length).to.equal(1)
      const executionCrawler = crawlerConfigs[0]
      expect(executionCrawler.events).to.have.lengthOf(2)
      expect(executionCrawler.events[0].event).to.equal(IDaoTransferLogs.Executed)
      expect(executionCrawler.events[0].config[0].handler).to.equal(daoExecutionHandlerStub.executedEvent)
      expect(executionCrawler.events[1].config[0].handler).to.equal(daoExecutionHandlerStub.executedEvent)
      expect(executionCrawler.logService).to.equal('execution-service')

      // Only execution rows are removed (type: execution, not the $ne filter used by the transfer reset)
      expect(transactionDeleteStub.calledOnce).to.be.true
      expect(transactionDeleteStub.getCall(0).args[0]).to.deep.equal({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
        type: ITransactionType.execution,
      })
      expect(configIndexerDeleteStub.calledOnce).to.be.true
      expect(configIndexerDeleteStub.getCall(0).args[0]).to.deep.equal({ service: 'execution-service' })

      // Transfer reset is never triggered
      expect(configIndexerHelperStub.builders.tokenDeposit.called).to.be.false

      // Logs the executions-only completion, not the full transfer completion
      expect(loggerStub.verbose.calledWith('End DaoTransactions executions reindex')).to.be.true
      expect(loggerStub.verbose.calledWith('End DaoTransactions')).to.be.false
    })
  })

  describe('Error handling in start', () => {
    it('should handle crawl promise rejection', async () => {
      const BlockchainLogCrawlerMock = function (this: any, config: any) {
        crawlerConfigs.push(config)
        this.crawl = sandbox.stub().rejects(new Error('Crawl failed'))
        this.crawlSetting = {
          crawling: false,
          shutdown: false,
        }
      }

      DaoTransactions = proxyquire('@services/aragon-dao/daoTransactions', {
        '@dbModels': { Models: modelsStub },
        '@logger': { default: loggerStub },
        '@modules/crawlers': { BlockchainLogCrawler: BlockchainLogCrawlerMock },
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
        '@modules/crawlers': { BlockchainLogCrawler: BlockchainLogCrawlerMock },
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

    it('should exclude native transfer crawlers for zkSync mainnet', async () => {
      // Reset for this test
      crawlerConfigs = []
      crawlerInstances = []
      configIndexerHelperStub.builders.tokenDeposit.resetHistory()
      configIndexerHelperStub.builders.nativeDeposit.resetHistory()
      configIndexerHelperStub.builders.tokenWithdraw.resetHistory()
      configIndexerHelperStub.builders.nativeWithdraw.resetHistory()

      const zkSyncDao = {
        ...mockDao,
        network: NetworksEnum.zksyncMainnet,
      }
      modelsStub.Dao.findByAddress.resolves(zkSyncDao)

      await DaoTransactions.start({
        daoAddress: zkSyncDao.address,
        network: NetworksEnum.zksyncMainnet,
      })

      // 3 crawlers are instantiated, but only 2 should have crawl() called
      expect(crawlerInstances.length).to.equal(3)

      // Check which crawlers had their crawl() method called
      const crawledInstances = crawlerInstances.filter(instance => instance.crawl.called)
      expect(crawledInstances.length).to.equal(2)

      // Verify the crawlers that were called are token transfer crawlers
      const crawledConfigs = crawledInstances.map(instance => {
        const index = crawlerInstances.indexOf(instance)
        return crawlerConfigs[index]
      })

      crawledConfigs.forEach(config => {
        expect(config.events[0].event).to.equal(TokenTransfer.Transfer)
      })

      // Verify the native crawlers were NOT executed (their crawl() was not called)
      const nativeCrawlers = crawlerInstances.filter((instance, index) => {
        const config = crawlerConfigs[index]
        return config.events.some(
          (event: any) =>
            event.event === IDaoTransferLogs.NativeTokenDeposited || event.event === IDaoTransferLogs.Executed,
        )
      })
      nativeCrawlers.forEach(crawler => {
        expect(crawler.crawl.called, 'Native crawler should not have been executed').to.be.false
      })
    })

    it('should include all 4 crawlers for non-zkSync networks', async () => {
      const networks = [
        NetworksEnum.ethereumMainnet,
        NetworksEnum.polygonMainnet,
        NetworksEnum.baseMainnet,
        NetworksEnum.arbitrumMainnet,
      ]

      for (const network of networks) {
        // Reset for each iteration
        crawlerConfigs = []
        configIndexerHelperStub.builders.tokenDeposit.resetHistory()
        configIndexerHelperStub.builders.nativeDeposit.resetHistory()
        configIndexerHelperStub.builders.tokenWithdraw.resetHistory()
        configIndexerHelperStub.builders.nativeWithdraw.resetHistory()

        const testDao = {
          ...mockDao,
          network,
        }
        modelsStub.Dao.findByAddress.resolves(testDao)

        await DaoTransactions.start({
          daoAddress: testDao.address,
          network,
        })

        // Verify all 4 crawlers were created
        expect(crawlerConfigs.length, `${network} should have 4 crawlers`).to.equal(4)

        // Verify native deposit crawler is present
        const hasNativeDepositCrawler = crawlerConfigs.some(config =>
          config.events.some((event: any) => event.event === IDaoTransferLogs.NativeTokenDeposited),
        )
        expect(hasNativeDepositCrawler, `${network} should have native deposit crawler`).to.be.true

        // Verify native withdraw crawler is present
        const hasExecutedEventCrawler = crawlerConfigs.some(config =>
          config.events.some((event: any) => event.event === IDaoTransferLogs.Executed),
        )
        expect(hasExecutedEventCrawler, `${network} should have native withdraw crawler`).to.be.true

        // Verify all ConfigIndexer builders were called
        expect(configIndexerHelperStub.builders.tokenDeposit.calledWith(network, testDao.address)).to.be.true
        expect(configIndexerHelperStub.builders.nativeDeposit.calledWith(network, testDao.address)).to.be.true
        expect(configIndexerHelperStub.builders.tokenWithdraw.calledWith(network, testDao.address)).to.be.true
        expect(configIndexerHelperStub.builders.nativeWithdraw.calledWith(network, testDao.address)).to.be.true
      }
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

  describe('resetTransactions function', () => {
    let dbTxStub: any
    let transactionDeleteStub: sinon.SinonStub
    let configIndexerDeleteStub: sinon.SinonStub

    beforeEach(() => {
      // Setup stubs for Models.Transaction and Models.ConfigIndexer
      transactionDeleteStub = sandbox.stub().resolves({ deletedCount: 10 })
      configIndexerDeleteStub = sandbox.stub().resolves({ deletedCount: 4 })

      modelsStub.Transaction = {
        deleteMany: transactionDeleteStub,
      }
      modelsStub.ConfigIndexer = {
        deleteMany: configIndexerDeleteStub,
      }

      // Mock DbTx.executeTxFn to immediately call the callback
      dbTxStub = {
        executeTxFn: sandbox.stub().callsFake(async callback => {
          const mockSession = {
            commitTransaction: sandbox.stub().resolves(),
            endSession: sandbox.stub().resolves(),
            abortTransaction: sandbox.stub().resolves(),
          }
          return callback({ session: mockSession })
        }),
      }

      // Re-initialize DaoTransactions with the new stubs
      const BlockchainLogCrawlerMock = function (this: any, _config: any) {
        this.crawl = sandbox.stub().resolves()
      }

      DaoTransactions = proxyquire('@services/aragon-dao/daoTransactions', {
        '@dbModels': { Models: modelsStub },
        '@logger': { default: loggerStub },
        '@modules/crawlers': { BlockchainLogCrawler: BlockchainLogCrawlerMock },
        '@helpers/configIndexer': { default: configIndexerHelperStub },
        '@handlers/daoTransferHanlder': { DaoTransferHandler: daoTransferHandlerStub },
        '@modules/dbTx': { default: dbTxStub },
        ethers: { zeroPadValue: zeroPadValueStub },
      }).DaoTransactions
    })

    it('should delete all transactions for a DAO', async () => {
      await DaoTransactions.resetTransactions({
        daoAddress: '0xDAO123',
        network: NetworksEnum.ethereumMainnet,
      })

      // Verify Transaction.deleteMany was called with correct parameters
      expect(modelsStub.Transaction.deleteMany.calledOnce).to.be.true
      const transactionDeleteCall = modelsStub.Transaction.deleteMany.getCall(0)
      expect(transactionDeleteCall.args[0]).to.deep.equal({
        daoAddress: '0xDAO123',
        network: NetworksEnum.ethereumMainnet,
        type: { $ne: ITransactionType.execution },
      })
      expect(transactionDeleteCall.args[1]).to.have.property('session')
    })

    it('should delete all ConfigIndexer entries for a DAO', async () => {
      await DaoTransactions.resetTransactions({
        daoAddress: '0xDAO456',
        network: NetworksEnum.polygonMainnet,
      })

      // Verify ConfigIndexer builders were called
      expect(configIndexerHelperStub.builders.tokenDeposit.calledOnce).to.be.true
      expect(configIndexerHelperStub.builders.tokenDeposit.calledWith(NetworksEnum.polygonMainnet, '0xDAO456')).to.be
        .true

      expect(configIndexerHelperStub.builders.nativeDeposit.calledOnce).to.be.true
      expect(configIndexerHelperStub.builders.nativeDeposit.calledWith(NetworksEnum.polygonMainnet, '0xDAO456')).to.be
        .true

      expect(configIndexerHelperStub.builders.tokenWithdraw.calledOnce).to.be.true
      expect(configIndexerHelperStub.builders.tokenWithdraw.calledWith(NetworksEnum.polygonMainnet, '0xDAO456')).to.be
        .true

      expect(configIndexerHelperStub.builders.nativeWithdraw.calledOnce).to.be.true
      expect(configIndexerHelperStub.builders.nativeWithdraw.calledWith(NetworksEnum.polygonMainnet, '0xDAO456')).to.be
        .true

      // Verify ConfigIndexer.deleteMany was called with correct service names
      expect(modelsStub.ConfigIndexer.deleteMany.calledOnce).to.be.true
      const configDeleteCall = modelsStub.ConfigIndexer.deleteMany.getCall(0)
      expect(configDeleteCall.args[0]).to.deep.equal({
        service: {
          $in: ['tokenDeposit-service', 'nativeDeposit-service', 'tokenWithdraw-service', 'nativeWithdraw-service'],
        },
      })
      expect(configDeleteCall.args[1]).to.have.property('session')
    })

    it('should use database transaction for atomic operations', async () => {
      await DaoTransactions.resetTransactions({
        daoAddress: '0xDAO789',
        network: NetworksEnum.baseMainnet,
      })

      // Verify DbTx.executeTxFn was called
      expect(dbTxStub.executeTxFn.calledOnce).to.be.true

      // Verify session was committed and ended
      const callback = dbTxStub.executeTxFn.getCall(0).args[0]
      const mockSession = {
        commitTransaction: sandbox.stub().resolves(),
        endSession: sandbox.stub().resolves(),
      }

      await callback({ session: mockSession })

      expect(mockSession.commitTransaction.calledOnce).to.be.true
      expect(mockSession.endSession.calledOnce).to.be.true
    })

    it('should handle errors during transaction deletion', async () => {
      const deleteError = new Error('Database connection failed')
      transactionDeleteStub.rejects(deleteError)

      dbTxStub.executeTxFn.callsFake(async callback => {
        const mockSession = {
          commitTransaction: sandbox.stub().resolves(),
          endSession: sandbox.stub().resolves(),
          abortTransaction: sandbox.stub().resolves(),
        }
        try {
          return await callback({ session: mockSession })
        } catch (error) {
          await mockSession.abortTransaction()
          throw error
        }
      })

      try {
        await DaoTransactions.resetTransactions({
          daoAddress: '0xDAOError',
          network: NetworksEnum.ethereumMainnet,
        })
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Database connection failed')
      }

      expect(transactionDeleteStub.calledOnce).to.be.true
    })

    it('should handle errors during ConfigIndexer deletion', async () => {
      const deleteError = new Error('ConfigIndexer deletion failed')
      configIndexerDeleteStub.rejects(deleteError)

      dbTxStub.executeTxFn.callsFake(async callback => {
        const mockSession = {
          commitTransaction: sandbox.stub().resolves(),
          endSession: sandbox.stub().resolves(),
          abortTransaction: sandbox.stub().resolves(),
        }
        try {
          return await callback({ session: mockSession })
        } catch (error) {
          await mockSession.abortTransaction()
          throw error
        }
      })

      try {
        await DaoTransactions.resetTransactions({
          daoAddress: '0xDAOError',
          network: NetworksEnum.ethereumMainnet,
        })
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('ConfigIndexer deletion failed')
      }

      expect(configIndexerDeleteStub.calledOnce).to.be.true
    })

    it('should work with different networks', async () => {
      const networks = [
        NetworksEnum.ethereumMainnet,
        NetworksEnum.polygonMainnet,
        NetworksEnum.baseMainnet,
        NetworksEnum.arbitrumMainnet,
        NetworksEnum.optimismMainnet,
      ]

      for (const network of networks) {
        // Reset stubs
        transactionDeleteStub.resetHistory()
        configIndexerDeleteStub.resetHistory()
        configIndexerHelperStub.builders.tokenDeposit.resetHistory()
        configIndexerHelperStub.builders.nativeDeposit.resetHistory()
        configIndexerHelperStub.builders.tokenWithdraw.resetHistory()
        configIndexerHelperStub.builders.nativeWithdraw.resetHistory()

        await DaoTransactions.resetTransactions({
          daoAddress: '0xDAONetwork',
          network,
        })

        // Verify correct network was used
        expect(transactionDeleteStub.calledOnce).to.be.true
        expect(transactionDeleteStub.getCall(0).args[0].network).to.equal(network)

        // Verify ConfigIndexer builders were called with correct network
        expect(configIndexerHelperStub.builders.tokenDeposit.calledWith(network, '0xDAONetwork')).to.be.true
        expect(configIndexerHelperStub.builders.nativeDeposit.calledWith(network, '0xDAONetwork')).to.be.true
        expect(configIndexerHelperStub.builders.tokenWithdraw.calledWith(network, '0xDAONetwork')).to.be.true
        expect(configIndexerHelperStub.builders.nativeWithdraw.calledWith(network, '0xDAONetwork')).to.be.true
      }
    })

    it('should handle concurrent reset calls for different DAOs', async () => {
      const resetPromises = [
        DaoTransactions.resetTransactions({
          daoAddress: '0xDAO1',
          network: NetworksEnum.ethereumMainnet,
        }),
        DaoTransactions.resetTransactions({
          daoAddress: '0xDAO2',
          network: NetworksEnum.polygonMainnet,
        }),
        DaoTransactions.resetTransactions({
          daoAddress: '0xDAO3',
          network: NetworksEnum.baseMainnet,
        }),
      ]

      await Promise.all(resetPromises)

      // Verify all calls were made
      expect(transactionDeleteStub.callCount).to.equal(3)
      expect(configIndexerDeleteStub.callCount).to.equal(3)
      expect(dbTxStub.executeTxFn.callCount).to.equal(3)
    })

    it('should delete nothing if no transactions exist', async () => {
      transactionDeleteStub.resolves({ deletedCount: 0 })
      configIndexerDeleteStub.resolves({ deletedCount: 0 })

      await DaoTransactions.resetTransactions({
        daoAddress: '0xDAOEmpty',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(transactionDeleteStub.calledOnce).to.be.true
      expect(configIndexerDeleteStub.calledOnce).to.be.true
    })

    it('should handle special characters in DAO address', async () => {
      const specialAddress = '0xDaO$pecial123!@#'

      await DaoTransactions.resetTransactions({
        daoAddress: specialAddress,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(transactionDeleteStub.getCall(0).args[0].daoAddress).to.equal(specialAddress)
      expect(configIndexerHelperStub.builders.tokenDeposit.calledWith(NetworksEnum.ethereumMainnet, specialAddress)).to
        .be.true
    })
  })

  describe('crawlExecutions function', () => {
    it('should build a DAO-scoped Executed crawler that uses the execution handler', () => {
      const crawler = DaoTransactions.crawlExecutions(mockDao)

      expect(crawlerConfigs.length).to.equal(1)
      const config = crawlerConfigs[0]
      expect(config.network).to.equal(mockDao.network)
      expect(config.events).to.have.lengthOf(2) // DAO v1 and v2
      expect(config.events[0].event).to.equal(IDaoTransferLogs.Executed)
      expect(config.events[1].event).to.equal(IDaoTransferLogs.Executed)
      expect(config.events[0].config[0].handler).to.equal(daoExecutionHandlerStub.executedEvent)
      expect(config.events[1].config[0].handler).to.equal(daoExecutionHandlerStub.executedEvent)
      expect(config.address).to.include(mockDao.address)
      expect(config.fromBlock).to.equal(mockDao.blockNumber)
      expect(config.stopOnError).to.be.true
      expect(config.logService).to.equal('execution-service')
      expect(configIndexerHelperStub.builders.execution.calledWith(mockDao.network, mockDao.address)).to.be.true
      expect(crawler.crawl).to.be.a('function')
    })

    it('should log when the execution crawler errors', async () => {
      DaoTransactions.crawlExecutions(mockDao)
      const config = crawlerConfigs[0]

      await config.onError(new Error('exec boom'), { transactionHash: '0xexec' })

      expect(loggerStub.error.calledWith('Error crawling execution events')).to.be.true
    })
  })

  describe('resetExecutions function', () => {
    let dbTxStub: any
    let transactionDeleteStub: sinon.SinonStub
    let configIndexerDeleteStub: sinon.SinonStub

    beforeEach(() => {
      transactionDeleteStub = sandbox.stub().resolves({ deletedCount: 7 })
      configIndexerDeleteStub = sandbox.stub().resolves({ deletedCount: 1 })

      modelsStub.Transaction = { deleteMany: transactionDeleteStub }
      modelsStub.ConfigIndexer = { deleteMany: configIndexerDeleteStub }

      dbTxStub = {
        executeTxFn: sandbox.stub().callsFake(async callback => {
          const mockSession = {
            commitTransaction: sandbox.stub().resolves(),
            endSession: sandbox.stub().resolves(),
            abortTransaction: sandbox.stub().resolves(),
          }
          return callback({ session: mockSession })
        }),
      }

      const BlockchainLogCrawlerMock = function (this: any, _config: any) {
        this.crawl = sandbox.stub().resolves()
      }

      DaoTransactions = proxyquire('@services/aragon-dao/daoTransactions', {
        '@dbModels': { Models: modelsStub },
        '@logger': { default: loggerStub },
        '@modules/crawlers': { BlockchainLogCrawler: BlockchainLogCrawlerMock },
        '@helpers/configIndexer': { default: configIndexerHelperStub },
        '@handlers/daoTransferHanlder': { DaoTransferHandler: daoTransferHandlerStub },
        '@handlers/daoExecutionHandler': { DaoExecutionHandler: daoExecutionHandlerStub },
        '@modules/dbTx': { default: dbTxStub },
        ethers: { zeroPadValue: zeroPadValueStub },
      }).DaoTransactions
    })

    it('should delete only execution transactions for the DAO', async () => {
      await DaoTransactions.resetExecutions({
        daoAddress: '0xDAO123',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(transactionDeleteStub.calledOnce).to.be.true
      const deleteCall = transactionDeleteStub.getCall(0)
      expect(deleteCall.args[0]).to.deep.equal({
        daoAddress: '0xDAO123',
        network: NetworksEnum.ethereumMainnet,
        type: ITransactionType.execution,
      })
      expect(deleteCall.args[1]).to.have.property('session')
    })

    it('should delete the execution ConfigIndexer checkpoint', async () => {
      await DaoTransactions.resetExecutions({
        daoAddress: '0xDAO456',
        network: NetworksEnum.polygonMainnet,
      })

      expect(configIndexerHelperStub.builders.execution.calledWith(NetworksEnum.polygonMainnet, '0xDAO456')).to.be.true
      expect(configIndexerDeleteStub.calledOnce).to.be.true
      const configDeleteCall = configIndexerDeleteStub.getCall(0)
      expect(configDeleteCall.args[0]).to.deep.equal({ service: 'execution-service' })
      expect(configDeleteCall.args[1]).to.have.property('session')
    })

    it('should use a database transaction and commit', async () => {
      await DaoTransactions.resetExecutions({
        daoAddress: '0xDAO789',
        network: NetworksEnum.baseMainnet,
      })

      expect(dbTxStub.executeTxFn.calledOnce).to.be.true
      const callback = dbTxStub.executeTxFn.getCall(0).args[0]
      const mockSession = {
        commitTransaction: sandbox.stub().resolves(),
        endSession: sandbox.stub().resolves(),
      }
      await callback({ session: mockSession })
      expect(mockSession.commitTransaction.calledOnce).to.be.true
      expect(mockSession.endSession.calledOnce).to.be.true
    })

    it('should not touch transfer checkpoints', async () => {
      await DaoTransactions.resetExecutions({
        daoAddress: '0xDAO',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(configIndexerHelperStub.builders.tokenDeposit.called).to.be.false
      expect(configIndexerHelperStub.builders.nativeWithdraw.called).to.be.false
    })

    it('should propagate errors during execution deletion', async () => {
      const deleteError = new Error('Execution deletion failed')
      transactionDeleteStub.rejects(deleteError)

      dbTxStub.executeTxFn.callsFake(async callback => {
        const mockSession = {
          commitTransaction: sandbox.stub().resolves(),
          endSession: sandbox.stub().resolves(),
          abortTransaction: sandbox.stub().resolves(),
        }
        try {
          return await callback({ session: mockSession })
        } catch (error) {
          await mockSession.abortTransaction()
          throw error
        }
      })

      try {
        await DaoTransactions.resetExecutions({
          daoAddress: '0xDAOError',
          network: NetworksEnum.ethereumMainnet,
        })
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Execution deletion failed')
      }
    })
  })
})

describe('AragonDao: registered Safe transfers', () => {
  const network = NetworksEnum.ethereumSepolia
  const safeAddress = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'
  const sender = '0x1111111111111111111111111111111111111111'
  const tokenAddress = '0x2222222222222222222222222222222222222222'
  const params = { daoAddress: safeAddress, network }
  let sandbox: sinon.SinonSandbox
  let crawl: sinon.SinonStub
  let send: sinon.SinonStub

  const crawlers = () => crawl.thisValues as BlockchainLogCrawler[]
  const configs = () => crawlers().map(crawler => crawler['crawlParams'])
  const register = async (chain = network, blockNumber = 123) => {
    await Models.SafeAccount.track(chain, safeAddress)
    await Models.SafeAccount.updateOne({ id: `${chain}-${safeAddress}` }, { $set: { blockNumber } })
  }
  const processLog = async (service: string, event: string, values: any[], configIndex = 0) => {
    const crawler = crawlers().find(item => item['crawlParams'].logService === service)!
    const config = crawler['crawlParams'].events[0].config[configIndex]
    const abi = new Interface(config.abi)
    const encoded = abi.encodeEventLog(abi.getEvent(event)!, values)
    const formatted = crawler['logProcessingEngine'].formatLog({
      ...encoded,
      address: event === 'Transfer' ? tokenAddress : safeAddress,
      transactionHash: '0xtransfer',
      blockNumber: 456,
      transactionIndex: 2,
      index: 3,
    } as any)
    expect(formatted.event).not.to.be.null
    expect(formatted.handler).to.be.a('function')
    await formatted.handler!(formatted.event, formatted.info)
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    for (const level of ['info', 'verbose', 'debug', 'warn', 'error'] as const) sandbox.stub(logger, level)
    crawl = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves([])
    send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({ blockNumber: 0 } as any)
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
    sandbox.stub(ProxyToken, 'saveAndGetToken').callsFake(
      async (address, chain) =>
        ({
          address,
          network: chain,
          type: address === utils.zeroAddress ? ITokenType.native : ITokenType.ERC20,
          decimals: 18,
          symbol: 'TEST',
          name: 'Test token',
        }) as any,
    )
  })

  afterEach(() => sandbox.restore())

  it('crawls tokens both ways and native deposits from the stored block', async () => {
    await register()
    await DaoTransactionsService.start(params)

    expect(crawl.callCount).to.equal(3)
    const settings = configs()
    expect(settings.map(item => item.logService)).to.have.members([
      ConfigIndexerHelper.builders.tokenDeposit(network, safeAddress),
      ConfigIndexerHelper.builders.tokenWithdraw(network, safeAddress),
      ConfigIndexerHelper.builders.nativeDeposit(network, safeAddress),
    ])
    for (const item of settings) {
      expect(item.network).to.equal(network)
      expect(item.fromBlock).to.equal(123)
      expect(item.stopOnError).to.be.true
      expect(item.events.some(event => event.event === IDaoTransferLogs.Executed)).to.be.false
    }
    expect(settings[0].events[0].topic).to.deep.equal([
      id('Transfer(address,address,uint256)'),
      null,
      zeroPadValue(safeAddress, 32),
    ])
    expect(settings[1].events[0].topic).to.deep.equal([
      id('Transfer(address,address,uint256)'),
      zeroPadValue(safeAddress, 32),
      null,
    ])
    expect(settings[2].address).to.deep.equal([safeAddress])
    expect(settings[2].events[0].topic).to.equal(id('SafeReceived(address,uint256)'))
  })

  it('crawls only token transfers for a zkSync Safe', async () => {
    await register(NetworksEnum.zksyncMainnet)
    await DaoTransactionsService.start({ ...params, network: NetworksEnum.zksyncMainnet })

    expect(crawl.callCount).to.equal(2)
    expect(configs().every(item => item.events[0].event === TokenTransfer.Transfer)).to.be.true
  })

  for (const state of ['unknown', 'removed', 'another network']) {
    it(`does not crawl a Safe that is ${state}`, async () => {
      if (state === 'removed') {
        await register()
        await Models.SafeAccount.untrack(network, safeAddress)
      } else if (state === 'another network') await register(NetworksEnum.ethereumMainnet)

      await DaoTransactionsService.start(params)

      expect(crawl.notCalled).to.be.true
      expect(await Models.ConfigIndexer.countDocuments()).to.equal(0)
    })
  }

  it('writes no progress until the explorer finds the creation block', async () => {
    await Models.SafeAccount.track(network, safeAddress)
    const creation = ProxyWeb3Provider.fetchContractCreation as sinon.SinonStub
    creation.onSecondCall().resolves({ blockNumber: '987' } as any)

    await DaoTransactionsService.start(params)

    expect(crawl.notCalled).to.be.true
    expect(await Models.ConfigIndexer.countDocuments()).to.equal(0)
    expect((await Models.SafeAccount.findTracked(network, safeAddress))?.blockNumber).to.be.null

    await DaoTransactionsService.start(params)

    expect(creation.callCount).to.equal(2)
    expect(crawl.callCount).to.equal(3)
    expect(configs().every(item => item.fromBlock === 987)).to.be.true
    expect((await Models.SafeAccount.findTracked(network, safeAddress))?.blockNumber).to.equal(987)
  })

  it('keeps DAO crawlers when the address is also a registered Safe', async () => {
    await register()
    await Models.Dao.create({
      address: safeAddress,
      network,
      blockNumber: 42,
      transactionHash: '0xdao',
      creatorAddress: sender,
    })

    await DaoTransactionsService.start(params)

    expect(crawl.callCount).to.equal(4)
    expect(configs().every(item => item.fromBlock === 42)).to.be.true
    expect(configs()[2].events[0].event).to.equal(IDaoTransferLogs.NativeTokenDeposited)
    expect(configs()[3].events.map(item => item.event)).to.deep.equal([
      IDaoTransferLogs.Executed,
      IDaoTransferLogs.Executed,
    ])
    expect((ProxyWeb3Provider.fetchContractCreation as sinon.SinonStub).notCalled).to.be.true
  })

  it('does not reset executions for a Safe job', async () => {
    await register()
    const reset = sandbox.spy(DaoTransactionsService, 'resetExecutions')

    await DaoTransactionsService.start({ ...params, resetExecutions: true })

    expect(reset.notCalled).to.be.true
    expect(crawl.callCount).to.equal(3)
  })

  for (const side of [ITransactionSide.deposit, ITransactionSide.withdraw]) {
    it(`stores an ERC20 ${side} under the Safe and queues its token balance`, async () => {
      await register()
      await DaoTransactionsService.start(params)
      const service =
        side === ITransactionSide.deposit
          ? ConfigIndexerHelper.builders.tokenDeposit(network, safeAddress)
          : ConfigIndexerHelper.builders.tokenWithdraw(network, safeAddress)
      const from = side === ITransactionSide.deposit ? sender : safeAddress
      const to = side === ITransactionSide.deposit ? safeAddress : sender

      await processLog(service, 'Transfer', [from, to, 2500000000000000000n])
      await processLog(service, 'Transfer', [from, to, 2500000000000000000n])

      const rows = await Models.Transaction.find({ daoAddress: safeAddress, network }).lean()
      expect(rows).to.have.lengthOf(1)
      expect(rows[0]).to.include({
        fromAddress: from,
        toAddress: to,
        tokenAddress,
        side,
        type: ITransactionType.erc20,
        value: '2.5',
      })
      expect(send.firstCall.args).to.deep.equal([
        EnumQueueName.daoAssets,
        { id: `${network}-${safeAddress}-${tokenAddress}`, params: { address: safeAddress, network, tokenAddress } },
      ])
      expect(await Models.Dao.countDocuments()).to.equal(0)
    })
  }

  it('stores a SafeReceived deposit and queues the native balance', async () => {
    await register()
    await DaoTransactionsService.start(params)

    await processLog(ConfigIndexerHelper.builders.nativeDeposit(network, safeAddress), 'SafeReceived', [
      sender,
      3000000000000000000n,
    ])

    const row = await Models.Transaction.findOne({ daoAddress: safeAddress, network }).lean()
    expect(row).to.include({
      fromAddress: sender,
      toAddress: safeAddress,
      tokenAddress: utils.zeroAddress,
      value: '3.0',
      type: ITransactionType.native,
      side: ITransactionSide.deposit,
    })
    expect(send.calledOnce).to.be.true
    expect(send.firstCall.args).to.deep.equal([
      EnumQueueName.daoAssets,
      { id: `${network}-${safeAddress}-native`, params: { address: safeAddress, network, native: true } },
    ])
  })

  for (const side of [ITransactionSide.deposit, ITransactionSide.withdraw]) {
    it(`stores an ERC721 ${side} under the Safe without queueing an asset`, async () => {
      await register()
      await DaoTransactionsService.start(params)
      ;(ProxyToken.saveAndGetToken as sinon.SinonStub).resolves({
        address: tokenAddress,
        network,
        type: ITokenType.ERC721,
        name: 'Test NFT',
        symbol: 'NFT',
        decimals: 0,
      })
      const service =
        side === ITransactionSide.deposit
          ? ConfigIndexerHelper.builders.tokenDeposit(network, safeAddress)
          : ConfigIndexerHelper.builders.tokenWithdraw(network, safeAddress)
      const from = side === ITransactionSide.deposit ? sender : safeAddress
      const to = side === ITransactionSide.deposit ? safeAddress : sender

      await processLog(service, 'Transfer', [from, to, 7n], 1)

      const row = await Models.Transaction.findOne({ daoAddress: safeAddress, network }).lean()
      expect(row).to.include({
        fromAddress: from,
        toAddress: to,
        tokenAddress,
        tokenId: '7',
        type: ITransactionType.erc721,
        value: '1',
        side,
      })
      expect(send.notCalled).to.be.true
      expect(await Models.Asset.countDocuments()).to.equal(0)
    })
  }

  it('resets only the Safe transfer rows and their crawl progress', async () => {
    await register()
    const base = {
      transactionHash: '0xreset',
      blockNumber: 456,
      network,
      daoAddress: safeAddress,
      fromAddress: sender,
      toAddress: safeAddress,
      type: ITransactionType.erc20,
      side: ITransactionSide.deposit,
    }
    await Models.Transaction.create({ ...base, id: 'safe-transfer' })
    await Models.Transaction.create({ ...base, id: 'safe-execution', type: ITransactionType.execution })
    await Models.Transaction.create({ ...base, id: 'other-holder', daoAddress: sender })
    await Models.Transaction.create({ ...base, id: 'other-network', network: NetworksEnum.ethereumMainnet })
    const transferServices = ['tokenDeposit', 'tokenWithdraw', 'nativeDeposit', 'nativeWithdraw'] as const
    for (const name of transferServices) {
      await Models.ConfigIndexer.create({
        network,
        service: ConfigIndexerHelper.builders[name](network, safeAddress),
        lastSync: 789,
      })
    }
    const execution = ConfigIndexerHelper.builders.execution(network, safeAddress)
    const otherHolder = ConfigIndexerHelper.builders.tokenDeposit(network, sender)
    const otherNetwork = ConfigIndexerHelper.builders.tokenDeposit(NetworksEnum.ethereumMainnet, safeAddress)
    for (const [chain, service] of [
      [network, execution],
      [network, otherHolder],
      [NetworksEnum.ethereumMainnet, otherNetwork],
    ] as const) {
      await Models.ConfigIndexer.create({ network: chain, service, lastSync: 789 })
    }

    await DaoTransactionsService.start({ ...params, reset: true })

    expect(await Models.Transaction.distinct('id')).to.have.members(['safe-execution', 'other-holder', 'other-network'])
    expect(await Models.ConfigIndexer.distinct('service')).to.have.members([execution, otherHolder, otherNetwork])
    expect(crawl.callCount).to.equal(3)
    expect(configs().every(item => item.fromBlock === 123)).to.be.true
    expect((await Models.SafeAccount.findTracked(network, safeAddress))?.blockNumber).to.equal(123)
  })

  it('skips a SafeReceived deposit with no value', async () => {
    await register()
    await DaoTransactionsService.start(params)

    await processLog(ConfigIndexerHelper.builders.nativeDeposit(network, safeAddress), 'SafeReceived', [sender, 0n])

    expect(await Models.Transaction.countDocuments({ daoAddress: safeAddress, network })).to.equal(0)
    expect(send.notCalled).to.be.true
  })
})
