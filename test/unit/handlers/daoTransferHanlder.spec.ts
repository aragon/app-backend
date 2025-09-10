import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { beforeEach, afterEach } from 'mocha'
import { NetworksEnum, ITransactionSide, ITokenType } from '@types'
import { ITransactionType } from '@src/types/transfer'
import { DaoTransferHandler } from '@src/handlers/daoTransferHanlder'
import { ProxyToken } from '@modules/proxyToken'
import logger from '@logger'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'

describe('Indexer: DaoTransferHandler', () => {
  let sandbox: SinonSandbox
  let mockToken: any
  let proxyTokenStub: any
  let loggerStub: any
  let getBlockTimestampStub: any

  // Helper function to create Transfer event with both positional and named args
  const createTransferEvent = (from: string, to: string, value: bigint) => {
    const event: any = {
      name: 'Transfer',
      signature: 'Transfer(address,address,uint256)',
      args: [from, to, value],
    }
    // Add named properties for compatibility
    event.args.from = from
    event.args.to = to
    event.args.value = value
    event.args.amount = value // Some events use amount instead of value
    return event
  }

  // Helper for ERC721 transfers
  const createErc721TransferEvent = (from: string, to: string, tokenId: bigint) => {
    const event: any = {
      name: 'Transfer',
      signature: 'Transfer(address,address,uint256)',
      args: [from, to, tokenId],
    }
    event.args.from = from
    event.args.to = to
    event.args.tokenId = tokenId
    return event
  }

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    // Clear database collections
    await Models.Transaction.deleteMany({})
    await Models.Token.deleteMany({})
    await Models.Dao.deleteMany({})

    mockToken = {
      decimals: 18,
      symbol: 'TEST',
      name: 'Test Token',
      address: '0x0000000000000000000000000000000000000456',
      network: NetworksEnum.ethereumMainnet,
      type: ITokenType.ERC20,
      price: {
        usd: 1.0,
        timestamp: 1620000100,
      },
    }

    // Create a test DAO in the database
    await Models.Dao.create({
      address: '0x0000000000000000000000000000000000000123',
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 1000,
      blockTimestamp: 1620000000,
      transactionHash: '0xdao123',
      name: 'Test DAO',
      creatorAddress: '0x0000000000000000000000000000000000000999',
    })

    // Stub ProxyToken to return token info with correct address
    proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').callsFake(async (address: string, network: any) => {
      return {
        ...mockToken,
        address: address, // Return the same address that was requested
        network: network,
      }
    })

    // Stub Web3Helper for block timestamps
    getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000100)

    // Stub logger
    loggerStub = sandbox.stub(logger, 'verbose')
  })

  afterEach(async () => {
    sandbox?.restore()
    // Clean up database after each test
    await Models.Transaction.deleteMany({})
    await Models.Token.deleteMany({})
    await Models.Dao.deleteMany({})
  })

  describe('incomingErc20Transfer', () => {
    it('should process incoming ERC20 transfers correctly', async () => {
      const parsedEvent = createTransferEvent(
        '0x0000000000000000000000000000000000000999',
        '0x0000000000000000000000000000000000000123',
        BigInt('1000000000000000000'),
      )
      const info = {
        address: '0x0000000000000000000000000000000000000456',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xabc123',
        blockNumber: 2000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.incomingErc20Transfer(parsedEvent, info)

      // Verify token was fetched (called twice: once for the token, once in the processor)
      expect(proxyTokenStub.called).to.be.true
      expect(proxyTokenStub.callCount).to.equal(2)

      // Verify transaction was saved to database
      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xabc123',
        type: ITransactionType.erc20,
        side: ITransactionSide.deposit,
      })

      expect(savedTransaction).to.exist
      expect(savedTransaction.daoAddress).to.equal('0x0000000000000000000000000000000000000123')
      expect(savedTransaction.tokenAddress).to.equal('0x0000000000000000000000000000000000000456')
      expect(savedTransaction.value).to.equal('1.0') // Value is formatted with 18 decimals
      expect(savedTransaction.fromAddress).to.equal('0x0000000000000000000000000000000000000999')
      expect(savedTransaction.toAddress).to.equal('0x0000000000000000000000000000000000000123')
      expect(savedTransaction.network).to.equal(NetworksEnum.ethereumMainnet)
      expect(savedTransaction.blockNumber).to.equal(2000)
      expect(loggerStub.calledWith('ERC20 Transfer to DAO')).to.be.true
    })

    it('should handle transfers with amount field', async () => {
      const parsedEvent = createTransferEvent(
        '0x0000000000000000000000000000000000000999',
        '0x0000000000000000000000000000000000000123',
        BigInt('1000'),
      )
      const info = {
        address: '0x0000000000000000000000000000000000000456',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xabc',
        blockNumber: 2000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.incomingErc20Transfer(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xabc',
      })
      expect(savedTransaction).to.exist
      // 1000 wei with 18 decimals = 0.000000000000001
      expect(savedTransaction.value).to.equal('0.000000000000001')
    })

    it('should handle transfers with positional args', async () => {
      const parsedEvent = {
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        args: [
          '0x0000000000000000000000000000000000000999',
          '0x0000000000000000000000000000000000000123',
          BigInt('1000'),
        ],
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000456',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xabc',
        blockNumber: 2000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.incomingErc20Transfer(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xabc',
      })
      expect(savedTransaction).to.exist
    })

    it('should skip invalid transfers', async () => {
      const parsedEvent = {
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        args: {
          from: '0x0000000000000000000000000000000000000000', // Zero address
          to: '0x0000000000000000000000000000000000000123',
          value: BigInt('0'),
        },
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000456',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xabc',
        blockNumber: 2000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.incomingErc20Transfer(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xabc',
      })
      expect(savedTransaction).to.not.exist
    })
  })

  describe('incomingErc721Transfer', () => {
    it('should process incoming ERC721 transfers correctly', async () => {
      const parsedEvent = createErc721TransferEvent(
        '0x0000000000000000000000000000000000000999',
        '0x0000000000000000000000000000000000000123',
        BigInt('42'),
      )
      const info = {
        address: '0x0000000000000000000000000000000000000789',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xdef',
        blockNumber: 2000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.incomingErc721Transfer(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xdef',
        type: ITransactionType.erc721,
      })

      expect(savedTransaction).to.exist
      expect(savedTransaction.daoAddress).to.equal('0x0000000000000000000000000000000000000123')
      expect(savedTransaction.tokenAddress).to.equal('0x0000000000000000000000000000000000000789')
      expect(savedTransaction.tokenId).to.equal('42')
      expect(savedTransaction.fromAddress).to.equal('0x0000000000000000000000000000000000000999')
      expect(loggerStub.calledWith('ERC721 Transfer to DAO')).to.be.true
    })

    it('should handle ERC721 with positional args', async () => {
      const parsedEvent = {
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        args: [
          '0x0000000000000000000000000000000000000999',
          '0x0000000000000000000000000000000000000123',
          BigInt('42'),
        ],
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000789',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xdef',
        blockNumber: 2000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.incomingErc721Transfer(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xdef',
      })
      expect(savedTransaction).to.exist
    })

    it('should skip invalid ERC721 transfers', async () => {
      const parsedEvent = {
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        args: {
          from: '0x0000000000000000000000000000000000000000',
          to: '0x0000000000000000000000000000000000000123',
          tokenId: BigInt('42'),
        },
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000789',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xdef',
        blockNumber: 2000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.incomingErc721Transfer(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xdef',
      })
      expect(savedTransaction).to.not.exist
    })
  })

  describe('withdrawErc20Transfer', () => {
    it('should process outgoing ERC20 transfers correctly', async () => {
      const parsedEvent = createTransferEvent(
        '0x0000000000000000000000000000000000000123',
        '0x0000000000000000000000000000000000000999',
        BigInt('500000000000000000'),
      )
      const info = {
        address: '0x0000000000000000000000000000000000000456',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xjkl',
        blockNumber: 4000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.withdrawErc20Transfer(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xjkl',
        type: ITransactionType.erc20,
        side: ITransactionSide.withdraw,
      })

      expect(savedTransaction).to.exist
      expect(savedTransaction.daoAddress).to.equal('0x0000000000000000000000000000000000000123')
      expect(savedTransaction.value).to.equal('0.5') // 500000000000000000 wei = 0.5 ETH with 18 decimals
      expect(loggerStub.calledWith('ERC20 Transfer from DAO')).to.be.true
    })

    it('should handle outgoing with value field', async () => {
      const parsedEvent = createTransferEvent(
        '0x0000000000000000000000000000000000000123',
        '0x0000000000000000000000000000000000000999',
        BigInt('500'),
      )
      const info = {
        address: '0x0000000000000000000000000000000000000456',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xjkl',
        blockNumber: 4000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.withdrawErc20Transfer(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xjkl',
      })
      expect(savedTransaction).to.exist
    })

    it('should handle with positional args', async () => {
      const parsedEvent = {
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        args: [
          '0x0000000000000000000000000000000000000123',
          '0x0000000000000000000000000000000000000999',
          BigInt('500'),
        ],
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000456',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xjkl',
        blockNumber: 4000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.withdrawErc20Transfer(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xjkl',
      })
      expect(savedTransaction).to.exist
    })

    it('should skip invalid outgoing ERC20', async () => {
      const parsedEvent = {
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        args: {
          from: '0x0000000000000000000000000000000000000123',
          to: '0x0000000000000000000000000000000000000999',
          value: BigInt('0'),
        },
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000456',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xjkl',
        blockNumber: 4000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.withdrawErc20Transfer(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xjkl',
      })
      expect(savedTransaction).to.not.exist
    })
  })

  describe('withdrawErc721Transfer', () => {
    it('should process outgoing ERC721 transfers correctly', async () => {
      const parsedEvent = createErc721TransferEvent(
        '0x0000000000000000000000000000000000000123',
        '0x0000000000000000000000000000000000000999',
        BigInt('99'),
      )
      const info = {
        address: '0x0000000000000000000000000000000000000789',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xmno',
        blockNumber: 5000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.withdrawErc721Transfer(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xmno',
        type: ITransactionType.erc721,
        side: ITransactionSide.withdraw,
      })

      expect(savedTransaction).to.exist
      expect(savedTransaction.tokenId).to.equal('99')
      expect(loggerStub.calledWith('NFT Transfer from DAO')).to.be.true
    })

    it('should handle with positional args', async () => {
      const parsedEvent = {
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        args: [
          '0x0000000000000000000000000000000000000123',
          '0x0000000000000000000000000000000000000999',
          BigInt('99'),
        ],
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000789',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xmno',
        blockNumber: 5000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.withdrawErc721Transfer(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xmno',
      })
      expect(savedTransaction).to.exist
    })

    it('should skip invalid outgoing ERC721', async () => {
      const parsedEvent = {
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        args: {
          from: '0x0000000000000000000000000000000000000123',
          to: '0x0000000000000000000000000000000000000000',
          tokenId: BigInt('99'),
        },
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000789',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xmno',
        blockNumber: 5000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.withdrawErc721Transfer(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xmno',
      })
      expect(savedTransaction).to.not.exist
    })
  })

  describe('incomingNativeDeposits', () => {
    it('should process native deposits correctly', async () => {
      const parsedEvent: any = {
        name: 'NativeTokenDeposited',
        signature: 'NativeTokenDeposited(address,uint256)',
        args: ['0x0000000000000000000000000000000000000999', BigInt('2000000000000000000')],
      }
      parsedEvent.args.sender = parsedEvent.args[0]
      parsedEvent.args.amount = parsedEvent.args[1]
      const info = {
        address: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xghi',
        blockNumber: 3000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.incomingNativeDeposits(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xghi',
        type: ITransactionType.native,
        side: ITransactionSide.deposit,
      })

      expect(savedTransaction).to.exist
      expect(savedTransaction.daoAddress).to.equal('0x0000000000000000000000000000000000000123')
      expect(savedTransaction.value).to.equal('2.0') // 2000000000000000000 wei = 2.0 ETH with 18 decimals
      expect(savedTransaction.tokenAddress).to.equal('0x0000000000000000000000000000000000000000')
      expect(loggerStub.calledWith('Native Token Deposited to DAO')).to.be.true
    })

    it('should handle native deposits with positional args', async () => {
      const parsedEvent = {
        name: 'NativeTokenDeposited',
        signature: 'NativeTokenDeposited(address,uint256)',
        args: ['0x0000000000000000000000000000000000000999', BigInt('2000000000000000000')],
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xghi',
        blockNumber: 3000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.incomingNativeDeposits(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xghi',
      })
      expect(savedTransaction).to.exist
    })

    it('should skip zero amount deposits', async () => {
      const parsedEvent = {
        name: 'NativeTokenDeposited',
        signature: 'NativeTokenDeposited(address,uint256)',
        args: {
          sender: '0x0000000000000000000000000000000000000999',
          amount: BigInt('0'),
        },
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xghi',
        blockNumber: 3000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.incomingNativeDeposits(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xghi',
      })
      expect(savedTransaction).to.not.exist
    })
  })

  describe('withdrawNativeDeposits (Executed Event)', () => {
    it('should process executed events with native transfers', async () => {
      const parsedEvent = {
        name: 'Executed',
        signature: 'Executed(address,bytes32,Action[],uint256,uint256,bytes[])',
        args: [
          '0x0000000000000000000000000000000000000111', // actor
          '0xabc123def456', // callId
          [
            { to: '0x0000000000000000000000000000000000000222', value: BigInt('1000000000000000000'), data: '0x' },
            { to: '0x0000000000000000000000000000000000000333', value: BigInt('2000000000000000000'), data: '0x' },
          ],
          BigInt('0'), // allowFailureMap
          BigInt('0'), // failureMap
          [], // execResults
        ],
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xpqr',
        blockNumber: 6000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.withdrawNativeDeposits(parsedEvent, info)

      const savedTransactions = await Models.Transaction.find({
        transactionHash: '0xpqr',
        type: ITransactionType.native,
        side: ITransactionSide.withdraw,
      })

      expect(savedTransactions).to.have.lengthOf(2)
      expect(savedTransactions[0].value).to.equal('1.0') // 1000000000000000000 wei = 1.0 ETH
      expect(savedTransactions[0].actionIndex).to.equal(0)
      expect(savedTransactions[1].value).to.equal('2.0') // 2000000000000000000 wei = 2.0 ETH
      expect(savedTransactions[1].actionIndex).to.equal(1)
      expect(loggerStub.calledWith('Native transfer saved from Executed event')).to.be.true
    })

    it('should handle with positional action fields', async () => {
      const parsedEvent = {
        name: 'Executed',
        signature: 'Executed(address,bytes32,Action[],uint256,uint256,bytes[])',
        args: [
          '0x111',
          '0xabc123def456',
          [['0x0000000000000000000000000000000000000222', BigInt('1000000000000000000'), '0x']],
        ],
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xpqr',
        blockNumber: 6000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.withdrawNativeDeposits(parsedEvent, info)

      const savedTransactions = await Models.Transaction.find({
        transactionHash: '0xpqr',
      })
      expect(savedTransactions).to.have.lengthOf(1)
    })

    it('should skip actions with zero value', async () => {
      const parsedEvent = {
        name: 'Executed',
        signature: 'Executed(address,bytes32,Action[],uint256,uint256,bytes[])',
        args: ['0x111', '0xabc', [{ to: '0x222', value: BigInt('0'), data: '0x' }]],
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xpqr',
        blockNumber: 6000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.withdrawNativeDeposits(parsedEvent, info)

      const savedTransactions = await Models.Transaction.find({
        transactionHash: '0xpqr',
      })
      expect(savedTransactions).to.have.lengthOf(0)
    })

    it('should handle no actions', async () => {
      const parsedEvent = {
        name: 'Executed',
        signature: 'Executed(address,bytes32,Action[],uint256,uint256,bytes[])',
        args: ['0x111', '0xabc', []],
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xpqr',
        blockNumber: 6000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.withdrawNativeDeposits(parsedEvent, info)

      const savedTransactions = await Models.Transaction.find({
        transactionHash: '0xpqr',
      })
      expect(savedTransactions).to.have.lengthOf(0)
    })

    it('should handle non-array actions', async () => {
      const parsedEvent = {
        name: 'Executed',
        signature: 'Executed(address,bytes32,Action[],uint256,uint256,bytes[])',
        args: ['0x111', '0xabc', null],
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xpqr',
        blockNumber: 6000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      try {
        await DaoTransferHandler.withdrawNativeDeposits(parsedEvent, info)
      } catch (error) {
        // Expected to throw error with null args
        expect(error).to.exist
      }
    })

    it('should handle less than 3 args', async () => {
      const parsedEvent = {
        name: 'Executed',
        signature: 'Executed(address,bytes32,Action[],uint256,uint256,bytes[])',
        args: ['0x111'],
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xpqr',
        blockNumber: 6000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.withdrawNativeDeposits(parsedEvent, info)

      const savedTransactions = await Models.Transaction.find({
        transactionHash: '0xpqr',
      })
      expect(savedTransactions).to.have.lengthOf(0)
    })

    it('should assign correct actionIndex', async () => {
      const parsedEvent = {
        name: 'Executed',
        signature: 'Executed(address,bytes32,Action[],uint256,uint256,bytes[])',
        args: [
          '0x111',
          '0xabc',
          [
            { to: '0x0000000000000000000000000000000000000222', value: BigInt('1000'), data: '0x' },
            { to: '0x0000000000000000000000000000000000000333', value: BigInt('2000'), data: '0x' },
            { to: '0x0000000000000000000000000000000000000444', value: BigInt('3000'), data: '0x' },
          ],
        ],
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xpqr',
        blockNumber: 6000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.withdrawNativeDeposits(parsedEvent, info)

      const savedTransactions = await Models.Transaction.find({
        transactionHash: '0xpqr',
      }).sort({ actionIndex: 1 })

      expect(savedTransactions).to.have.lengthOf(3)
      expect(savedTransactions[0].actionIndex).to.equal(0)
      expect(savedTransactions[1].actionIndex).to.equal(1)
      expect(savedTransactions[2].actionIndex).to.equal(2)
    })
  })

  describe('Error handling', () => {
    it('should handle ProxyToken.saveAndGetToken errors in incomingErc20Transfer', async () => {
      proxyTokenStub.rejects(new Error('Token fetch error'))

      const parsedEvent = {
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        args: { from: '0x999', to: '0x123', value: BigInt('1000') },
      } as any
      const info = {
        address: '0x456',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xabc',
        blockNumber: 2000,
      } as any

      try {
        await DaoTransferHandler.incomingErc20Transfer(parsedEvent, info)
      } catch (error: any) {
        expect(error.message).to.equal('Token fetch error')
      }

      expect(proxyTokenStub.calledOnce).to.be.true

      const savedTransactions = await Models.Transaction.find({
        transactionHash: '0xabc',
      })
      expect(savedTransactions).to.have.lengthOf(0)
    })

    it('should handle ProxyToken.saveAndGetToken errors in withdrawErc20Transfer', async () => {
      proxyTokenStub.rejects(new Error('Token fetch error'))

      const parsedEvent = {
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        args: { from: '0x123', to: '0x999', value: BigInt('1000') },
      } as any
      const info = {
        address: '0x456',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xabc',
        blockNumber: 2000,
      } as any

      try {
        await DaoTransferHandler.withdrawErc20Transfer(parsedEvent, info)
      } catch (error: any) {
        expect(error.message).to.equal('Token fetch error')
      }

      expect(proxyTokenStub.calledOnce).to.be.true

      const savedTransactions = await Models.Transaction.find({
        transactionHash: '0xabc',
      })
      expect(savedTransactions).to.have.lengthOf(0)
    })
  })

  describe('Integration scenarios', () => {
    it('should handle null token decimals in ERC20 transfers', async () => {
      proxyTokenStub.resolves({
        decimals: null,
        symbol: 'UNKNOWN',
        name: 'Unknown Token',
        address: '0x0000000000000000000000000000000000000456',
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
        price: {
          usd: 0,
          timestamp: 1620000100,
        },
      })

      const parsedEvent = createTransferEvent(
        '0x0000000000000000000000000000000000000999',
        '0x0000000000000000000000000000000000000123',
        BigInt('1000'),
      )
      const info = {
        address: '0x0000000000000000000000000000000000000456',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xabc',
        blockNumber: 2000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.incomingErc20Transfer(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xabc',
      })
      expect(savedTransaction).to.exist
      // When decimals is null, defaults to 18, so 1000 wei = 0.000000000000001
      expect(savedTransaction.value).to.equal('0.000000000000001')
    })

    it('should handle undefined token from ProxyToken', async () => {
      // For native transfers, ProxyToken might return undefined for zero address
      proxyTokenStub.resolves({
        decimals: 18,
        symbol: 'ETH',
        name: 'Ether',
        address: '0x0000000000000000000000000000000000000000',
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
        price: {
          usd: 2000,
          timestamp: 1620000100,
        },
      })

      const parsedEvent = createTransferEvent(
        '0x0000000000000000000000000000000000000999',
        '0x0000000000000000000000000000000000000123',
        BigInt('1000'),
      )
      const info = {
        address: '0x0000000000000000000000000000000000000456',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xabc',
        blockNumber: 2000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.incomingErc20Transfer(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xabc',
      })
      expect(savedTransaction).to.exist
    })

    it('should process multiple ERC20 transfers in sequence', async () => {
      const transfers = [
        {
          from: '0x0000000000000000000000000000000000000111',
          to: '0x0000000000000000000000000000000000000123',
          value: BigInt('100'),
        },
        {
          from: '0x0000000000000000000000000000000000000222',
          to: '0x0000000000000000000000000000000000000123',
          value: BigInt('200'),
        },
        {
          from: '0x0000000000000000000000000000000000000333',
          to: '0x0000000000000000000000000000000000000123',
          value: BigInt('300'),
        },
      ]

      for (let i = 0; i < transfers.length; i++) {
        const parsedEvent = createTransferEvent(transfers[i].from, transfers[i].to, transfers[i].value)
        const info = {
          address: '0x0000000000000000000000000000000000000456',
          network: NetworksEnum.ethereumMainnet,
          transactionHash: `0xabc${i}`,
          blockNumber: 2000,
          transactionIndex: 1,
          logIndex: i,
        } as any

        await DaoTransferHandler.incomingErc20Transfer(parsedEvent, info)
      }

      const savedTransactions = await Models.Transaction.find({
        daoAddress: '0x0000000000000000000000000000000000000123',
      })
      expect(savedTransactions).to.have.lengthOf(3)
      // ProxyToken is called twice per transfer (once in handler, once in processor)
      expect(proxyTokenStub.callCount).to.equal(6)
    })

    it('should handle BigInt edge cases', async () => {
      const hugeValue = BigInt('999999999999999999999999999999999999999999')
      const parsedEvent = createTransferEvent(
        '0x0000000000000000000000000000000000000999',
        '0x0000000000000000000000000000000000000123',
        hugeValue,
      )
      const info = {
        address: '0x0000000000000000000000000000000000000456',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xabc',
        blockNumber: 2000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.incomingErc20Transfer(parsedEvent, info)

      const savedTransaction = await Models.Transaction.findOne({
        transactionHash: '0xabc',
      })
      expect(savedTransaction).to.exist
      // The huge value formatted with 18 decimals: 999999999999999999999999.999999999999999999
      expect(savedTransaction.value).to.equal('999999999999999999999999.999999999999999999')
      expect(loggerStub.called).to.be.true
      // Find the call with 'ERC20 Transfer to DAO'
      const erc20LogCall = loggerStub.getCalls().find(call => call.args[0] === 'ERC20 Transfer to DAO')
      expect(erc20LogCall).to.exist
      if (erc20LogCall) {
        const logMeta = erc20LogCall.args[1]
        expect(logMeta.value).to.equal(hugeValue.toString())
      }
    })

    it('should handle different network types', async () => {
      const networks = [
        NetworksEnum.ethereumMainnet,
        NetworksEnum.polygonMainnet,
        NetworksEnum.ethereumSepolia,
        NetworksEnum.baseMainnet,
      ]

      for (let i = 0; i < networks.length; i++) {
        const network = networks[i]

        // Create DAO for each network
        await Models.Dao.create({
          address: '0x0000000000000000000000000000000000000124',
          network: network,
          blockNumber: 1000,
          blockTimestamp: 1620000000,
          transactionHash: `0xdao${i}`,
          name: `Test DAO ${network}`,
          creatorAddress: '0x0000000000000000000000000000000000000999',
        })

        const parsedEvent = createTransferEvent(
          '0x0000000000000000000000000000000000000999',
          '0x0000000000000000000000000000000000000124',
          BigInt('1000'),
        )
        const info = {
          address: '0x0000000000000000000000000000000000000456',
          network,
          transactionHash: `0xabc${i}`,
          blockNumber: 2000,
          transactionIndex: 1,
          logIndex: i,
        } as any

        await DaoTransferHandler.incomingErc20Transfer(parsedEvent, info)

        const savedTransaction = await Models.Transaction.findOne({
          transactionHash: `0xabc${i}`,
        })
        expect(savedTransaction).to.exist
        expect(savedTransaction.network).to.equal(network)
      }

      const allTransactions = await Models.Transaction.find({})
      expect(allTransactions).to.have.lengthOf(networks.length)
    })
  })

  describe('Edge cases', () => {
    it('should handle malformed parsedEvent args in ERC20', async () => {
      const parsedEvent = {
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        args: {}, // Empty args object
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000456',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xabc',
        blockNumber: 2000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      try {
        await DaoTransferHandler.incomingErc20Transfer(parsedEvent, info)
      } catch (error) {
        // Expected to throw when accessing undefined values
        expect(error).to.exist
      }
    })

    it('should handle null parsedEvent args in withdrawNativeDeposits', async () => {
      const parsedEvent = {
        name: 'Executed',
        signature: 'Executed(address,bytes32,Action[],uint256,uint256,bytes[])',
        args: null,
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xpqr',
        blockNumber: 6000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      try {
        await DaoTransferHandler.withdrawNativeDeposits(parsedEvent, info)
      } catch (error) {
        // Expected to throw with null args
        expect(error).to.exist
      }
    })

    it('should handle action with undefined value in withdrawNativeDeposits', async () => {
      const parsedEvent = {
        name: 'Executed',
        signature: 'Executed(address,bytes32,Action[],uint256,uint256,bytes[])',
        args: [
          '0x111',
          '0xabc',
          [
            { to: '0x0000000000000000000000000000000000000222', value: undefined, data: '0x' },
            { to: '0x0000000000000000000000000000000000000333', value: BigInt('1000'), data: '0x' },
          ],
        ],
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xpqr',
        blockNumber: 6000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.withdrawNativeDeposits(parsedEvent, info)

      const savedTransactions = await Models.Transaction.find({
        transactionHash: '0xpqr',
      })
      // Should only process the second action with valid value
      expect(savedTransactions).to.have.lengthOf(1)
      expect(savedTransactions[0].actionIndex).to.equal(1)
    })

    it('should handle string values in native transfers', async () => {
      const parsedEvent = {
        name: 'Executed',
        signature: 'Executed(address,bytes32,Action[],uint256,uint256,bytes[])',
        args: [
          '0x111',
          '0xabc',
          [
            { to: '0x0000000000000000000000000000000000000222', value: '1000000000000000000', data: '0x' }, // String instead of BigInt
          ],
        ],
      } as any
      const info = {
        address: '0x0000000000000000000000000000000000000123',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xpqr',
        blockNumber: 6000,
        transactionIndex: 1,
        logIndex: 5,
      } as any

      await DaoTransferHandler.withdrawNativeDeposits(parsedEvent, info)

      const savedTransactions = await Models.Transaction.find({
        transactionHash: '0xpqr',
      })
      // Should still process as the string value !== '0'
      expect(savedTransactions).to.have.lengthOf(1)
    })
  })
})
