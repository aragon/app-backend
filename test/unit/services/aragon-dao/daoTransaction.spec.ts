import * as sinon from 'sinon'
import { expect } from 'chai'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import Logger from '@logger'
import logger from '@logger'
import BlockchainTransferCrawler from '@modules/blockchainTransferCrawler'
import { ITokenType, ITransactionCategory, ITransactionType, NetworksEnum } from '@types'
import type Dao from '@models/schema/dao'
import { fakeAlchemyTransfer } from '@test/mock/fakeAlchemyTransfer'
import Web3Helper from '@helpers/web3'
import { RateModule } from '@modules/rates'
import { UnitTestUtils } from '@test/lib/utils'
import ProviderModule from '@modules/provider'
import utils from '@helpers/utils'
import { ProxyToken } from '@modules/proxyToken'
import TokenUtils from '@helpers/tokenUtils'
import Web3Utils from '@helpers/web3Utils'

describe('AragonDao: DaoTransactions', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the AggregatorTransactions', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const stubFindByAddress = sandbox.stub(Models.Dao, 'findByAddress').resolves({
        id: 'test-dao',
        address: '0x123',
        network: NetworksEnum.ethereumMainnet,
      } as any)
      const stubOnDocument = sandbox.stub(DaoTransactions, 'onDocument').resolves()
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')

      await DaoTransactions.start({ daoAddress: '0x123', network: NetworksEnum.ethereumMainnet })

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubOnDocument.calledOnce).to.be.true
      expect(stubLogger.calledWith('End DaoTransactions' as any)).to.be.true
      expect(crawlerStub.notCalled).to.be.true
    })

    it('should exit gracefully if DAO is not found', async () => {
      const stubFindByAddress = sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const stubLogger = sandbox.stub(Logger, 'verbose')

      await DaoTransactions.start({ daoAddress: '0x123', network: NetworksEnum.ethereumMainnet })

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubLogger.calledWithMatch('Start DaoTransactions' as any)).to.be.true
      expect(stubLogger.calledWithMatch('End DaoTransactions' as any)).to.be.false // Should not log end
    })

    it('should throw error', async () => {
      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(Models.Dao, 'findByAddress').rejects(new Error('fake-error'))

      await DaoTransactions.start({ daoAddress: '0x123', network: NetworksEnum.ethereumMainnet } as any)

      expect(stubLogger.calledWith('Error start DaoTransactions' as any)).to.be.true
    })
  })

  describe('getCategories', () => {
    it('should return correct number of categories for ethereumMainnet', () => {
      const result = DaoTransactions.getCategories(NetworksEnum.ethereumMainnet)
      expect(result).to.be.an('array').with.lengthOf(5)
      expect(result).to.include.members([
        ITransactionCategory.ERC20,
        ITransactionCategory.ERC721,
        ITransactionCategory.ERC1155,
        ITransactionCategory.Internal,
        ITransactionCategory.External,
      ])
    })

    it('should return correct number of categories for arbitrumMainnet', () => {
      const result = DaoTransactions.getCategories(NetworksEnum.arbitrumMainnet)
      expect(result).to.be.an('array').with.lengthOf(4)
      expect(result).to.include.members([
        ITransactionCategory.ERC20,
        ITransactionCategory.ERC721,
        ITransactionCategory.ERC1155,
        ITransactionCategory.External,
      ])
      expect(result).to.not.include(ITransactionCategory.Internal)
    })

    it('should return correct number of categories for baseMainnet', () => {
      const result = DaoTransactions.getCategories(NetworksEnum.baseMainnet)
      expect(result).to.be.an('array').with.lengthOf(4)
      expect(result).to.include.members([
        ITransactionCategory.ERC20,
        ITransactionCategory.ERC721,
        ITransactionCategory.ERC1155,
        ITransactionCategory.External,
      ])
      expect(result).to.not.include(ITransactionCategory.Internal)
    })

    it('should return correct number of categories for zksyncSepolia', () => {
      const result = DaoTransactions.getCategories(NetworksEnum.zksyncSepolia)
      expect(result).to.be.an('array').with.lengthOf(4)
      expect(result).to.include.members([
        ITransactionCategory.ERC20,
        ITransactionCategory.ERC721,
        ITransactionCategory.ERC1155,
        ITransactionCategory.External,
      ])
      expect(result).to.not.include(ITransactionCategory.Internal)
    })

    it('should return default categories for an unsupported network', () => {
      const result = DaoTransactions.getCategories('unsupportedNetwork' as NetworksEnum)
      expect(result).to.include.members([
        ITransactionCategory.ERC20,
        ITransactionCategory.ERC721,
        ITransactionCategory.ERC1155,
        ITransactionCategory.Internal,
        ITransactionCategory.External,
      ])
    })
  })

  describe('onDocument', async () => {
    it('should call onDocument and create deposit and withdraw transactions', async () => {
      const daoRegistry: Partial<Dao> = {
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        network: NetworksEnum.ethereumMainnet,
      }

      const txLog: any = {
        hash: '0x123',
        category: ITransactionCategory.ERC20,
        uniqueId: 'unique-id',
        from: '0xfrom',
        to: '0xto',
        value: 1000,
        blockNum: 1,
      }

      const fakeProviders: any = UnitTestUtils.getFakeProviders(sandbox)
      fakeProviders.send = sandbox.stub().resolves({ transfers: [txLog] })
      sandbox.stub(ProviderModule, 'getProvider').callsFake((network: NetworksEnum) => fakeProviders[network])

      const crawlStub = sandbox.stub(BlockchainTransferCrawler.prototype, 'crawl').callsFake(async function (
        this: any,
      ) {
        await this.onTx(txLog)
      })
      const saveTransactionStub = sandbox.stub(DaoTransactions, 'saveTransaction').resolves()
      await DaoTransactions.onDocument(daoRegistry as Dao)

      expect(crawlStub.calledTwice).to.be.true
      expect(saveTransactionStub.calledTwice).to.be.true
      expect(saveTransactionStub.calledWith(txLog, ITransactionType.deposit, daoRegistry)).to.be.true
      expect(saveTransactionStub.calledWith(txLog, ITransactionType.withdraw, daoRegistry)).to.be.true
    })

    it('should call onDocument and handle errors', async () => {
      const daoRegistry: Partial<Dao> = {
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        network: NetworksEnum.ethereumMainnet,
      }

      const fakeProviders: any = UnitTestUtils.getFakeProviders(sandbox)
      fakeProviders.send = sandbox.stub().resolves({ transfers: [] }) // No transfers
      sandbox.stub(ProviderModule, 'getProvider').callsFake((network: NetworksEnum) => fakeProviders[network])

      const crawlStub = sandbox.stub(BlockchainTransferCrawler.prototype, 'crawl').callsFake(async function (
        this: any,
      ) {
        await this.onError(new Error('fake-error'))
      })

      const stubLoggerError = sandbox.stub(Logger, 'error')
      await DaoTransactions.onDocument(daoRegistry as Dao)

      expect(crawlStub.calledTwice, 'crawl should be called twice for deposit and withdraw').to.be.true
      expect(stubLoggerError.calledTwice, 'Logger.error should be called twice for deposit and withdraw errors').to.be
        .true
      expect(
        stubLoggerError.firstCall.calledWithMatch('Error deposit transfer' as any),
        'Logger.error should be called for deposit transfer error',
      ).to.be.true
      expect(
        stubLoggerError.secondCall.calledWithMatch('Error withdraw transfer' as any),
        'Logger.error should be called for withdraw transfer error',
      ).to.be.true
    })
  })

  describe('saveTransaction', () => {
    const tests = [fakeAlchemyTransfer[1], fakeAlchemyTransfer[2], fakeAlchemyTransfer[3], fakeAlchemyTransfer[4]]

    tests.forEach((tx: any, index: number) => {
      it(`should saveTransaction for ${tx.category}`, async () => {
        const daoRegistry: Partial<Dao> = {
          id: 'daoRegistryId',
          address: tx.to,
          network: NetworksEnum.ethereumMainnet,
        }

        const expectedTransaction: any = {
          transactionHash: tx.hash,
          blockNumber: parseInt(tx.blockNum, 16),
          network: daoRegistry.network,
          type: ITransactionType.deposit,
          daoAddress: daoRegistry.address,
          fromAddress: tx.from,
          toAddress: tx.to,
          value: tx.value ? tx.value.toString() : undefined,
          tokenId: tx.tokenId,
          erc721TokenId: tx.erc721TokenId,
          erc1155Metadata: tx.erc1155Metadata,
          tokenAddress: tx.rawContract?.address ? tx.rawContract.address : utils.zeroAddress,
          category: tx.category,
        }

        expectedTransaction.token = {
          type: ITokenType.ERC20,
          address: tx.rawContract?.address ? tx.rawContract.address : utils.zeroAddress,
          logo: null,
          name: 'Sepolia Avalanche',
          symbol: 'SAVL',
          decimals: 18,
        }

        const fakeLogs = [
          {
            address: daoRegistry.address,
            data: '0x01',
            topics: ['0x01', 1, '0x01', '0x01'],
          },
        ]

        const loggerStub = sandbox.stub(Logger, 'verbose')
        const stubToken = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(expectedTransaction.token as any)
        const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1)
        const fetchRateStub = sandbox.stub(RateModule, 'fetchRate').resolves({ priceUsd: '20' } as any)
        const findTxReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
          logs: fakeLogs,
        } as any)
        const findLogsByName = sandbox.stub(Web3Utils, 'findLogsByName').returns([{ txLog: fakeLogs[0] }] as any)

        const getTokenDetailsStub = sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)

        await DaoTransactions.saveTransaction(tx, expectedTransaction.type, daoRegistry as any)

        const existingTxDb = await Models.Transaction.findExistingLog({
          transactionHash: tx.hash,
          category: tx.category,
          network: daoRegistry.network,
          uniqueId: tx.uniqueId,
        })

        expect(findTxReceiptStub.calledOnce).to.be.true
        expect(findLogsByName.calledTwice).to.be.true

        expect(existingTxDb.proposalIndex).to.be.eq('1')

        expect(loggerStub.calledOnce).to.be.true
        expect(loggerStub.calledOnceWith('New Transaction' as any)).to.be.true
        expect(fetchRateStub.calledOnce).to.be.true

        expect(existingTxDb.transactionHash).to.equal(expectedTransaction.transactionHash)
        expect(stubToken.calledOnce).to.be.true
        expect(existingTxDb?.token?.address).to.equal(expectedTransaction?.token?.address)
        expect(getBlockTimestampStub.calledOnce).to.be.true

        if (index > 1) {
          expect(getTokenDetailsStub.calledOnce).to.be.true
        }
      })
    })

    describe('handle invalid and scam tokens', () => {
      const tests = [fakeAlchemyTransfer[3], fakeAlchemyTransfer[4]]

      it('should handle token is valid but a and scam token', async () => {
        const daoRegistry: Partial<Dao> = {
          id: 'daoRegistryId',
          address: tests[0].to,
          network: NetworksEnum.ethereumMainnet,
        }

        const fakeLogs = [
          {
            address: daoRegistry.address,
            data: '0x01',
            topics: ['0x01', 1, '0x01', '0x01'],
          },
        ]

        const findTxReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
          logs: fakeLogs,
        } as any)

        const findLogsByName = sandbox.stub(Web3Utils, 'findLogsByName').returns([{ txLog: fakeLogs[0] }] as any)

        const getTokenDetailsStub = sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(false)

        const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1)

        const loggerStub = sandbox.stub(Logger, 'warn')

        await DaoTransactions.saveTransaction(tests[0] as any, ITransactionType.deposit, daoRegistry as any)

        expect(findTxReceiptStub.calledOnce).to.be.true
        expect(findLogsByName.calledOnce).to.be.false
        expect(getTokenDetailsStub.calledOnce).to.be.true
        expect(getBlockTimestampStub.calledOnce).to.be.false
        expect(loggerStub.calledOnce).to.be.true
      })
    })

    it('should log an error when saveTransaction fails', async () => {
      const daoRegistry: Partial<Dao> = {
        id: 'daoRegistryId',
        address: '0x01',
        network: NetworksEnum.ethereumMainnet,
      }
      const tx = {
        transactionHash: '0x0',
      }

      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(Models.Transaction, 'findExistingLog').rejects(new Error('fake-error'))
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        network: daoRegistry.network,
        address: '0x01',
        decimals: 18,
        name: 'test',
        symbol: 'tst',
        type: ITokenType.ERC20,
      } as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1)
      sandbox.stub(RateModule, 'fetchRate').resolves({ priceUsd: '20' } as any)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({ logs: [] } as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([] as any)

      await DaoTransactions.saveTransaction(tx as any, ITransactionType.deposit, daoRegistry as any)

      expect(stubLogger.calledOnceWith('Error saveTransaction' as any)).to.be.true
    })

    it('should return if already exist', async () => {
      const daoRegistry: Partial<Dao> = {
        id: 'daoRegistryId',
        address: '0x01',
        network: NetworksEnum.ethereumMainnet,
      }
      const tx = {
        transactionHash: '0x0',
      }

      const stubLogger = sandbox.stub(Logger, 'verbose')
      sandbox.stub(Models.Transaction, 'findExistingLog').resolves({} as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        network: daoRegistry.network,
        address: '0x01',
        decimals: 18,
        name: 'test',
        symbol: 'tst',
        type: ITokenType.ERC20,
      } as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1)
      sandbox.stub(RateModule, 'fetchRate').resolves({ priceUsd: '20' } as any)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({ logs: [] } as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([] as any)

      await DaoTransactions.saveTransaction(tx as any, ITransactionType.deposit, daoRegistry as any)

      expect(stubLogger.calledOnceWith('Transaction already saved' as any)).to.be.true
    })

    it(`should saveTransaction in parallel`, async () => {
      const tx = fakeAlchemyTransfer[1] as any
      const daoRegistry: Partial<Dao> = {
        id: 'daoRegistryId',
        address: tx.to,
        network: NetworksEnum.ethereumMainnet,
      }

      const expectedTransaction: any = {
        transactionHash: tx.hash,
        blockNumber: parseInt(tx.blockNum, 16),
        network: daoRegistry.network,
        type: ITransactionType.deposit,
        daoAddress: daoRegistry.address,
        fromAddress: tx.from,
        toAddress: tx.to,
        value: tx.value ? tx.value.toString() : undefined,
        tokenId: tx.tokenId,
        erc721TokenId: tx.erc721TokenId,
        erc1155Metadata: tx.erc1155Metadata,
        tokenAddress: tx.rawContract?.address ? tx.rawContract.address : utils.zeroAddress,
        category: tx.category,
      }

      expectedTransaction.token = {
        type: ITokenType.ERC20,
        address: tx.rawContract?.address ? tx.rawContract.address : utils.zeroAddress,
        logo: null,
        name: 'Sepolia Avalanche',
        symbol: 'SAVL',
        decimals: 18,
      }

      const fakeLogs = [
        {
          address: daoRegistry.address,
          data: '0x01',
          topics: ['0x01', 1, '0x01', '0x01'],
        },
      ]

      sandbox.stub(logger, 'verbose')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(expectedTransaction.token as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1)
      sandbox.stub(RateModule, 'fetchRate').resolves({ priceUsd: '20' } as any)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({ logs: fakeLogs } as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([{ txLog: fakeLogs[0] }] as any)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'analyzeIfScamToken').returns(false)

      const [result1, result2, result3] = (await Promise.all([
        DaoTransactions.saveTransaction(tx, expectedTransaction.type, daoRegistry as any),
        DaoTransactions.saveTransaction(tx, expectedTransaction.type, daoRegistry as any),
        DaoTransactions.saveTransaction(tx, expectedTransaction.type, daoRegistry as any),
      ])) as any

      expect(result1.transactionHash).to.equal(tx.hash)
      expect(result2.transactionHash).to.equal(tx.hash)
      expect(result3.transactionHash).to.equal(tx.hash)

      const items = await Models.Transaction.countDocuments()
      expect(items).to.equal(1)
    })

    it('should skip saving transaction if receipt is null', async () => {
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)
      const loggerStub = sandbox.stub(Logger, 'verbose')

      const tx = { hash: '0x123', blockNum: '0x1' } as any
      const daoRegistry = { address: '0x123', network: NetworksEnum.ethereumMainnet } as Dao

      await DaoTransactions.saveTransaction(tx, ITransactionType.deposit, daoRegistry)

      expect(loggerStub.calledWithMatch('New Transaction' as any)).to.be.false
    })

    it('should handle invalid log data gracefully', async () => {
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({ logs: [] } as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1)
      sandbox.stub(Web3Utils, 'findLogsByName').returns(null as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        network: NetworksEnum.ethereumMainnet,
        address: '0x01',
        decimals: 18,
        name: 'test',
        symbol: 'tst',
        type: ITokenType.ERC20,
      } as any)
      const loggerStub = sandbox.stub(Logger, 'error')

      const tx = { hash: '0x123', blockNum: '0x1' } as any
      const daoRegistry = { address: '0x123', network: NetworksEnum.ethereumMainnet } as Dao

      await DaoTransactions.saveTransaction(tx, ITransactionType.deposit, daoRegistry)

      expect(loggerStub.calledWithMatch('Error saveTransaction' as any)).to.be.true
    })

    it('should handle transactions without tokens', async () => {
      sandbox.stub(Web3Utils, 'findLogsByName').returns(null as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({ logs: [] } as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)
      const loggerStub = sandbox.stub(Logger, 'verbose')

      const tx = {
        uniqueId: '0xuniq',
        hash: '0x123',
        blockNum: '0x1',
        category: ITransactionCategory.ERC20,
        from: '0x',
        to: '0x',
      } as any
      const daoRegistry = { address: '0x123', network: NetworksEnum.ethereumMainnet } as Dao

      await DaoTransactions.saveTransaction(tx, ITransactionType.deposit, daoRegistry)

      expect(loggerStub.calledOnceWith('New Transaction' as any)).to.be.true
    })
  })

  describe('calculateAmountUsd', () => {
    it('should correctly calculate USD amount for valid inputs', () => {
      const amount = 100
      const priceUsd = 2.5
      const expectedUsd = '250' // 100 * 2.5

      const result = DaoTransactions.calculateAmountUsd(amount, priceUsd)

      expect(result).to.equal(expectedUsd)
    })

    it('should return 0 when amount is zero', () => {
      const amount = 0
      const priceUsd = 5
      const expectedUsd = '0'

      const result = DaoTransactions.calculateAmountUsd(amount, priceUsd)

      expect(result).to.equal(expectedUsd)
    })

    it('should return 0 when priceUsd is zero', () => {
      const amount = 100
      const priceUsd = 0
      const expectedUsd = '0'

      const result = DaoTransactions.calculateAmountUsd(amount, priceUsd)

      expect(result).to.equal(expectedUsd)
    })

    it('should return NaN when amount is not a valid number', () => {
      const amount = 'invalid'
      const priceUsd = 10

      const result = DaoTransactions.calculateAmountUsd(amount as any, priceUsd)

      expect(result).to.eq('0')
    })

    it('should handle very large numbers without precision loss', () => {
      const amount = '1000000000000000000' // 1e18
      const priceUsd = 1000000 // 1e6
      const expectedUsd = '1000000000000000000000000' // 1e24

      const result = DaoTransactions.calculateAmountUsd(amount as any, priceUsd)

      expect(result).to.equal(expectedUsd)
    })

    it('should correctly calculate USD amount with decimal precision', () => {
      const amount = 123.456
      const priceUsd = 7.89
      const expectedUsd = 123.456 * 7.89 // Approximately 974.06784

      const result = DaoTransactions.calculateAmountUsd(amount, priceUsd)

      expect(Number(result)).to.be.closeTo(expectedUsd, 1)
    })

    it('should handle negative amount by returning negative USD value', () => {
      const amount = -50
      const priceUsd = 4
      const expectedUsd = '-200' // -50 * 4

      const result = DaoTransactions.calculateAmountUsd(amount, priceUsd)

      expect(result).to.equal(expectedUsd)
    })

    it('should handle negative priceUsd by returning negative USD value', () => {
      const amount = 50
      const priceUsd = -4
      const expectedUsd = '-200' // 50 * -4

      const result = DaoTransactions.calculateAmountUsd(amount, priceUsd)

      expect(result).to.equal(expectedUsd)
    })

    it('should handle both negative amount and priceUsd by returning positive USD value', () => {
      const amount = -50
      const priceUsd = -4
      const expectedUsd = '200' // -50 * -4

      const result = DaoTransactions.calculateAmountUsd(amount, priceUsd)

      expect(result).to.equal(expectedUsd)
    })
  })
})
