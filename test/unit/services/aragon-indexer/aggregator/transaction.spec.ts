import * as sinon from 'sinon'
import { expect } from 'chai'
import { AggregatorTransactions } from '@services/aragon-indexer/aggregator/transaction'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import Logger from '@logger'
import BlockchainTransferCrawler from '@modules/blockchainTransferCrawler'
import { ITransactionCategory, ITransactionType, NetworksEnum } from '@types'
import type LogDaoRegistry from '@models/schema/logDaoRegistry'
import { ConfigState } from '@state/configState'
import { fakeAlchemyTransfer } from '@test/mock/fakeAlchemyTransfer'

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
      const stubAggregatorTransactions = sandbox.stub(AggregatorTransactions, 'onDocument')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onDocument(true)
      })

      await AggregatorTransactions.start()

      expect(stubLogger.calledWith('End AggregatorTransactions' as any)).to.be.true
      expect(stubAggregatorTransactions.calledOnceWith(true as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the AggregatorTransactions', async () => {
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await AggregatorTransactions.start()

      expect(stubLogger.calledWith('End AggregatorTransactions' as any)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  it('should getCategories', async () => {
    const result = AggregatorTransactions.getCategories(NetworksEnum.ethereumMainnet)
    expect(result.length).to.eq(5)

    const result2 = AggregatorTransactions.getCategories(NetworksEnum.arbitrumMainnet)
    expect(result2.length).to.eq(4)
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
      const fakeProvider = {
        send: sandbox.stub().resolves({ transfers: [txLog] }),
      }
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(fakeProvider)

      const crawlStub = sandbox.stub(BlockchainTransferCrawler.prototype, 'crawl').callsFake(async function (
        this: any,
      ) {
        await this.onTx(txLog)
      })
      const saveTransactionStub = sandbox.stub(AggregatorTransactions, 'saveTransaction').resolves()

      await AggregatorTransactions.onDocument(daoRegistry as any)

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
      const fakeProvider = {
        send: sandbox.stub().resolves({ transfers: [txLog] }),
      }
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(fakeProvider)

      const crawlStub = sandbox.stub(BlockchainTransferCrawler.prototype, 'crawl').callsFake(async function (
        this: any,
      ) {
        await this.onError(true)
      })
      const stubLogger = sandbox.stub(Logger, 'error')

      await AggregatorTransactions.onDocument(daoRegistry as any)

      expect(crawlStub.calledTwice).to.be.true
      expect(stubLogger.calledTwice).to.be.true
    })
  })

  describe('saveTransaction', () => {
    const tests = [fakeAlchemyTransfer[1], fakeAlchemyTransfer[2], fakeAlchemyTransfer[3], fakeAlchemyTransfer[4]]

    tests.forEach((tx: any) => {
      it(`should saveTransaction for ${tx.category}`, async () => {
        const daoRegistry = { id: 'daoRegistryId', address: tx.to, network: NetworksEnum.ethereumMainnet }
        const expectedTransaction = {
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
          tokenAddress: tx.rawContract.address,
          category: tx.category,
        }

        await AggregatorTransactions.saveTransaction(tx, expectedTransaction.type, daoRegistry as any)

        const existingTxDb = await Models.Transaction.findExistingLog({
          transactionHash: tx.hash,
          category: tx.category,
          network: daoRegistry.network,
        })

        expect(existingTxDb.transactionHash).to.equal(expectedTransaction.transactionHash)
      })
    })

    it('skip existing transaction', async () => {
      const daoRegistry = { id: 'daoRegistryId', address: '0x01', network: NetworksEnum.ethereumMainnet }
      const tx = {
        transactionHash: '0x0',
      }

      const stubCreate = sandbox.stub(Models.Transaction, 'create')
      sandbox.stub(Models.Transaction, 'findExistingLog').resolves(true)
      const result = await AggregatorTransactions.saveTransaction(
        tx as any,
        ITransactionType.deposit,
        daoRegistry as any,
      )

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
      await AggregatorTransactions.saveTransaction(tx as any, ITransactionType.deposit, daoRegistry as any)

      expect(stubLogger.calledOnce).to.be.true
    })
  })
})
