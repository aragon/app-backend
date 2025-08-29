import * as sinon from 'sinon'
import { expect } from 'chai'
import proxyquire from 'proxyquire'
import { NetworksEnum, ITransactionSide } from '@types'
import { ITransactionType } from '@src/types/transfer'

describe('AragonDao: DaoTransactions', () => {
  let sandbox: sinon.SinonSandbox
  let DaoTransactions: any
  let mockDao: any
  let mockProcessor: any
  let mockToken: any
  let crawlerConfigs: any[] = []
  let loggerStub: any
  let modelsStub: any
  let proxyTokenStub: any
  let transferProcessorFactoryStub: any
  let configIndexerHelperStub: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    crawlerConfigs = []

    mockDao = {
      id: 'test-dao-id',
      address: '0x0000000000000000000000000000000000000123',
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 1000,
    }

    mockToken = {
      decimals: 18,
      symbol: 'TEST',
      name: 'Test Token',
    }

    mockProcessor = {
      validateTransfer: sandbox.stub().returns(true),
      prepareTransferData: sandbox.stub().returns({
        transactionHash: '0xabc123',
        value: '1000000000000000000',
        tokenAddress: '0x0000000000000000000000000000000000000456',
      }),
      save: sandbox.stub().resolves(),
      getTransferType: sandbox.stub().returns(ITransactionType.erc20),
    }

    loggerStub = {
      verbose: sandbox.stub(),
      error: sandbox.stub(),
      logMeta: {
        bind: sandbox.stub().returns(() => ({})),
      },
    }

    modelsStub = {
      Dao: {
        findByAddress: sandbox.stub().resolves(mockDao),
      },
    }

    proxyTokenStub = {
      saveAndGetToken: sandbox.stub().resolves(mockToken),
    }

    transferProcessorFactoryStub = {
      create: sandbox.stub().returns(mockProcessor),
    }

    configIndexerHelperStub = {
      builders: {
        tokenDeposit: sandbox.stub().returns({}),
        nativeDeposit: sandbox.stub().returns({}),
        tokenWithdraw: sandbox.stub().returns({}),
        nativeWithdraw: sandbox.stub().returns({}),
      },
    }

    // Mock BlockchainLogCrawler to capture configurations
    const BlockchainLogCrawlerMock = function(this: any, config: any) {
      crawlerConfigs.push(config)
      this.crawl = sandbox.stub().resolves()
    }

    // Use proxyquire to inject mocks
    DaoTransactions = proxyquire('@services/aragon-dao/daoTransactions', {
      '@dbModels': { Models: modelsStub },
      '@logger': { default: loggerStub },
      '@modules/proxyToken': { ProxyToken: proxyTokenStub },
      '@modules/blockchainLogCrawler': { default: BlockchainLogCrawlerMock },
      '@helpers/configIndexer': { default: configIndexerHelperStub },
      'src/modules/transfers': { TransferProcessorFactory: transferProcessorFactoryStub },
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
  })

  describe('Event Handlers', () => {
    beforeEach(async () => {
      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })
    })

    describe('Incoming ERC20 Transfer Handler', () => {
      it('should process incoming ERC20 transfers correctly', async () => {
        const handler = crawlerConfigs[0]?.events[0]?.config[0]?.handler
        expect(handler).to.exist

        const parsedEvent = {
          name: 'Transfer',
          args: {
            from: '0x0000000000000000000000000000000000000999',
            to: mockDao.address,
            value: BigInt('1000000000000000000'),
          },
        }
        const info = {
          address: '0x0000000000000000000000000000000000000456',
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xabc123',
          blockNumber: 2000,
        }

        await handler(parsedEvent, info)

        expect(proxyTokenStub.saveAndGetToken.calledOnce).to.be.true
        const createCall = transferProcessorFactoryStub.create.getCall(0)
        expect(createCall.args[0]).to.equal(ITransactionType.erc20)
        expect(createCall.args[1]).to.equal(mockDao.network)
        expect(createCall.args[2]).to.equal(mockDao.address)
        expect(createCall.args[3].decimals).to.equal(18)
        expect(createCall.args[3].transactionSide).to.equal(ITransactionSide.deposit)
        expect(mockProcessor.validateTransfer.calledOnce).to.be.true
        expect(mockProcessor.prepareTransferData.calledOnce).to.be.true
        expect(mockProcessor.save.calledOnce).to.be.true
        expect(loggerStub.verbose.calledWith('ERC20 Transfer to DAO')).to.be.true
      })

      it('should handle transfers with amount field', async () => {
        const handler = crawlerConfigs[0]?.events[0]?.config[0]?.handler

        const parsedEvent = {
          name: 'Transfer',
          args: {
            from: '0x999',
            to: mockDao.address,
            amount: BigInt('1000'),
          },
        }
        const info = {
          address: '0x456',
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xabc',
          blockNumber: 2000,
        }

        await handler(parsedEvent, info)
        expect(mockProcessor.save.calledOnce).to.be.true
      })

      it('should handle transfers with positional args', async () => {
        const handler = crawlerConfigs[0]?.events[0]?.config[0]?.handler

        const parsedEvent = {
          name: 'Transfer',
          args: ['0x999', mockDao.address, BigInt('1000')],
        }
        const info = {
          address: '0x456',
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xabc',
          blockNumber: 2000,
        }

        await handler(parsedEvent, info)
        expect(mockProcessor.save.calledOnce).to.be.true
      })

      it('should skip invalid transfers', async () => {
        mockProcessor.validateTransfer.returns(false)
        const handler = crawlerConfigs[0]?.events[0]?.config[0]?.handler

        const parsedEvent = {
          name: 'Transfer',
          args: { from: '0x999', to: mockDao.address, value: BigInt('0') },
        }
        const info = {
          address: '0x456',
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xabc',
          blockNumber: 2000,
        }

        await handler(parsedEvent, info)
        expect(mockProcessor.save.called).to.be.false
      })
    })

    describe('Incoming ERC721 Transfer Handler', () => {
      it('should process incoming ERC721 transfers correctly', async () => {
        const handler = crawlerConfigs[0]?.events[0]?.config[1]?.handler
        expect(handler).to.exist

        const parsedEvent = {
          name: 'Transfer',
          args: {
            from: '0x999',
            to: mockDao.address,
            tokenId: BigInt('42'),
          },
        }
        const info = {
          address: '0x789',
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xdef',
          blockNumber: 2000,
        }

        await handler(parsedEvent, info)

        const createCall = transferProcessorFactoryStub.create.getCall(0)
        expect(createCall.args[0]).to.equal(ITransactionType.erc721)
        expect(createCall.args[1]).to.equal(mockDao.network)
        expect(createCall.args[2]).to.equal(mockDao.address)
        expect(createCall.args[3].transactionSide).to.equal(ITransactionSide.deposit)
        expect(mockProcessor.validateTransfer.called).to.be.true
        expect(mockProcessor.save.called).to.be.true
        expect(loggerStub.verbose.calledWith('ERC721 Transfer to DAO')).to.be.true
      })

      it('should handle ERC721 with positional args', async () => {
        const handler = crawlerConfigs[0]?.events[0]?.config[1]?.handler

        const parsedEvent = {
          name: 'Transfer',
          args: ['0x999', mockDao.address, BigInt('42')],
        }
        const info = {
          address: '0x789',
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xdef',
          blockNumber: 2000,
        }

        await handler(parsedEvent, info)
        expect(mockProcessor.save.called).to.be.true
      })

      it('should skip invalid ERC721 transfers', async () => {
        mockProcessor.validateTransfer.returns(false)
        const handler = crawlerConfigs[0]?.events[0]?.config[1]?.handler

        const parsedEvent = {
          name: 'Transfer',
          args: { from: '0x999', to: mockDao.address, tokenId: BigInt('42') },
        }
        const info = {
          address: '0x789',
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xdef',
          blockNumber: 2000,
        }

        await handler(parsedEvent, info)
        expect(mockProcessor.save.called).to.be.false
      })
    })

    describe('Native Token Deposit Handler', () => {
      it('should process native deposits correctly', async () => {
        const handler = crawlerConfigs[1]?.events[0]?.config[0]?.handler
        expect(handler).to.exist

        const parsedEvent = {
          name: 'NativeTokenDeposited',
          args: {
            sender: '0x999',
            amount: BigInt('2000000000000000000'),
          },
        }
        const info = {
          address: mockDao.address,
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xghi',
          blockNumber: 3000,
        }

        await handler(parsedEvent, info)

        const createCall = transferProcessorFactoryStub.create.getCall(0)
        expect(createCall.args[0]).to.equal(ITransactionType.native)
        expect(createCall.args[1]).to.equal(mockDao.network)
        expect(createCall.args[2]).to.equal(mockDao.address)
        expect(createCall.args[3].transactionSide).to.equal(ITransactionSide.deposit)
        expect(mockProcessor.prepareTransferData.called).to.be.true
        expect(mockProcessor.save.called).to.be.true
        expect(loggerStub.verbose.calledWith('Native Token Deposited to DAO')).to.be.true
      })

      it('should handle native deposits with positional args', async () => {
        const handler = crawlerConfigs[1]?.events[0]?.config[0]?.handler

        const parsedEvent = {
          name: 'NativeTokenDeposited',
          args: ['0x999', BigInt('2000000000000000000')],
        }
        const info = {
          address: mockDao.address,
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xghi',
          blockNumber: 3000,
        }

        await handler(parsedEvent, info)
        expect(mockProcessor.save.called).to.be.true
      })
    })

    describe('Outgoing ERC20 Transfer Handler', () => {
      it('should process outgoing ERC20 transfers correctly', async () => {
        const handler = crawlerConfigs[2]?.events[0]?.config[0]?.handler
        expect(handler).to.exist

        const parsedEvent = {
          name: 'Transfer',
          args: {
            from: mockDao.address,
            to: '0x999',
            amount: BigInt('500000000000000000'),
          },
        }
        const info = {
          address: '0x456',
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xjkl',
          blockNumber: 4000,
        }

        await handler(parsedEvent, info)

        expect(proxyTokenStub.saveAndGetToken.called).to.be.true
        expect(mockProcessor.validateTransfer.called).to.be.true
        expect(mockProcessor.save.called).to.be.true
        expect(loggerStub.verbose.calledWith('ERC20 Transfer from DAO')).to.be.true
      })

      it('should handle outgoing with value field', async () => {
        const handler = crawlerConfigs[2]?.events[0]?.config[0]?.handler

        const parsedEvent = {
          name: 'Transfer',
          args: {
            from: mockDao.address,
            to: '0x999',
            value: BigInt('500'),
          },
        }
        const info = {
          address: '0x456',
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xjkl',
          blockNumber: 4000,
        }

        await handler(parsedEvent, info)
        expect(mockProcessor.save.called).to.be.true
      })

      it('should handle with positional args', async () => {
        const handler = crawlerConfigs[2]?.events[0]?.config[0]?.handler

        const parsedEvent = {
          name: 'Transfer',
          args: [mockDao.address, '0x999', BigInt('500')],
        }
        const info = {
          address: '0x456',
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xjkl',
          blockNumber: 4000,
        }

        await handler(parsedEvent, info)
        expect(mockProcessor.save.called).to.be.true
      })

      it('should skip invalid outgoing ERC20', async () => {
        mockProcessor.validateTransfer.returns(false)
        const handler = crawlerConfigs[2]?.events[0]?.config[0]?.handler

        const parsedEvent = {
          name: 'Transfer',
          args: { from: mockDao.address, to: '0x999', value: BigInt('0') },
        }
        const info = {
          address: '0x456',
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xjkl',
          blockNumber: 4000,
        }

        await handler(parsedEvent, info)
        expect(mockProcessor.save.called).to.be.false
      })
    })

    describe('Outgoing ERC721 Transfer Handler', () => {
      it('should process outgoing ERC721 transfers correctly', async () => {
        const handler = crawlerConfigs[2]?.events[0]?.config[1]?.handler
        expect(handler).to.exist

        const parsedEvent = {
          name: 'Transfer',
          args: {
            from: mockDao.address,
            to: '0x999',
            tokenId: BigInt('99'),
          },
        }
        const info = {
          address: '0x789',
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xmno',
          blockNumber: 5000,
        }

        await handler(parsedEvent, info)

        expect(mockProcessor.validateTransfer.called).to.be.true
        expect(mockProcessor.save.called).to.be.true
        expect(loggerStub.verbose.calledWith('NFT Transfer from DAO')).to.be.true
      })

      it('should handle with positional args', async () => {
        const handler = crawlerConfigs[2]?.events[0]?.config[1]?.handler

        const parsedEvent = {
          name: 'Transfer',
          args: [mockDao.address, '0x999', BigInt('99')],
        }
        const info = {
          address: '0x789',
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xmno',
          blockNumber: 5000,
        }

        await handler(parsedEvent, info)
        expect(mockProcessor.save.called).to.be.true
      })

      it('should skip invalid outgoing ERC721', async () => {
        mockProcessor.validateTransfer.returns(false)
        const handler = crawlerConfigs[2]?.events[0]?.config[1]?.handler

        const parsedEvent = {
          name: 'Transfer',
          args: { from: mockDao.address, to: '0x999', tokenId: BigInt('99') },
        }
        const info = {
          address: '0x789',
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xmno',
          blockNumber: 5000,
        }

        await handler(parsedEvent, info)
        expect(mockProcessor.save.called).to.be.false
      })
    })

    describe('Executed Event Handler (Native Withdrawals)', () => {
      it('should process executed events with native transfers', async () => {
        const handler = crawlerConfigs[3]?.events[0]?.config[0]?.handler
        expect(handler).to.exist

        const parsedEvent = {
          name: 'Executed',
          args: [
            '0x111', // actor
            '0xabc123def456', // callId
            [
              { to: '0x222', value: BigInt('1000000000000000000'), data: '0x' },
              { to: '0x333', value: BigInt('2000000000000000000'), data: '0x' },
            ],
            BigInt('0'), // allowFailureMap
            BigInt('0'), // failureMap
            [], // execResults
          ],
        }
        const info = {
          address: mockDao.address,
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xpqr',
          blockNumber: 6000,
        }

        await handler(parsedEvent, info)

        expect(mockProcessor.prepareTransferData.calledTwice).to.be.true
        expect(mockProcessor.save.calledTwice).to.be.true
        expect(loggerStub.verbose.calledWith('Native transfer saved from Executed event')).to.be.true
      })

      it('should handle with positional action fields', async () => {
        const handler = crawlerConfigs[3]?.events[0]?.config[0]?.handler

        const parsedEvent = {
          name: 'Executed',
          args: [
            '0x111',
            '0xabc123def456',
            [['0x222', BigInt('1000000000000000000'), '0x']],
          ],
        }
        const info = {
          address: mockDao.address,
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xpqr',
          blockNumber: 6000,
        }

        await handler(parsedEvent, info)
        expect(mockProcessor.save.calledOnce).to.be.true
      })

      it('should skip actions with zero value', async () => {
        const handler = crawlerConfigs[3]?.events[0]?.config[0]?.handler

        const parsedEvent = {
          name: 'Executed',
          args: [
            '0x111',
            '0xabc',
            [{ to: '0x222', value: BigInt('0'), data: '0x' }],
          ],
        }
        const info = {
          address: mockDao.address,
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xpqr',
          blockNumber: 6000,
        }

        await handler(parsedEvent, info)
        expect(mockProcessor.save.called).to.be.false
      })

      it('should handle no actions', async () => {
        const handler = crawlerConfigs[3]?.events[0]?.config[0]?.handler

        const parsedEvent = {
          name: 'Executed',
          args: ['0x111', '0xabc', []],
        }
        const info = {
          address: mockDao.address,
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xpqr',
          blockNumber: 6000,
        }

        await handler(parsedEvent, info)
        expect(mockProcessor.save.called).to.be.false
      })

      it('should handle non-array actions', async () => {
        const handler = crawlerConfigs[3]?.events[0]?.config[0]?.handler

        const parsedEvent = {
          name: 'Executed',
          args: ['0x111', '0xabc', null],
        }
        const info = {
          address: mockDao.address,
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xpqr',
          blockNumber: 6000,
        }

        await handler(parsedEvent, info)
        expect(mockProcessor.save.called).to.be.false
      })

      it('should handle less than 3 args', async () => {
        const handler = crawlerConfigs[3]?.events[0]?.config[0]?.handler

        const parsedEvent = {
          name: 'Executed',
          args: ['0x111'],
        }
        const info = {
          address: mockDao.address,
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xpqr',
          blockNumber: 6000,
        }

        await handler(parsedEvent, info)
        expect(mockProcessor.save.called).to.be.false
      })

      it('should assign correct actionIndex', async () => {
        // Return new object each time to simulate real behavior
        mockProcessor.prepareTransferData.onCall(0).returns({ transactionHash: '0xpqr' })
        mockProcessor.prepareTransferData.onCall(1).returns({ transactionHash: '0xpqr' })
        mockProcessor.prepareTransferData.onCall(2).returns({ transactionHash: '0xpqr' })
        const handler = crawlerConfigs[3]?.events[0]?.config[0]?.handler

        const parsedEvent = {
          name: 'Executed',
          args: [
            '0x111',
            '0xabc',
            [
              { to: '0x222', value: BigInt('1000'), data: '0x' },
              { to: '0x333', value: BigInt('2000'), data: '0x' },
              { to: '0x444', value: BigInt('3000'), data: '0x' },
            ],
          ],
        }
        const info = {
          address: mockDao.address,
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xpqr',
          blockNumber: 6000,
        }

        await handler(parsedEvent, info)

        expect(mockProcessor.save.callCount).to.equal(3)
        expect(mockProcessor.save.firstCall.args[0]).to.deep.equal({ transactionHash: '0xpqr', actionIndex: 0 })
        expect(mockProcessor.save.secondCall.args[0]).to.deep.equal({ transactionHash: '0xpqr', actionIndex: 1 })
        expect(mockProcessor.save.thirdCall.args[0]).to.deep.equal({ transactionHash: '0xpqr', actionIndex: 2 })
      })
    })

    describe('Error Handlers', () => {
      it('should handle errors in incoming transfer crawler', async () => {
        const onError = crawlerConfigs[0]?.onError
        expect(onError).to.exist

        await onError(new Error('Test error'), { transactionHash: '0xtest' })

        expect(loggerStub.error.calledWith('Error crawling transfer events')).to.be.true
      })

      it('should handle errors in native deposit crawler', async () => {
        const onError = crawlerConfigs[1]?.onError
        expect(onError).to.exist

        await onError(new Error('Native deposit error'), { transactionHash: '0xtest' })

        expect(loggerStub.error.calledWith('Error crawling native deposit events')).to.be.true
      })

      it('should handle errors in outgoing transfer crawler', async () => {
        const onError = crawlerConfigs[2]?.onError
        expect(onError).to.exist

        await onError(new Error('Outgoing transfer error'), { transactionHash: '0xtest' })

        expect(loggerStub.error.calledWith('Error crawling transfer events')).to.be.true
      })

      it('should handle errors in executed event crawler', async () => {
        const onError = crawlerConfigs[3]?.onError
        expect(onError).to.exist

        await onError(new Error('Executed event error'), { transactionHash: '0xtest' })

        expect(loggerStub.error.calledWith('Error crawling Executed events')).to.be.true
      })
    })
  })

  describe('Error handling in start', () => {
    it('should handle crawl promise rejection', async () => {
      const BlockchainLogCrawlerMock = function(this: any, config: any) {
        crawlerConfigs.push(config)
        this.crawl = sandbox.stub().rejects(new Error('Crawl failed'))
      }

      DaoTransactions = proxyquire('@services/aragon-dao/daoTransactions', {
        '@dbModels': { Models: modelsStub },
        '@logger': { default: loggerStub },
        '@modules/proxyToken': { ProxyToken: proxyTokenStub },
        '@modules/blockchainLogCrawler': { default: BlockchainLogCrawlerMock },
        '@helpers/configIndexer': { default: configIndexerHelperStub },
        'src/modules/transfers': { TransferProcessorFactory: transferProcessorFactoryStub },
      }).DaoTransactions

      await DaoTransactions.start({
        daoAddress: mockDao.address,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(loggerStub.error.calledWith('Error start DaoTransactions')).to.be.true
    })
  })
})
