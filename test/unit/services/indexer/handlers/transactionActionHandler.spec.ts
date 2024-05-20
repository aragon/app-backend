import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { ITransactionType, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { TransactionActionHandler } from '@services/indexer/handlers/transactionActionHandler'
import Web3Helper from '@helpers/web3'
import { Models } from '@dbModels'
import { Multisig } from '@artifacts/Multisig'

describe('Indexer: ProposalHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('nativeToken', () => {
    it('should handle nativeToken transaction', async () => {
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
          execResults: [1, 2, 3],
          actor: '0x456',
        },
      }
      const extraData = {
        events: [
          {
            txLog: {
              address: '0x0',
            },
            parsed: {
              args: {
                proposalId: 2n,
              },
            },
          },
        ],
      }
      const action = {
        to: '0x123',
        value: 4n,
      }
      const actionIndex = 0

      const stubExtraData = sandbox.stub(Web3Helper, 'getDataFromTxReceipt').resolves(extraData as any)
      const stubLogger = sandbox.stub(logger, 'verbose')

      await TransactionActionHandler.nativeToken(fakeEvent as any, txLog, network, action, actionIndex)

      const logTransactionDb = await Models.LogTransaction.findExistingLog(
        txLog.transactionHash,
        ITransactionType.withdraw,
        actionIndex,
      )

      expect(logTransactionDb.transactionHash).to.eq(txLog.transactionHash)
      expect(logTransactionDb.blockNumber).to.eq(txLog.blockNumber)
      expect(logTransactionDb.network).to.eq(network)
      expect(logTransactionDb.type).to.eq(ITransactionType.withdraw)
      expect(logTransactionDb.from).to.eq(txLog.address)
      expect(logTransactionDb.to).to.eq(action.to)
      expect(logTransactionDb.amount).to.eq(Number(action.value))
      expect(logTransactionDb.tokenAddress).to.be.null
      expect(logTransactionDb.tokenId).to.be.null
      expect(logTransactionDb.tokenIds.length).to.be.eq(0)
      expect(logTransactionDb.amounts.length).to.be.eq(0)
      expect(logTransactionDb.reference).to.be.eq('')
      expect(logTransactionDb.actionIndex).to.be.eq(actionIndex)
      expect(logTransactionDb.execResult).to.be.eq(fakeEvent.args.execResults[actionIndex].toString())
      expect(logTransactionDb.actor).to.be.eq(fakeEvent.args.actor)
      expect(logTransactionDb.pluginAddress).to.be.eq(extraData.events[0].txLog.address)
      expect(logTransactionDb.proposalId).to.be.eq(Number(extraData.events[0].parsed.args.proposalId))

      expect(stubLogger.calledOnce).to.be.true
      expect(
        stubExtraData.calledOnceWith({
          txLog,
          eventName: 'ProposalExecuted',
          abi: Multisig.abi,
          network,
        }),
      ).to.be.true
    })

    it('nativeToken throw error', async () => {
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
          execResults: [1, 2, 3],
          actor: '0x456',
        },
      }
      const extraData = {
        events: [
          {
            txLog: {
              address: '0x0',
            },
            parsed: {
              args: {
                proposalId: 2n,
              },
            },
          },
        ],
      }
      const action = {
        to: '0x123',
        value: 4n,
      }
      const actionIndex = 0

      sandbox.stub(Web3Helper, 'getDataFromTxReceipt').resolves(extraData as any)
      sandbox.stub(Models.LogTransaction, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await TransactionActionHandler.nativeToken(fakeEvent as any, txLog, network, action, actionIndex)

      expect(stubLogger.calledOnceWith('Error nativeToken' as any)).to.be.true
    })
  })

  describe('erc20Token', () => {
    it('should handle erc20Token transaction', async () => {
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
          execResults: [1, 2, 3],
          actor: '0x456',
        },
      }
      const extraData = {
        events: [
          {
            txLog: {
              address: '0x0',
            },
            parsed: {
              args: {
                proposalId: 2n,
              },
            },
          },
        ],
      }
      const action = {
        to: '0xaFa52E3860b4371ab9d8F08E801E9EA1027C0CA2',
        value: 0n,
        data: '0xa9059cbb000000000000000000000000606cdb0a39ef7ab2867a40ebaadee0f85bef1b4c0000000000000000000000000000000000000000000108b2a2c2802909400000',
      }
      const actionIndex = 0

      const stubExtraData = sandbox.stub(Web3Helper, 'getDataFromTxReceipt').resolves(extraData as any)
      const stubGetERC20TransferABI = sandbox.spy(Web3Helper, 'getERC20TransferABI')
      const stubDecodeCalldata = sandbox.spy(Web3Helper, 'decodeCalldata')
      const stubERC20TransferAction = sandbox.spy(Web3Helper, 'parseERC20TransferAction')
      const stubLogger = sandbox.stub(logger, 'verbose')

      await TransactionActionHandler.erc20Token(fakeEvent as any, txLog, network, action, actionIndex)

      const logTransactionDb = await Models.LogTransaction.findExistingLog(
        txLog.transactionHash,
        ITransactionType.withdraw,
        actionIndex,
      )

      expect(logTransactionDb.transactionHash).to.eq(txLog.transactionHash)
      expect(logTransactionDb.blockNumber).to.eq(txLog.blockNumber)
      expect(logTransactionDb.network).to.eq(network)
      expect(logTransactionDb.type).to.eq(ITransactionType.withdraw)
      expect(logTransactionDb.from).to.eq(txLog.address)
      expect(logTransactionDb.to).to.eq('0x606cDb0A39EF7AB2867a40EBAADee0F85bEF1B4C')
      expect(logTransactionDb.amount).to.eq(1.25e24)
      expect(logTransactionDb.tokenAddress).to.eq(action.to)
      expect(logTransactionDb.tokenId).to.be.null
      expect(logTransactionDb.tokenIds.length).to.be.eq(0)
      expect(logTransactionDb.amounts.length).to.be.eq(0)
      expect(logTransactionDb.reference).to.be.null
      expect(logTransactionDb.actionIndex).to.be.eq(actionIndex)
      expect(logTransactionDb.execResult).to.be.eq(fakeEvent.args.execResults[actionIndex].toString())
      expect(logTransactionDb.actor).to.be.eq(fakeEvent.args.actor)
      expect(logTransactionDb.pluginAddress).to.be.eq(extraData.events[0].txLog.address)
      expect(logTransactionDb.proposalId).to.be.eq(Number(extraData.events[0].parsed.args.proposalId))

      expect(stubLogger.calledOnce).to.be.true
      expect(
        stubExtraData.calledOnceWith({
          txLog,
          eventName: 'ProposalExecuted',
          abi: Multisig.abi,
          network,
        }),
      ).to.be.true
      expect(stubGetERC20TransferABI.calledOnceWith(action.data.substring(0, 10))).to.be.true
      expect(stubDecodeCalldata.calledOnce).to.be.true
      expect(stubDecodeCalldata.args[0][0]).to.exist
      expect(stubDecodeCalldata.args[0][1]).to.exist
      expect(stubERC20TransferAction.calledOnce).to.be.true
      expect(stubERC20TransferAction.args[0][0]).to.exist
      expect(stubERC20TransferAction.args[0][1]).to.exist
      expect(stubERC20TransferAction.args[0][2]).to.exist
    })

    it('erc20Token throw error', async () => {
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
          execResults: [1, 2, 3],
          actor: '0x456',
        },
      }
      const extraData = {
        events: [
          {
            txLog: {
              address: '0x0',
            },
            parsed: {
              args: {
                proposalId: 2n,
              },
            },
          },
        ],
      }
      const action = {
        to: '0xaFa52E3860b4371ab9d8F08E801E9EA1027C0CA2',
        value: 0n,
        data: '0xa9059cbb000000000000000000000000606cdb0a39ef7ab2867a40ebaadee0f85bef1b4c0000000000000000000000000000000000000000000108b2a2c2802909400000',
      }
      const actionIndex = 0

      sandbox.stub(Web3Helper, 'getDataFromTxReceipt').resolves(extraData as any)
      sandbox.stub(Models.LogTransaction, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await TransactionActionHandler.erc20Token(fakeEvent as any, txLog, network, action, actionIndex)

      expect(stubLogger.calledOnceWith('Error erc20Token' as any)).to.be.true
    })
  })

  describe('erc721Token', () => {
    it('should handle erc721Token transaction', async () => {
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
          execResults: [1, 2, 3],
          actor: '0x456',
        },
      }
      const extraData = {
        events: [
          {
            txLog: {
              address: '0x0',
            },
            parsed: {
              args: {
                proposalId: 2n,
              },
            },
          },
        ],
      }
      const action = {
        to: '0x3337dac9F251d4E403D6030E18e3cfB6a2cb1333',
        value: 0n,
        data: '0x23b872dd000000000000000000000000cbcbfb1f99a0565c5eccd0bd02e937feb40ef450000000000000000000000000d6494c5094f07d93b9a36f2cfd32562a744302d40000000000000000000000000000000000000000000000000000000000000120',
      }
      const actionIndex = 0

      const stubExtraData = sandbox.stub(Web3Helper, 'getDataFromTxReceipt').resolves(extraData as any)
      const stubSupportsERC721 = sandbox.stub(Web3Helper, 'supportsERC721').resolves(true)
      const stubGetERC20TransferABI = sandbox.spy(Web3Helper, 'getERC721TransferABI')
      const stubDecodeCalldata = sandbox.spy(Web3Helper, 'decodeCalldata')
      const stubParseERC721Action = sandbox.spy(Web3Helper, 'parseERC721Action')
      const stubLogger = sandbox.stub(logger, 'verbose')

      await TransactionActionHandler.erc721Token(fakeEvent as any, txLog, network, action, actionIndex)

      const logTransactionDb = await Models.LogTransaction.findExistingLog(
        txLog.transactionHash,
        ITransactionType.externalTransfer,
        actionIndex,
      )

      expect(logTransactionDb.transactionHash).to.eq(txLog.transactionHash)
      expect(logTransactionDb.blockNumber).to.eq(txLog.blockNumber)
      expect(logTransactionDb.network).to.eq(network)
      expect(logTransactionDb.type).to.eq(ITransactionType.externalTransfer)
      expect(logTransactionDb.from).to.eq('0xcbCbfb1f99a0565c5EcCd0BD02E937FeB40ef450')
      expect(logTransactionDb.to).to.eq('0xD6494C5094F07d93b9A36F2cfd32562a744302d4')
      expect(logTransactionDb.amount).to.eq(0)
      expect(logTransactionDb.tokenAddress).to.eq(action.to)
      expect(logTransactionDb.tokenId).to.eq('288')
      expect(logTransactionDb.tokenIds.length).to.be.eq(0)
      expect(logTransactionDb.amounts.length).to.be.eq(0)
      expect(logTransactionDb.reference).to.be.null
      expect(logTransactionDb.actionIndex).to.be.eq(actionIndex)
      expect(logTransactionDb.execResult).to.be.eq(fakeEvent.args.execResults[actionIndex].toString())
      expect(logTransactionDb.actor).to.be.eq(fakeEvent.args.actor)
      expect(logTransactionDb.pluginAddress).to.be.eq(extraData.events[0].txLog.address)
      expect(logTransactionDb.proposalId).to.be.eq(Number(extraData.events[0].parsed.args.proposalId))

      expect(stubSupportsERC721.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(
        stubExtraData.calledOnceWith({
          txLog,
          eventName: 'ProposalExecuted',
          abi: Multisig.abi,
          network,
        }),
      ).to.be.true
      expect(stubGetERC20TransferABI.calledOnceWith(action.data.substring(0, 10))).to.be.true
      expect(stubDecodeCalldata.calledOnce).to.be.true
      expect(stubDecodeCalldata.args[0][0]).to.exist
      expect(stubDecodeCalldata.args[0][1]).to.exist
      expect(stubParseERC721Action.calledOnce).to.be.true
      expect(stubParseERC721Action.args[0]).to.exist
    })

    it('erc721Token throw error', async () => {
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
          execResults: [1, 2, 3],
          actor: '0x456',
        },
      }
      const action = {
        to: '0x3337dac9F251d4E403D6030E18e3cfB6a2cb1333',
        value: 0n,
        data: '0x23b872dd000000000000000000000000cbcbfb1f99a0565c5eccd0bd02e937feb40ef450000000000000000000000000d6494c5094f07d93b9a36f2cfd32562a744302d40000000000000000000000000000000000000000000000000000000000000120',
      }
      const actionIndex = 0

      sandbox.stub(Web3Helper, 'getDataFromTxReceipt').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await TransactionActionHandler.erc721Token(fakeEvent as any, txLog, network, action, actionIndex)

      expect(stubLogger.calledOnceWith('Error erc721Token' as any)).to.be.true
    })
  })

  describe('erc1155Token', () => {
    it('should handle erc1155Token transaction ERC1155_safeTransferFrom', async () => {
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
          execResults: [1, 2, 3],
          actor: '0x456',
        },
      }
      const extraData = {
        events: [
          {
            txLog: {
              address: '0x0',
            },
            parsed: {
              args: {
                proposalId: 2n,
              },
            },
          },
        ],
      }
      const action = {
        to: '0x412236c2BF34855a86Bf2D369dec8e536D0c47E8',
        value: 0n,
        data: '0xf242432a000000000000000000000000b9e9f1280a579de7c6ddc389f7bc18896255615d00000000000000000000000042c9a3f034592c39028aea70a6e69fbc6ccf6c310000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000',
      }
      const actionIndex = 0

      const stubExtraData = sandbox.stub(Web3Helper, 'getDataFromTxReceipt').resolves(extraData as any)
      const stubSupportsERC1155 = sandbox.stub(Web3Helper, 'supportsERC1155').resolves(true)
      const stubGetERC1155TransferABI = sandbox.spy(Web3Helper, 'getERC1155TransferABI')
      const stubDecodeCalldata = sandbox.spy(Web3Helper, 'decodeCalldata')
      const stubParseERC1155Action = sandbox.spy(Web3Helper, 'parseERC1155Action')
      const stubLogger = sandbox.stub(logger, 'verbose')

      await TransactionActionHandler.erc1155Token(fakeEvent as any, txLog, network, action, actionIndex)

      const logTransactionDb = await Models.LogTransaction.findExistingLog(
        txLog.transactionHash,
        ITransactionType.externalTransfer,
        actionIndex,
      )

      expect(logTransactionDb.transactionHash).to.eq(txLog.transactionHash)
      expect(logTransactionDb.blockNumber).to.eq(txLog.blockNumber)
      expect(logTransactionDb.network).to.eq(network)
      expect(logTransactionDb.type).to.eq(ITransactionType.externalTransfer)
      expect(logTransactionDb.from).to.eq('0xB9E9f1280A579DE7C6ddC389F7BC18896255615D')
      expect(logTransactionDb.to).to.eq('0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31')
      expect(logTransactionDb.amount).to.eq(1)
      expect(logTransactionDb.tokenAddress).to.eq(action.to)
      expect(logTransactionDb.tokenId).to.eq('1')
      expect(logTransactionDb.tokenIds.length).to.be.eq(0)
      expect(logTransactionDb.amounts.length).to.be.eq(0)
      expect(logTransactionDb.reference).to.be.null
      expect(logTransactionDb.actionIndex).to.be.eq(actionIndex)
      expect(logTransactionDb.execResult).to.be.eq(fakeEvent.args.execResults[actionIndex].toString())
      expect(logTransactionDb.actor).to.be.eq(fakeEvent.args.actor)
      expect(logTransactionDb.pluginAddress).to.be.eq(extraData.events[0].txLog.address)
      expect(logTransactionDb.proposalId).to.be.eq(Number(extraData.events[0].parsed.args.proposalId))

      expect(stubSupportsERC1155.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(
        stubExtraData.calledOnceWith({
          txLog,
          eventName: 'ProposalExecuted',
          abi: Multisig.abi,
          network,
        }),
      ).to.be.true
      expect(stubGetERC1155TransferABI.calledOnceWith(action.data.substring(0, 10))).to.be.true
      expect(stubDecodeCalldata.calledOnce).to.be.true
      expect(stubDecodeCalldata.args[0][0]).to.exist
      expect(stubDecodeCalldata.args[0][1]).to.exist
      expect(stubParseERC1155Action.calledOnce).to.be.true
      expect(stubParseERC1155Action.args[0]).to.exist
    })

    it('should handle erc1155Token transaction ERC1155_safeBatchTransferFrom', async () => {
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
          execResults: [1, 2, 3],
          actor: '0x456',
        },
      }
      const extraData = {
        events: [
          {
            txLog: {
              address: '0x0',
            },
            parsed: {
              args: {
                proposalId: 2n,
              },
            },
          },
        ],
      }
      const action = {
        to: '0x412236c2BF34855a86Bf2D369dec8e536D0c47E8',
        value: 0n,
        data: '0x2eb2c2d6000000000000000000000000b9e9f1280a579de7c6ddc389f7bc18896255615d000000000000000000000000ef32dc2b02bfa082f11aa6f57154f4079ffe9bbc00000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000',
      }
      const actionIndex = 0

      const stubExtraData = sandbox.stub(Web3Helper, 'getDataFromTxReceipt').resolves(extraData as any)
      const stubSupportsERC1155 = sandbox.stub(Web3Helper, 'supportsERC1155').resolves(true)
      const stubGetERC1155TransferABI = sandbox.spy(Web3Helper, 'getERC1155TransferABI')
      const stubDecodeCalldata = sandbox.spy(Web3Helper, 'decodeCalldata')
      const stubParseERC1155BatchAction = sandbox.spy(Web3Helper, 'parseERC1155BatchAction')
      const stubLogger = sandbox.stub(logger, 'verbose')

      await TransactionActionHandler.erc1155Token(fakeEvent as any, txLog, network, action, actionIndex)

      const logTransactionDb = await Models.LogTransaction.findExistingLog(
        txLog.transactionHash,
        ITransactionType.externalTransfer,
        actionIndex,
      )

      expect(logTransactionDb.transactionHash).to.eq(txLog.transactionHash)
      expect(logTransactionDb.blockNumber).to.eq(txLog.blockNumber)
      expect(logTransactionDb.network).to.eq(network)
      expect(logTransactionDb.type).to.eq(ITransactionType.externalTransfer)
      expect(logTransactionDb.from).to.eq('0xB9E9f1280A579DE7C6ddC389F7BC18896255615D')
      expect(logTransactionDb.to).to.eq('0xeF32DC2B02bFA082F11aa6f57154f4079FFE9Bbc')
      expect(logTransactionDb.amount).to.eq(0)
      expect(logTransactionDb.tokenAddress).to.eq(action.to)
      expect(logTransactionDb.tokenId).to.be.null
      expect(logTransactionDb.tokenIds[0]).to.be.eq('2')
      expect(logTransactionDb.tokenIds[1]).to.be.eq('3')
      expect(logTransactionDb.amounts[0]).to.be.eq('1')
      expect(logTransactionDb.amounts[1]).to.be.eq('1')
      expect(logTransactionDb.reference).to.be.null
      expect(logTransactionDb.actionIndex).to.be.eq(actionIndex)
      expect(logTransactionDb.execResult).to.be.eq(fakeEvent.args.execResults[actionIndex].toString())
      expect(logTransactionDb.actor).to.be.eq(fakeEvent.args.actor)
      expect(logTransactionDb.pluginAddress).to.be.eq(extraData.events[0].txLog.address)
      expect(logTransactionDb.proposalId).to.be.eq(Number(extraData.events[0].parsed.args.proposalId))

      expect(stubSupportsERC1155.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(
        stubExtraData.calledOnceWith({
          txLog,
          eventName: 'ProposalExecuted',
          abi: Multisig.abi,
          network,
        }),
      ).to.be.true
      expect(stubGetERC1155TransferABI.calledOnceWith(action.data.substring(0, 10))).to.be.true
      expect(stubDecodeCalldata.calledOnce).to.be.true
      expect(stubDecodeCalldata.args[0][0]).to.exist
      expect(stubDecodeCalldata.args[0][1]).to.exist
      expect(stubParseERC1155BatchAction.calledOnce).to.be.true
      expect(stubParseERC1155BatchAction.args[0]).to.exist
    })

    it('erc1155Token throw error', async () => {
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
          execResults: [1, 2, 3],
          actor: '0x456',
        },
      }
      const action = {
        to: '0x3337dac9F251d4E403D6030E18e3cfB6a2cb1333',
        value: 0n,
        data: '0x23b872dd000000000000000000000000cbcbfb1f99a0565c5eccd0bd02e937feb40ef450000000000000000000000000d6494c5094f07d93b9a36f2cfd32562a744302d40000000000000000000000000000000000000000000000000000000000000120',
      }
      const actionIndex = 0

      sandbox.stub(Web3Helper, 'getDataFromTxReceipt').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await TransactionActionHandler.erc1155Token(fakeEvent as any, txLog, network, action, actionIndex)

      expect(stubLogger.calledOnceWith('Error erc1155Token' as any)).to.be.true
    })
  })
})
