import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { ITransactionType, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { DaoHandler } from '@services/indexer/handlers/daoHandler'
import { Models } from '@dbModels'
import { TransactionActionHandler } from '@services/indexer/handlers/transactionActionHandler'
import Web3Helper from '@helpers/web3'

describe('Indexer: DaoHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('callbackReceived', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.callbackReceived(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  describe('deposited', () => {
    it('should deposit native token', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      const findTxHashSpy = sandbox.spy(Models.LogTransaction, 'findExistingLog')
      const stubLogger = sandbox.stub(logger, 'verbose')

      await DaoHandler.deposited(fakeEvent as any, txLog, network)

      expect(findTxHashSpy.calledOnce).to.be.true
      expect(findTxHashSpy.calledWith(txLog.transactionHash, ITransactionType.deposit, 0)).to.be.true
      expect(stubLogger.calledOnce).to.be.true

      const savedDaoLog = await Models.LogTransaction.findExistingLog(
        txLog.transactionHash,
        ITransactionType.deposit,
        0,
      )
      expect(!!savedDaoLog).to.be.true

      expect(savedDaoLog.entityId).to.exist
      expect(savedDaoLog.blockNumber).to.eq(txLog.blockNumber)
      expect(savedDaoLog.transactionHash).to.eq(txLog.transactionHash)
      expect(savedDaoLog.network).to.eq(network)
      expect(savedDaoLog.type).to.eq(ITransactionType.deposit)
      expect(savedDaoLog.from).to.eq(fakeEvent.args.sender)
      expect(savedDaoLog.to).to.eq(txLog.address)
      expect(savedDaoLog.amount).to.eq(Number(fakeEvent.args.amount))
      expect(savedDaoLog.tokenAddress).to.eq(null)
      expect(savedDaoLog.tokenId).to.eq(null)
      expect(savedDaoLog.reference).to.eq(fakeEvent.args._reference)
      expect(savedDaoLog.actionIndex).to.eq(0)
    })

    it('should deposit erc20 token', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 0n,
          token: '0x0',
        },
      }

      const findTxHashSpy = sandbox.spy(Models.LogTransaction, 'findExistingLog')
      const stubLogger = sandbox.stub(logger, 'verbose')

      await DaoHandler.deposited(fakeEvent as any, txLog, network)

      expect(findTxHashSpy.calledOnce).to.be.true
      expect(findTxHashSpy.calledWith(txLog.transactionHash, ITransactionType.deposit, 0)).to.be.true
      expect(stubLogger.calledOnce).to.be.true

      const savedDaoLog = await Models.LogTransaction.findExistingLog(
        txLog.transactionHash,
        ITransactionType.deposit,
        0,
      )
      expect(!!savedDaoLog).to.be.true

      expect(savedDaoLog.entityId).to.exist
      expect(savedDaoLog.blockNumber).to.eq(txLog.blockNumber)
      expect(savedDaoLog.transactionHash).to.eq(txLog.transactionHash)
      expect(savedDaoLog.network).to.eq(network)
      expect(savedDaoLog.type).to.eq(ITransactionType.deposit)
      expect(savedDaoLog.from).to.eq(fakeEvent.args.sender)
      expect(savedDaoLog.to).to.eq(txLog.address)
      expect(savedDaoLog.amount).to.eq(Number(fakeEvent.args.amount))
      expect(savedDaoLog.tokenAddress).to.eq(fakeEvent.args.token)
      expect(savedDaoLog.tokenId).to.eq(null)
      expect(savedDaoLog.reference).to.eq(null)
      expect(savedDaoLog.actionIndex).to.eq(0)
    })

    it('deposit throw error', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.LogTransaction, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await DaoHandler.deposited(fakeEvent as any, txLog, network)

      expect(stubLogger.calledOnceWith('Error Deposit' as any)).to.be.true
    })
  })

  describe('executed', () => {
    it('should executed', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const stubNativeToken = sandbox.stub(TransactionActionHandler, 'nativeToken').resolves()
      const stubErc20Token = sandbox.stub(TransactionActionHandler, 'erc20Token').resolves()
      const stubErc721Token = sandbox.stub(TransactionActionHandler, 'erc721Token').resolves()
      const stubErc1155Token = sandbox.stub(TransactionActionHandler, 'erc1155Token').resolves()
      const stubLogger = sandbox.stub(logger, 'error')

      const fakeEvent = {
        args: {
          actions: [
            // Unhandled action
            {
              to: '0x0673c13D48023efA609C20E5E351763B99Dd67DE',
              value: 0n,
              data: '0x3628731c',
            },
            // isNativeTokenAction
            {
              to: '0x2A46F8ed516dCDe829ed858A19d00A6D6CEDB28f',
              value: 20456890399769501n,
              data: '0x',
            },
            // isERC20Transfer
            {
              to: '0xaFa52E3860b4371ab9d8F08E801E9EA1027C0CA2',
              value: 0n,
              data: '0xa9059cbb',
            },
            // isERC721Transfer
            {
              to: '0x3337dac9F251d4E403D6030E18e3cfB6a2cb1333',
              value: 0n,
              data: '0xb88d4fde',
            },
            // isERC1155TransferMethod
            {
              to: '0x3337dac9F251d4E403D6030E18e3cfB6a2cb1333',
              value: 0n,
              data: '0x2eb2c2d6',
            },
          ],
        },
      }

      await DaoHandler.executed(fakeEvent as any, txLog, network)

      expect(stubNativeToken.calledOnce).to.be.true
      expect(stubErc20Token.calledOnce).to.be.true
      expect(stubErc721Token.calledOnce).to.be.true
      expect(stubErc1155Token.calledOnce).to.be.true

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Unhandled action' as any)).to.be.true
    })

    it('executed throw error', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          actions: [
            {
              to: '0x0673c13D48023efA609C20E5E351763B99Dd67DE',
              value: 0n,
              data: '0x3628731c',
            },
          ],
        },
      }

      sandbox.stub(Web3Helper, 'isNativeTokenAction').throws(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await DaoHandler.executed(fakeEvent as any, txLog, network)

      expect(stubLogger.calledOnceWith('Error handling action' as any)).to.be.true
    })
  })

  describe('nativeTokenDeposited', () => {
    it('should nativeTokenDeposited', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      const findTxHashSpy = sandbox.spy(Models.LogTransaction, 'findExistingLog')
      const stubLogger = sandbox.stub(logger, 'verbose')

      await DaoHandler.nativeTokenDeposited(fakeEvent as any, txLog, network)

      expect(findTxHashSpy.calledOnce).to.be.true
      expect(findTxHashSpy.calledWith(txLog.transactionHash, ITransactionType.deposit, 0)).to.be.true
      expect(stubLogger.calledOnce).to.be.true

      const savedDaoLog = await Models.LogTransaction.findExistingLog(
        txLog.transactionHash,
        ITransactionType.deposit,
        0,
      )
      expect(!!savedDaoLog).to.be.true

      expect(savedDaoLog.entityId).to.exist
      expect(savedDaoLog.blockNumber).to.eq(txLog.blockNumber)
      expect(savedDaoLog.transactionHash).to.eq(txLog.transactionHash)
      expect(savedDaoLog.network).to.eq(network)
      expect(savedDaoLog.type).to.eq(ITransactionType.deposit)
      expect(savedDaoLog.from).to.eq(fakeEvent.args.sender)
      expect(savedDaoLog.to).to.eq(txLog.address)
      expect(savedDaoLog.amount).to.eq(Number(fakeEvent.args.amount))
      expect(savedDaoLog.tokenAddress).to.eq(null)
      expect(savedDaoLog.tokenId).to.eq(null)
      expect(savedDaoLog.reference).to.eq(null)
      expect(savedDaoLog.actionIndex).to.eq(0)
    })

    it('nativeTokenDeposited throw error', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.LogTransaction, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await DaoHandler.nativeTokenDeposited(fakeEvent as any, txLog, network)

      expect(stubLogger.calledOnceWith('Error NativeToken Deposit' as any)).to.be.true
    })
  })

  it('newURI', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.newURI(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })
})
