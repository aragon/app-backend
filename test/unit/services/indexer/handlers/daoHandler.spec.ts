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
import { ERC1155 } from '@artifacts/ERC1155'
import { UtilsIndexer } from '@models/utils/indexer'

describe('Indexer: DaoHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('callbackReceived', async () => {
    it('onERC721Received', async () => {
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
          sig: '0x150b7a02',
          data: '0x150b7a02000000000000000000000000b5c01cd910e308e4c5a7097b9c8389c91d141365000000000000000000000000b5c01cd910e308e4c5a7097b9c8389c91d141365b5c01cd910e308e4c5a7097b9c8389c91d14136500000000000000000000000100000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000000',
        },
      }

      const stubToken = sandbox.stub(UtilsIndexer, 'saveAndGetToken').resolves()
      const findTxHashSpy = sandbox.spy(Models.LogTransaction, 'findExistingLog')
      const stubLogger = sandbox.stub(logger, 'verbose')

      await DaoHandler.callbackReceived(fakeEvent as any, txLog, network)

      expect(findTxHashSpy.calledOnce).to.be.true
      expect(findTxHashSpy.calledWith(txLog.transactionHash, ITransactionType.deposit, 0)).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubToken.calledOnce).to.be.true

      const savedDaoLog = await Models.LogTransaction.findExistingLog(
        txLog.transactionHash,
        ITransactionType.deposit,
        0,
      )
      expect(!!savedDaoLog).to.be.true

      expect(savedDaoLog.entityId).to.exist
      expect(savedDaoLog.blockNumber).to.eq(txLog.blockNumber)
      expect(savedDaoLog.transactionHash).to.eq(txLog.transactionHash)
      expect(savedDaoLog.daoAddress).to.eq(txLog.address)
      expect(savedDaoLog.network).to.eq(network)
      expect(savedDaoLog.type).to.eq(ITransactionType.deposit)
      expect(savedDaoLog.from).to.eq('0xB5C01cd910e308e4C5a7097B9C8389C91D141365')
      expect(savedDaoLog.to).to.eq(txLog.address)
      expect(savedDaoLog.tokenAddress).to.eq(null)
      expect(savedDaoLog.tokenId).to.eq('82208059330993196336181417815592410937993393630923052590475471336860718989313')
      expect(savedDaoLog.reference).to.eq(null)
      expect(savedDaoLog.actionIndex).to.eq(0)
      expect(savedDaoLog.actor).to.eq(null)
      expect(savedDaoLog.pluginAddress).to.eq(null)
    })

    it('onERC1155Received', async () => {
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
          sig: '0xf23a6e61',
          data: '0xf23a6e61000000000000000000000000b2b7cc624f78e688273b68bb16e27e32a370b3fe00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000',
        },
      }
      const extraData = {
        events: [
          {
            txLog: {
              transactionHash: '0x3da24886630dd1d76e2a66b536aa09f25ae71bed582b2df51603424f30c4862a',
              address: '0xee06D1Eb614003f081F2A98F5e6a8135eBa99AF3',
            },
            parsed: {
              args: {
                operator: '0xb2b7CC624F78E688273b68Bb16e27e32a370b3FE',
                from: '0x0000000000000000000000000000000000000000',
                to: '0xB23875db90afEc3c42d83Eaee5F2a9a8a18698Dd',
                id: 3n,
                value: 1n,
              },
            },
          },
        ],
      }

      const stubToken = sandbox.stub(UtilsIndexer, 'saveAndGetToken').resolves()
      const stubExtraData = sandbox.stub(Web3Helper, 'getDataFromTxReceipt').resolves(extraData as any)
      const findTxHashSpy = sandbox.spy(Models.LogTransaction, 'findExistingLog')
      const stubLogger = sandbox.stub(logger, 'verbose')

      await DaoHandler.callbackReceived(fakeEvent as any, txLog, network)

      expect(findTxHashSpy.calledOnce).to.be.true
      expect(findTxHashSpy.calledWith(txLog.transactionHash, ITransactionType.deposit, 0)).to.be.true
      expect(stubToken.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(
        stubExtraData.calledOnceWith({
          txLog,
          eventName: 'TransferSingle',
          abi: ERC1155.abi,
          network,
        }),
      ).to.be.true

      const savedDaoLog = await Models.LogTransaction.findExistingLog(
        txLog.transactionHash,
        ITransactionType.deposit,
        0,
      )
      expect(!!savedDaoLog).to.be.true

      expect(savedDaoLog.entityId).to.exist
      expect(savedDaoLog.blockNumber).to.eq(txLog.blockNumber)
      expect(savedDaoLog.transactionHash).to.eq(txLog.transactionHash)
      expect(savedDaoLog.daoAddress).to.eq(txLog.address)
      expect(savedDaoLog.network).to.eq(network)
      expect(savedDaoLog.type).to.eq(ITransactionType.deposit)
      expect(savedDaoLog.from).to.eq(extraData.events[0].parsed.args.operator)
      expect(savedDaoLog.to).to.eq(extraData.events[0].parsed.args.to)
      expect(savedDaoLog.tokenAddress).to.eq(null)
      expect(savedDaoLog.tokenId).to.eq('3')
      expect(savedDaoLog.reference).to.eq(null)
      expect(savedDaoLog.actionIndex).to.eq(0)
      expect(savedDaoLog.actor).to.eq(null)
      expect(savedDaoLog.pluginAddress).to.eq(null)
    })

    it('onERC1155BatchReceived', async () => {
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
          sender: '0x412236c2BF34855a86Bf2D369dec8e536D0c47E8',
          sig: '0xbc197c81',
          data: '0xbc197c8100000000000000000000000042c9a3f034592c39028aea70a6e69fbc6ccf6c3100000000000000000000000042c9a3f034592c39028aea70a6e69fbc6ccf6c3100000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000001a00000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000',
        },
      }
      const extraData = {
        events: [
          {
            txLog: {
              transactionHash: '0x3da24886630dd1d76e2a66b536aa09f25ae71bed582b2df51603424f30c4862a',
              address: '0xee06D1Eb614003f081F2A98F5e6a8135eBa99AF3',
            },
            parsed: {
              args: {
                operator: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
                from: '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
                to: '0xB9E9f1280A579DE7C6ddC389F7BC18896255615D',
                ids: [1n, 2n, 3n],
                values: [1n, 1n, 1n],
              },
            },
          },
        ],
      }

      const stubToken = sandbox.stub(UtilsIndexer, 'saveAndGetToken').resolves()
      const stubExtraData = sandbox.stub(Web3Helper, 'getDataFromTxReceipt').resolves(extraData as any)
      const findTxHashSpy = sandbox.spy(Models.LogTransaction, 'findExistingLog')
      const stubLogger = sandbox.stub(logger, 'verbose')

      await DaoHandler.callbackReceived(fakeEvent as any, txLog, network)

      expect(findTxHashSpy.calledOnce).to.be.true
      expect(findTxHashSpy.calledWith(txLog.transactionHash, ITransactionType.deposit, 0)).to.be.true
      expect(stubToken.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(
        stubExtraData.calledOnceWith({
          txLog,
          eventName: 'TransferBatch',
          abi: ERC1155.abi,
          network,
        }),
      ).to.be.true

      const savedDaoLog = await Models.LogTransaction.findExistingLog(
        txLog.transactionHash,
        ITransactionType.deposit,
        0,
      )
      expect(!!savedDaoLog).to.be.true

      expect(savedDaoLog.entityId).to.exist
      expect(savedDaoLog.blockNumber).to.eq(txLog.blockNumber)
      expect(savedDaoLog.transactionHash).to.eq(txLog.transactionHash)
      expect(savedDaoLog.daoAddress).to.eq(txLog.address)
      expect(savedDaoLog.network).to.eq(network)
      expect(savedDaoLog.type).to.eq(ITransactionType.deposit)
      expect(savedDaoLog.from).to.eq(extraData.events[0].parsed.args.operator)
      expect(savedDaoLog.to).to.eq(extraData.events[0].parsed.args.to)
      expect(savedDaoLog.tokenAddress).to.eq(fakeEvent.args.sender)
      expect(savedDaoLog.tokenIds[0]).to.eq(extraData.events[0].parsed.args.ids[0].toString())
      expect(savedDaoLog.tokenIds[1]).to.eq(extraData.events[0].parsed.args.ids[1].toString())
      expect(savedDaoLog.tokenIds[2]).to.eq(extraData.events[0].parsed.args.ids[2].toString())
      expect(savedDaoLog.amounts[0]).to.eq(Number(extraData.events[0].parsed.args.values[0]))
      expect(savedDaoLog.amounts[1]).to.eq(Number(extraData.events[0].parsed.args.values[1]))
      expect(savedDaoLog.amounts[2]).to.eq(Number(extraData.events[0].parsed.args.values[2]))
      expect(savedDaoLog.reference).to.eq(null)
      expect(savedDaoLog.actionIndex).to.eq(0)
      expect(savedDaoLog.actor).to.eq(null)
      expect(savedDaoLog.pluginAddress).to.eq(null)
    })
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

      const stubToken = sandbox.stub(UtilsIndexer, 'saveAndGetToken').resolves()
      const findTxHashSpy = sandbox.spy(Models.LogTransaction, 'findExistingLog')
      const stubLogger = sandbox.stub(logger, 'verbose')

      await DaoHandler.deposited(fakeEvent as any, txLog, network)

      expect(findTxHashSpy.calledOnce).to.be.true
      expect(findTxHashSpy.calledWith(txLog.transactionHash, ITransactionType.deposit, 0)).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubToken.calledOnce).to.be.true

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
      expect(savedDaoLog.amount).to.eq(fakeEvent.args.amount.toString())
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

      const stubToken = sandbox.stub(UtilsIndexer, 'saveAndGetToken').resolves()
      const findTxHashSpy = sandbox.spy(Models.LogTransaction, 'findExistingLog')
      const stubLogger = sandbox.stub(logger, 'verbose')

      await DaoHandler.deposited(fakeEvent as any, txLog, network)

      expect(findTxHashSpy.calledOnce).to.be.true
      expect(findTxHashSpy.calledWith(txLog.transactionHash, ITransactionType.deposit, 0)).to.be.true
      expect(stubToken.calledOnce).to.be.true
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
      expect(savedDaoLog.amount).to.eq(fakeEvent.args.amount.toString())
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
    it('should executed ERC20', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const stubToken = sandbox.stub(UtilsIndexer, 'saveAndGetToken').resolves({
        decimals: 18,
      } as any)

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

      expect(stubToken.callCount).to.eq(4)
      expect(stubNativeToken.calledOnce).to.be.true
      expect(stubErc20Token.calledOnce).to.be.true
      expect(stubErc721Token.calledOnce).to.be.true
      expect(stubErc1155Token.calledOnce).to.be.true

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Unhandled action' as any)).to.be.true
    })

    it('should executed ERC721', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const stubToken = sandbox.stub(UtilsIndexer, 'saveAndGetToken').resolves({
        name: 'test',
      } as any)

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

      expect(stubToken.callCount).to.eq(4)
      expect(stubNativeToken.calledOnce).to.be.true
      expect(stubErc20Token.notCalled).to.be.true
      expect(stubErc721Token.calledTwice).to.be.true
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

      const stubToken = sandbox.stub(UtilsIndexer, 'saveAndGetToken').resolves()
      const findTxHashSpy = sandbox.spy(Models.LogTransaction, 'findExistingLog')
      const stubLogger = sandbox.stub(logger, 'verbose')

      await DaoHandler.nativeTokenDeposited(fakeEvent as any, txLog, network)

      expect(findTxHashSpy.calledOnce).to.be.true
      expect(findTxHashSpy.calledWith(txLog.transactionHash, ITransactionType.deposit, 0)).to.be.true
      expect(stubToken.calledOnce).to.be.true
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
      expect(savedDaoLog.amount).to.eq(fakeEvent.args.amount.toString())
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

  describe('newURI', () => {
    it('uri updated fails when no uri presented', async () => {
      const network = NetworksEnum.mainnet
      const stubLogger = sandbox.stub(logger, 'verbose')

      const event = {
        args: {
          daoURI: '',
        },
      }

      const findExistingLogStub = sandbox.spy(Models.LogDaoRegistry, 'findExistingLog')

      await DaoHandler.newURI(
        event as any,
        {
          transactionHash: '0x123',
          blockNumber: 1,
          address: '0x456',
        },
        network,
      )

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('newURI: no daoURI' as any)).to.be.true
      expect(findExistingLogStub.notCalled).to.be.true
    })

    it('should fails when dao not exists', async () => {
      const network = NetworksEnum.mainnet
      const stubLogger = sandbox.stub(logger, 'verbose')
      const event = {
        args: {
          daoURI: 'test',
        },
      }

      const findExistingLogStub = sandbox.stub(Models.LogDaoRegistry, 'findExistingLog').returns(false)
      const findByAddressStub = sandbox.stub(Models.LogDaoRegistry, 'findByAddress').returns(false)

      await DaoHandler.newURI(
        event as any,
        {
          transactionHash: '0x123',
          blockNumber: 1,
          address: '0x456',
        },
        network,
      )

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Dao not found' as any)).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(findByAddressStub.calledOnce).to.be.true
    })

    it('uri updated', async () => {
      const network = NetworksEnum.mainnet
      const stubLogger = sandbox.stub(logger, 'verbose')
      const event = {
        args: {
          daoURI: 'test',
        },
      }

      const addURIUpdatesStub = sandbox.stub()
      const findExistingLogStub = sandbox.stub(Models.LogDaoRegistry, 'findExistingLog').returns(false)
      const findByAddressStub = sandbox.stub(Models.LogDaoRegistry, 'findByAddress').returns({
        addURIUpdates: addURIUpdatesStub,
        address: '0x123',
      })

      await DaoHandler.newURI(
        event as any,
        {
          transactionHash: '0x123',
          blockNumber: 1,
          address: '0x456',
        },
        network,
      )

      expect(stubLogger.callCount).to.be.eq(1)
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(addURIUpdatesStub.calledOnce).to.be.true
      expect(findByAddressStub.calledOnce).to.be.true

      expect(addURIUpdatesStub.args[0][0]).to.be.deep.eq({
        blockNumber: 1,
        transactionHash: '0x123',
        uri: 'test',
      })
    })
  })
})
