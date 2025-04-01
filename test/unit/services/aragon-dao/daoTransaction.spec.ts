import * as sinon from 'sinon'
import { expect } from 'chai'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import logger from '@logger'
import Web3Helper from '@helpers/web3'
import { DAO } from '@artifacts/dao'
import { Multisig } from '@artifacts/Multisig'
import AssetTransferProvider from '@providers/assetTransafersProvider/providerFactory'
import { ITransactionType, NetworksEnum } from '@types'
import type Dao from '@models/schema/dao'

describe('DaoTransactions', () => {
  let sandbox: sinon.SinonSandbox
  const network = NetworksEnum.ethereumMainnet
  const daoAddress = '0xDaoAddress'
  const fakeDao: Dao = { id: 'dao1', address: daoAddress, network } as any
  const fakeTxLog = {
    hash: '0xhash',
    uniqueId: 'unique1',
    from: '0xfrom',
    to: '0xto',
    value: '1000',
    blockNum: 123,
    blockTimestamp: '2025-03-04T00:00:00.000Z',
    category: 'erc20',
    tokenId: '1',
    erc721TokenId: '2',
    erc1155Metadata: [{ tokenId: '3', value: '10' }],
    rawContract: {
      address: '0xTokenAddress',
      symbol: 'TTK',
      name: 'Test Token',
      type: 'erc20',
      logo: 'https://example.com/logo.png',
      decimals: 18,
      priceUsd: '5',
      priceUpdatedAt: '2025-03-04T00:00:00.000Z',
    },
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('start', () => {
    it('should return if dao not found', async () => {
      const findDaoStub = sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const assetTransfersStub = sandbox.stub(AssetTransferProvider, 'getAssetTransfers')
      const verboseStub = sandbox.stub(logger, 'verbose')
      await DaoTransactions.start({ daoAddress, network })
      expect(findDaoStub.calledOnceWith(daoAddress, network)).to.be.true
      expect(assetTransfersStub.notCalled).to.be.true
      expect(verboseStub.called).to.be.true
    })

    it('should call getAssetTransfers with dao and callback', async () => {
      const findDaoStub = sandbox.stub(Models.Dao, 'findByAddress').resolves(fakeDao)
      const assetTransfersStub = sandbox.stub(AssetTransferProvider, 'getAssetTransfers').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      await DaoTransactions.start({ daoAddress, network })
      expect(findDaoStub.calledOnceWith(daoAddress, network)).to.be.true
      expect(assetTransfersStub.calledWith(fakeDao)).to.be.true
      expect(verboseStub.calledTwice).to.be.true
    })

    it('should log error if exception occurs', async () => {
      const error = new Error('Test error')
      sandbox.stub(Models.Dao, 'findByAddress').rejects(error)
      sandbox.stub(logger, 'verbose')
      const errorStub = sandbox.stub(logger, 'error')
      await DaoTransactions.start({ daoAddress, network })
      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.firstCall.args[0]).to.equal('Error start DaoTransactions')
    })
  })

  describe('saveTransaction', () => {
    let findExistingLogStub: sinon.SinonStub
    let getTxReceiptStub: sinon.SinonStub
    let findLogsByNameStub: sinon.SinonStub
    let executeTxFnStub: sinon.SinonStub

    beforeEach(() => {
      findExistingLogStub = sandbox.stub(Models.Transaction, 'findExistingLog')
      getTxReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt')
      findLogsByNameStub = sandbox.stub(Web3Helper, 'findLogsByName')
      executeTxFnStub = sandbox.stub(DbTx, 'executeTxFn')
    })

    it('should return early if transaction already exists', async () => {
      findExistingLogStub.resolves({ id: 'txExisting' })
      const verboseStub = sandbox.stub(logger, 'verbose')
      const result = await DaoTransactions.saveTransaction(fakeTxLog as any, ITransactionType.deposit, fakeDao)
      expect(
        findExistingLogStub.calledOnceWith({
          transactionHash: fakeTxLog.hash,
          network,
          category: fakeTxLog.category,
          uniqueId: fakeTxLog.uniqueId,
        }),
      ).to.be.true
      expect(result).to.be.undefined
      expect(verboseStub.calledOnce).to.be.true
    })

    it('should build rawTx with proposal execution details when logs exist', async () => {
      findExistingLogStub.resolves(null)

      const fakeReceipt = { dummy: true }
      getTxReceiptStub.resolves(fakeReceipt)
      const executedLog = { txLog: { address: '0xDaoNew', topics: [] } }
      const proposalExecutedLog = { txLog: { address: '0xPluginAddress', topics: ['0x0', '42'] } }
      findLogsByNameStub.withArgs(fakeReceipt, 'Executed', DAO.abi).returns([executedLog])
      findLogsByNameStub.withArgs(fakeReceipt, 'ProposalExecuted', Multisig.abi).returns([proposalExecutedLog])
      executeTxFnStub.resolves({ id: 'txNew' })
      const result = await DaoTransactions.saveTransaction(fakeTxLog as any, ITransactionType.withdraw, fakeDao)
      expect(getTxReceiptStub.calledOnceWith(fakeTxLog.hash, network)).to.be.true
      expect(findLogsByNameStub.calledWith(fakeReceipt, 'Executed', DAO.abi)).to.be.true
      expect(findLogsByNameStub.calledWith(fakeReceipt, 'ProposalExecuted', Multisig.abi)).to.be.true
      expect(executeTxFnStub.calledOnce).to.be.true
      expect(result).to.have.property('id', 'txNew')
    })

    it('should build rawTx without proposal logs if receipt is not found', async () => {
      findExistingLogStub.resolves(null)
      getTxReceiptStub.resolves(null)
      executeTxFnStub.resolves({ id: 'txNoReceipt' })
      const result = await DaoTransactions.saveTransaction(fakeTxLog as any, ITransactionType.deposit, fakeDao)
      expect(getTxReceiptStub.calledOnceWith(fakeTxLog.hash, network)).to.be.true
      expect(executeTxFnStub.calledOnce).to.be.true
      expect(result).to.have.property('id', 'txNoReceipt')
    })

    it('should log error when exception occurs in saveTransaction', async () => {
      findExistingLogStub.rejects(new Error('DB error'))
      const errorStub = sandbox.stub(logger, 'error')
      const result = await DaoTransactions.saveTransaction(fakeTxLog as any, ITransactionType.deposit, fakeDao)
      expect(errorStub.calledOnce).to.be.true
      expect(result).to.be.undefined
    })
  })
})
