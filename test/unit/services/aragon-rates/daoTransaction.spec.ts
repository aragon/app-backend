import * as sinon from 'sinon'
import { expect } from 'chai'
import { DaoTransactions } from '@rates/daoTransaction'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import Logger from '@logger'
import BlockchainTransferCrawler from '@modules/blockchainTransferCrawler'
import { ITokenType, ITransactionCategory, ITransactionType, NetworksEnum } from '@types'
import type LogDaoRegistry from '@models/schema/logDaoRegistry'
import { fakeAlchemyTransfer } from '@test/mock/fakeAlchemyTransfer'
import Web3Helper from '@helpers/web3'
import { RateModule } from '@modules/rates'
import { UnitTestUtils } from '@test/lib/utils'
import ProviderModule from '@modules/provider'
import utils from '@helpers/utils'
import { TokenProxy } from '@modules/tokenProxy'

describe('Indexer:Aggregator:Transactions', () => {
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
      const stubDaoTransactions = sandbox.stub(DaoTransactions, 'onDocument')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onDocument(true)
      })

      await DaoTransactions.start()

      expect(stubLogger.calledWith('End DaoTransactions' as any)).to.be.true
      expect(stubDaoTransactions.calledOnceWith(true as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the DaoTransactions', async () => {
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await DaoTransactions.start()

      expect(stubLogger.calledWith('End DaoTransactions' as any)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  it('should getCategories', async () => {
    const result = DaoTransactions.getCategories(NetworksEnum.ethereumMainnet)
    expect(result.length).to.eq(5)

    const result2 = DaoTransactions.getCategories(NetworksEnum.arbitrumMainnet)
    expect(result2.length).to.eq(4)

    const result3 = DaoTransactions.getCategories(NetworksEnum.baseMainnet)
    expect(result3.length).to.eq(4)

    const result4 = DaoTransactions.getCategories(NetworksEnum.zksyncSepolia)
    expect(result4.length).to.eq(4)
  })

  describe('onDocument', async () => {
    it('should call onDocument and create deposit and withdraw transactions', async () => {
      const daoRegistry: Partial<LogDaoRegistry> = {
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
      ;(fakeProviders.send = sandbox.stub().resolves({ transfers: [txLog] })),
        sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const crawlStub = sandbox.stub(BlockchainTransferCrawler.prototype, 'crawl').callsFake(async function (
        this: any,
      ) {
        await this.onTx(txLog)
      })
      const saveTransactionStub = sandbox.stub(DaoTransactions, 'saveTransaction').resolves()

      await DaoTransactions.onDocument(daoRegistry as any)

      expect(crawlStub.calledTwice).to.be.true
      expect(saveTransactionStub.calledTwice).to.be.true

      expect(saveTransactionStub.calledWith(txLog, ITransactionType.deposit, daoRegistry)).to.be.true
      expect(saveTransactionStub.calledWith(txLog, ITransactionType.withdraw, daoRegistry)).to.be.true
    })

    it('should call onDocument and fails', async () => {
      const daoRegistry: Partial<LogDaoRegistry> = {
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
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const crawlStub = sandbox.stub(BlockchainTransferCrawler.prototype, 'crawl').callsFake(async function (
        this: any,
      ) {
        await this.onError(true)
      })
      const stubLogger = sandbox.stub(Logger, 'error')

      await DaoTransactions.onDocument(daoRegistry as any)

      expect(crawlStub.calledTwice).to.be.true
      expect(stubLogger.calledTwice).to.be.true
    })
  })

  describe('saveTransaction', () => {
    const tests = [fakeAlchemyTransfer[1], fakeAlchemyTransfer[2], fakeAlchemyTransfer[3], fakeAlchemyTransfer[4]]

    tests.forEach((tx: any) => {
      it(`should saveTransaction for ${tx.category}`, async () => {
        const daoRegistry = { id: 'daoRegistryId', address: tx.to, network: NetworksEnum.ethereumMainnet }
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

        const loggerStub = sandbox.stub(Logger, 'verbose')
        const stubToken = sandbox.stub(TokenProxy, 'saveAndGetToken').resolves(expectedTransaction.token as any)
        const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1)
        const fetchRateStub = sandbox.stub(RateModule, 'fetchRate').resolves({ priceUsd: '20' } as any)

        await DaoTransactions.saveTransaction(tx, expectedTransaction.type, daoRegistry as any)

        const existingTxDb = await Models.Transaction.findExistingLog({
          transactionHash: tx.hash,
          category: tx.category,
          network: daoRegistry.network,
        })

        expect(loggerStub.calledOnce).to.be.true
        expect(loggerStub.calledOnceWith('New Transaction' as any)).to.be.true
        expect(fetchRateStub.calledOnce).to.be.true

        expect(existingTxDb.transactionHash).to.equal(expectedTransaction.transactionHash)
        expect(stubToken.calledOnce).to.be.true
        expect(existingTxDb?.token?.address).to.equal(expectedTransaction?.token?.address)

        expect(getBlockTimestampStub.calledOnce).to.be.true

        loggerStub.restore()
        stubToken.restore()
        getBlockTimestampStub.restore()
        fetchRateStub.restore()
      })
    })

    it('skip existing transaction', async () => {
      const daoRegistry = { id: 'daoRegistryId', address: '0x01', network: NetworksEnum.ethereumMainnet }
      const tx = {
        transactionHash: '0x0',
      }

      const stubCreate = sandbox.stub(Models.Transaction, 'create')
      sandbox.stub(Models.Transaction, 'findExistingLog').resolves(true)
      const result = await DaoTransactions.saveTransaction(tx as any, ITransactionType.deposit, daoRegistry as any)

      expect(result).to.be.undefined
      expect(stubCreate.notCalled).to.be.true
    })

    it(`error saveTransaction`, async () => {
      const daoRegistry = { id: 'daoRegistryId', address: '0x01', network: NetworksEnum.ethereumMainnet }
      const tx = {
        transactionHash: '0x0',
      }

      const stubLogger = sandbox.stub(Logger, 'error')
      sandbox.stub(Models.Transaction, 'findExistingLog').rejects(new Error('fake-error'))
      await DaoTransactions.saveTransaction(tx as any, ITransactionType.deposit, daoRegistry as any)

      expect(stubLogger.calledOnce).to.be.true
    })
  })
})
