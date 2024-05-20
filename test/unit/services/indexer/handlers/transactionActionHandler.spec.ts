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
})
