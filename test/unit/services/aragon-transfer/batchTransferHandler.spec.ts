import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import { NetworksEnum, ITransferSide, ITransferType, EnumQueueName } from '@types'
import { ProxyMember } from '@modules/proxyMember'
import Web3Helper from '@helpers/web3'
import utils from '@helpers/utils'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import { type BatchEvents, type UserTransferData, type TransferProcessorOptions } from '@types'
import { BatchTransfersHandler } from '@services/aragon-transfers/batchTransfersHandler'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'
describe.only('Module: BatchTransfersHandler', () => {
  let sandbox: SinonSandbox
  let handler: BatchTransfersHandler

  const validTokenAddress = '0x742d35Cc6aD3C0532F747c0C5F4a5ae2e8a1b71a'
  const validUserAddress1 = '0x4838B106FCe9647bDF1E7877BF73cE8B0BAD5f97'
  const validUserAddress2 = '0x123456789abcdef123456789abcdef1234567890'
  const validDaoAddress = '0x987654321fedcba987654321fedcba9876543210'
  const validPluginAddress = '0xabcdef123456789abcdef123456789abcdef123456'

  beforeEach(() => {
    sandbox = sinon.createSandbox()

    // Stub all logger methods
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'error')
    sandbox.stub(logger, 'verbose')

    handler = new BatchTransfersHandler(NetworksEnum.ethereumMainnet, validTokenAddress, {
      batchSize: 10,
      parallelUsers: 2,
    })
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultHandler = new BatchTransfersHandler(NetworksEnum.ethereumMainnet, validTokenAddress)

      expect(defaultHandler['network']).to.equal(NetworksEnum.ethereumMainnet)
      expect(defaultHandler.tokenAddress).to.equal(validTokenAddress)
      expect(defaultHandler['options'].batchSize).to.equal(50)
      expect(defaultHandler['options'].parallelUsers).to.equal(10)
    })

    it('should initialize with custom options', () => {
      const customOptions: TransferProcessorOptions = {
        batchSize: 100,
        parallelUsers: 5,
      }

      const customHandler = new BatchTransfersHandler(NetworksEnum.polygonMainnet, validTokenAddress, customOptions)

      expect(customHandler['network']).to.equal(NetworksEnum.polygonMainnet)
      expect(customHandler['options']).to.deep.include(customOptions)
    })
  })

  describe('processEvents', () => {
    let mockEvents: BatchEvents[]
    let mockPlugins: any[]
    let mockToken: any

    beforeEach(() => {
      mockEvents = [
        {
          log: {
            name: 'Transfer',
            args: {
              from: validUserAddress1,
              to: validUserAddress2,
              amount: '1000',
            },
          } as any,
          info: {
            blockNumber: 100,
            transactionHash: '0xabcd',
            transactionIndex: 0,
            logIndex: 0,
            network: NetworksEnum.ethereumMainnet,
          } as any,
        },
      ]

      mockPlugins = [
        {
          address: validPluginAddress,
          daoAddress: validDaoAddress,
          tokenAddress: validTokenAddress,
          network: NetworksEnum.ethereumMainnet,
        },
      ]

      mockToken = {
        address: validTokenAddress,
        network: NetworksEnum.ethereumMainnet,
      }
    })

    it('should process events successfully', async () => {
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(mockPlugins)
      sandbox.stub(Models.Token, 'findExistingLog').resolves(mockToken)
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(handler as any, 'batchProcessBalances').resolves(new Map())
      sandbox.stub(handler as any, 'processUserTransactionsWithBalance').resolves()
      sandbox.stub(handler as any, 'updateDaoMetrics').resolves()

      await handler.processEvents(mockEvents)

      expect((logger.info as any).calledWith('Processing events', sinon.match.any)).to.be.true
      expect((logger.info as any).calledWith('Batch processing completed', sinon.match.any)).to.be.true
    })

    it('should handle initialization failure', async () => {
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([])
      sandbox.stub(Models.Token, 'findExistingLog').resolves(mockToken)

      await handler.processEvents(mockEvents)

      expect((logger.info as any).calledWith('No plugins found for token', sinon.match.any)).to.be.true
    })

    it('should handle missing token', async () => {
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(mockPlugins)
      sandbox.stub(Models.Token, 'findExistingLog').resolves(null)

      await handler.processEvents(mockEvents)

      expect((logger.error as any).calledWith('Token not found', sinon.match.any)).to.be.true
    })

    it('should handle processing errors gracefully', async () => {
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').rejects(new Error('Database error'))

      await handler.processEvents(mockEvents)

      expect((logger.error as any).calledWith('Error initializing TransferProcessor', sinon.match.any)).to.be.true
    })
  })

  describe('initialize', () => {
    it('should initialize successfully with plugins and token', async () => {
      const mockPlugins = [{ address: validPluginAddress }]
      const mockToken = { address: validTokenAddress }

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(mockPlugins)
      sandbox.stub(Models.Token, 'findExistingLog').resolves(mockToken)

      const result = await (handler as any).initialize()

      expect(result).to.be.true
      expect((handler as any).plugins).to.equal(mockPlugins)
      expect((handler as any).initialized).to.be.true
    })

    it('should fail when no plugins found', async () => {
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([])
      sandbox.stub(Models.Token, 'findExistingLog').resolves({ address: validTokenAddress })

      const result = await (handler as any).initialize()

      expect(result).to.be.false
      expect((logger.info as any).calledWith('No plugins found for token', sinon.match.any)).to.be.true
    })

    it('should fail when token not found', async () => {
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([{ address: validPluginAddress }])
      sandbox.stub(Models.Token, 'findExistingLog').resolves(null)

      const result = await (handler as any).initialize()

      expect(result).to.be.false
      expect((logger.error as any).calledWith('Token not found', sinon.match.any)).to.be.true
    })

    it('should handle initialization errors', async () => {
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').rejects(new Error('Database error'))

      const result = await (handler as any).initialize()

      expect(result).to.be.false
      expect((logger.error as any).calledWith('Error initializing TransferProcessor', sinon.match.any)).to.be.true
    })
  })

  describe('groupEventsByUser', () => {
    it('should group transfer events by user address', () => {
      const mockEvents: BatchEvents[] = [
        {
          log: {
            name: 'Transfer',
            args: {
              from: validUserAddress1,
              to: validUserAddress2,
              amount: '1000',
            },
          } as any,
          info: {
            blockNumber: 100,
            transactionHash: '0xabcd',
            transactionIndex: 0,
            logIndex: 0,
            network: NetworksEnum.ethereumMainnet,
          } as any,
        },
      ]

      sandbox.stub(utils, 'zeroAddress').value('0x0000000000000000000000000000000000000000')

      const result = (handler as any).groupEventsByUser(mockEvents)

      expect(Object.keys(result)).to.have.lengthOf(2)
      expect(result[validUserAddress1]).to.exist
      expect(result[validUserAddress2]).to.exist
      expect(result[validUserAddress1].events).to.have.lengthOf(1)
      expect(result[validUserAddress2].events).to.have.lengthOf(1)
      expect(result[validUserAddress1].events[0].transferSide).to.equal(ITransferSide.outgoing)
      expect(result[validUserAddress2].events[0].transferSide).to.equal(ITransferSide.incoming)
    })

    it('should group delegation events by delegate', () => {
      const mockEvents: BatchEvents[] = [
        {
          log: {
            name: 'DelegateVotesChanged',
            args: {
              delegate: validUserAddress1,
              newBalance: '2000',
            },
          } as any,
          info: {
            blockNumber: 101,
            transactionHash: '0xefgh',
            transactionIndex: 1,
            logIndex: 1,
            network: NetworksEnum.ethereumMainnet,
          } as any,
        },
      ]

      const result = (handler as any).groupEventsByUser(mockEvents)

      expect(Object.keys(result)).to.have.lengthOf(1)
      expect(result[validUserAddress1]).to.exist
      expect(result[validUserAddress1].events).to.have.lengthOf(1)
      expect(result[validUserAddress1].events[0].eventType).to.equal('delegation')
      expect(result[validUserAddress1].events[0].transferSide).to.equal(ITransferSide.incoming)
    })

    it('should skip zero address transfers', () => {
      const zeroAddress = '0x0000000000000000000000000000000000000000'
      sandbox.stub(utils, 'zeroAddress').value(zeroAddress)

      const mockEvents: BatchEvents[] = [
        {
          log: {
            name: 'Transfer',
            args: {
              from: zeroAddress,
              to: zeroAddress,
              amount: '1000',
            },
          } as any,
          info: {
            blockNumber: 100,
            transactionHash: '0xabcd',
            transactionIndex: 0,
            logIndex: 0,
            network: NetworksEnum.ethereumMainnet,
          } as any,
        },
      ]

      const result = (handler as any).groupEventsByUser(mockEvents)

      expect(Object.keys(result)).to.have.lengthOf(0)
    })

    it('should sort events by block number, transaction index, and log index', () => {
      const mockEvents: BatchEvents[] = [
        {
          log: {
            name: 'Transfer',
            args: { from: validUserAddress1, to: validUserAddress2, amount: '1000' },
          } as any,
          info: {
            blockNumber: 102,
            transactionHash: '0x3',
            transactionIndex: 0,
            logIndex: 0,
            network: NetworksEnum.ethereumMainnet,
          } as any,
        },
        {
          log: {
            name: 'Transfer',
            args: { from: validUserAddress1, to: validUserAddress2, amount: '2000' },
          } as any,
          info: {
            blockNumber: 100,
            transactionHash: '0x1',
            transactionIndex: 1,
            logIndex: 0,
            network: NetworksEnum.ethereumMainnet,
          },
        },
        {
          log: {
            name: 'Transfer',
            args: { from: validUserAddress1, to: validUserAddress2, amount: '3000' },
          } as any,
          info: {
            blockNumber: 100,
            transactionHash: '0x2',
            transactionIndex: 0,
            logIndex: 1,
            network: NetworksEnum.ethereumMainnet,
          } as any,
        },
      ] as any

      sandbox.stub(utils, 'zeroAddress').value('0x0000000000000000000000000000000000000000')

      const result = (handler as any).groupEventsByUser(mockEvents)

      const userEvents = result[validUserAddress1].events
      expect(userEvents[0].parsedEvent.args.amount).to.equal('3000') // Block 100, txIndex 0, logIndex 1
      expect(userEvents[1].parsedEvent.args.amount).to.equal('2000') // Block 100, txIndex 1, logIndex 0
      expect(userEvents[2].parsedEvent.args.amount).to.equal('1000') // Block 102, txIndex 0, logIndex 0
    })

    it('should handle NFT transfers with tokenId', () => {
      const mockEvents: BatchEvents[] = [
        {
          log: {
            name: 'Transfer',
            args: {
              from: validUserAddress1,
              to: validUserAddress2,
              tokenId: 123,
            },
          } as any,
          info: {
            blockNumber: 100,
            transactionHash: '0xabcd',
            transactionIndex: 0,
            logIndex: 0,
            network: NetworksEnum.ethereumMainnet,
          } as any,
        },
      ]

      sandbox.stub(utils, 'zeroAddress').value('0x0000000000000000000000000000000000000000')

      const result = (handler as any).groupEventsByUser(mockEvents)

      expect(Object.keys(result)).to.have.lengthOf(2)
      expect(result[validUserAddress1]).to.exist
      expect(result[validUserAddress2]).to.exist
    })
  })

  describe('generateTransactionId', () => {
    it('should generate unique transaction ID', () => {
      const mockInfo = {
        transactionHash: '0xabcd',
        transactionIndex: 0,
        logIndex: 0,
        network: NetworksEnum.ethereumMainnet,
      }

      const getEntityIdStub = sandbox.stub(Models.MemberTransaction, 'getEntityId').returns('unique-id')

      const result = (handler as any).generateTransactionId(mockInfo, validUserAddress1)

      expect(result).to.equal('unique-id')
      expect(
        getEntityIdStub.calledWith({
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0xabcd',
          transactionIndex: 0,
          logIndex: 0,
          address: validUserAddress1,
        }),
      ).to.be.true
    })
  })

  describe('getExistingTxIds', () => {
    it('should return existing transaction IDs', async () => {
      const txIds = ['tx1', 'tx2', 'tx3']
      const existingTxs = [{ id: 'tx1' }, { id: 'tx3' }]

      sandbox.stub(Models.MemberTransaction, 'find').returns({
        select: sandbox.stub().returns({
          lean: sandbox.stub().resolves(existingTxs),
        }),
      } as any)

      const result = await (handler as any).getExistingTxIds(txIds)

      expect(result).to.be.instanceOf(Set)
      expect(result.has('tx1')).to.be.true
      expect(result.has('tx2')).to.be.false
      expect(result.has('tx3')).to.be.true
    })
  })

  describe('getBlockTimestamp', () => {
    beforeEach(() => {
      handler.setTimestampCache({})
    })

    it('should fetch timestamp from blockchain and cache it', async () => {
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1609459200)

      const result = await (handler as any).getBlockTimestamp(NetworksEnum.ethereumMainnet, 100)

      expect(result).to.equal(1609459200)
      expect(getBlockTimestampStub.calledWith(100, NetworksEnum.ethereumMainnet)).to.be.true
      const timestamp = await (handler as any).getBlockTimestamp(NetworksEnum.ethereumMainnet, 100)
      expect(timestamp).to.be.eq(1609459200)
      expect(getBlockTimestampStub.callCount).to.equal(1)
    })

    it('should return current timestamp when Web3Helper fails', async () => {
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(null as any)
      const mockNow = 1609459200000
      sandbox.stub(Date, 'now').returns(mockNow)

      const result = await (handler as any).getBlockTimestamp(NetworksEnum.ethereumMainnet, 100)

      expect(result).to.equal(Math.round(mockNow / 1000))
    })
  })

  describe('setTimestampCache', () => {
    it('should set timestamp cache', () => {
      const cache = { 'test-key': 123456 }

      handler.setTimestampCache(cache)

      expect((handler as any).timestampCache).to.equal(cache)
    })
  })

  describe('batchProcessBalances', () => {
    it('should process balances in batch', async () => {
      const users = [
        { address: validUserAddress1, blockNumber: 100 },
        { address: validUserAddress2, blockNumber: 101 },
      ]

      const mockBatchResults = {
        [validUserAddress1]: { balance: '1000', votingPower: '500' },
        [validUserAddress2]: { balance: '2000', votingPower: '1000' },
      }

      const mockBalanceDb = {
        updateBalance: sandbox.stub().resolves(),
        updateVotingPower: sandbox.stub().resolves(),
      }

      sandbox.stub(handler as any, 'getBlockTimestamp').resolves(1609459200)
      sandbox.stub(Web3BatchHelper, 'getVotingPowerAndBalancesInBatch').resolves(mockBatchResults as any)
      sandbox.stub(ProxyMember, 'getBalances').resolves(mockBalanceDb as any)
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        await fn({ session: { commitTransaction: sandbox.stub() } })
      })

      const result = await (handler as any).batchProcessBalances(users)

      expect(result).to.be.instanceOf(Map)
      expect(result.size).to.equal(2)
      expect(result.get(validUserAddress1)).to.equal(mockBalanceDb)
      expect(result.get(validUserAddress2)).to.equal(mockBalanceDb)
    })

    it('should handle batch processing errors', async () => {
      const users = [{ address: validUserAddress1, blockNumber: 100 }]

      sandbox.stub(handler as any, 'getBlockTimestamp').rejects(new Error('Timestamp error'))

      const result = await (handler as any).batchProcessBalances(users)

      expect(result).to.be.instanceOf(Map)
      expect(result.size).to.equal(0)
    })

    it('should handle individual user balance update errors', async () => {
      const users = [{ address: validUserAddress1, blockNumber: 100 }]

      const mockBatchResults = {
        [validUserAddress1]: { balance: '1000', votingPower: '500' },
      }

      sandbox.stub(handler as any, 'getBlockTimestamp').resolves(1609459200)
      sandbox.stub(Web3BatchHelper, 'getVotingPowerAndBalancesInBatch').resolves(mockBatchResults as any)
      sandbox.stub(ProxyMember, 'getBalances').rejects(new Error('DB error'))

      const result = await (handler as any).batchProcessBalances(users)

      expect(result.size).to.equal(0)
      expect((logger.error as any).calledWith('Error updating user balance', sinon.match.any)).to.be.true
    })

    it('should handle missing balance and voting power results', async () => {
      const users = [{ address: validUserAddress1, blockNumber: 100 }]

      const mockBatchResults = {
        [validUserAddress1]: {}, // Empty result object
      }

      const mockBalanceDb = {
        updateBalance: sandbox.stub().resolves(),
        updateVotingPower: sandbox.stub().resolves(),
      }

      sandbox.stub(handler as any, 'getBlockTimestamp').resolves(1609459200)
      sandbox.stub(Web3BatchHelper, 'getVotingPowerAndBalancesInBatch').resolves(mockBatchResults as any)
      sandbox.stub(ProxyMember, 'getBalances').resolves(mockBalanceDb as any)
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        await fn({ session: { commitTransaction: sandbox.stub() } })
      })

      const result = await (handler as any).batchProcessBalances(users)

      expect(result).to.be.instanceOf(Map)
      expect(result.size).to.equal(1)
      expect(mockBalanceDb.updateBalance.calledWith({ amount: '0', blockNumber: 100, tokenId: undefined })).to.be.true
      expect(mockBalanceDb.updateVotingPower.calledWith('0')).to.be.true
    })

    it('should handle completely missing results for user', async () => {
      const users = [{ address: validUserAddress1, blockNumber: 100 }]

      const mockBatchResults = {} // No results for the user

      const mockBalanceDb = {
        updateBalance: sandbox.stub().resolves(),
        updateVotingPower: sandbox.stub().resolves(),
      }

      sandbox.stub(handler as any, 'getBlockTimestamp').resolves(1609459200)
      sandbox.stub(Web3BatchHelper, 'getVotingPowerAndBalancesInBatch').resolves(mockBatchResults as any)
      sandbox.stub(ProxyMember, 'getBalances').resolves(mockBalanceDb as any)
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        await fn({ session: { commitTransaction: sandbox.stub() } })
      })

      const result = await (handler as any).batchProcessBalances(users)

      expect(result).to.be.instanceOf(Map)
      expect(result.size).to.equal(1)
      expect(mockBalanceDb.updateBalance.calledWith({ amount: '0', blockNumber: 100, tokenId: undefined })).to.be.true
      expect(mockBalanceDb.updateVotingPower.calledWith('0')).to.be.true
    })
  })

  describe('processUserTransactionsWithBalance', () => {
    let mockUserData: UserTransferData
    let mockMemberBalance: any

    beforeEach(() => {
      mockUserData = {
        address: validUserAddress1,
        events: [
          {
            parsedEvent: {
              name: 'Transfer',
              args: { from: validUserAddress1, to: validUserAddress2, amount: '1000' },
            } as any,
            info: {
              blockNumber: 100,
              transactionHash: '0xabcd',
              transactionIndex: 0,
              logIndex: 0,
              network: NetworksEnum.ethereumMainnet,
            } as any,
            transferSide: ITransferSide.outgoing,
            dbId: 'tx-id-1',
            eventType: 'transfer' as const,
          },
        ],
      }

      mockMemberBalance = {
        amount: '1000',
        votingPower: '500',
      }
    })

    it('should process user transactions successfully', async () => {
      sandbox.stub(handler as any, 'getExistingTxIds').resolves(new Set())
      const processSingleTransactionStub = sandbox.stub(handler as any, 'processSingleTransaction').resolves()
      const handleDaoMembershipStub = sandbox.stub(handler as any, 'handleDaoMembership').resolves()

      await (handler as any).processUserTransactionsWithBalance(mockUserData, mockMemberBalance)

      expect(processSingleTransactionStub.calledOnce).to.be.true
      expect(handleDaoMembershipStub.calledOnce).to.be.true
    })

    it('should skip existing transactions', async () => {
      sandbox.stub(handler as any, 'getExistingTxIds').resolves(new Set(['tx-id-1']))
      const processSingleTransactionStub = sandbox.stub(handler as any, 'processSingleTransaction').resolves()
      const handleDaoMembershipStub = sandbox.stub(handler as any, 'handleDaoMembership').resolves()

      await (handler as any).processUserTransactionsWithBalance(mockUserData, mockMemberBalance)

      expect(processSingleTransactionStub.called).to.be.false
      expect(handleDaoMembershipStub.called).to.be.false
    })

    it('should handle delegation events', async () => {
      mockUserData.events[0].eventType = 'delegation'

      sandbox.stub(handler as any, 'getExistingTxIds').resolves(new Set())
      const processSingleDelegationStub = sandbox.stub(handler as any, 'processSingleDelegation').resolves()
      sandbox.stub(handler as any, 'handleDaoMembership').resolves()

      await (handler as any).processUserTransactionsWithBalance(mockUserData, mockMemberBalance)

      expect(processSingleDelegationStub.calledOnce).to.be.true
    })

    it('should skip DAO membership handling for zero balance', async () => {
      mockMemberBalance.amount = '0'
      mockMemberBalance.votingPower = '0'

      sandbox.stub(handler as any, 'getExistingTxIds').resolves(new Set())
      sandbox.stub(handler as any, 'processSingleTransaction').resolves()
      const handleDaoMembershipStub = sandbox.stub(handler as any, 'handleDaoMembership').resolves()

      await (handler as any).processUserTransactionsWithBalance(mockUserData, mockMemberBalance)

      expect(handleDaoMembershipStub.called).to.be.false
    })

    it('should handle processing errors', async () => {
      sandbox.stub(handler as any, 'getExistingTxIds').rejects(new Error('DB error'))

      await (handler as any).processUserTransactionsWithBalance(mockUserData, mockMemberBalance)

      expect((logger.error as any).calledWith('Error processing user transactions with balance', sinon.match.any)).to.be
        .true
    })

    it('should handle zero balance and voting power correctly', async () => {
      const mockUserData: UserTransferData = {
        address: validUserAddress1,
        events: [
          {
            parsedEvent: {
              name: 'Transfer',
              args: { from: validUserAddress1, to: validUserAddress2, amount: '1000' },
            } as any,
            info: {
              blockNumber: 100,
              transactionHash: '0xabcd',
              transactionIndex: 0,
              logIndex: 0,
              network: NetworksEnum.ethereumMainnet,
            } as any,
            transferSide: ITransferSide.outgoing,
            dbId: 'tx-id-1',
            eventType: 'transfer' as const,
          },
        ],
      }

      const mockMemberBalance = {
        amount: '0',
        votingPower: '0',
      }

      sandbox.stub(handler as any, 'getExistingTxIds').resolves(new Set())
      const processSingleTransactionStub = sandbox.stub(handler as any, 'processSingleTransaction').resolves()
      const handleDaoMembershipStub = sandbox.stub(handler as any, 'handleDaoMembership').resolves()

      await (handler as any).processUserTransactionsWithBalance(mockUserData, mockMemberBalance)

      expect(processSingleTransactionStub.calledOnce).to.be.true
      expect(handleDaoMembershipStub.called).to.be.false // Should not be called for zero balance
    })

    it('should handle missing amount and votingPower properties', async () => {
      const mockUserData: UserTransferData = {
        address: validUserAddress1,
        events: [
          {
            parsedEvent: {
              name: 'Transfer',
              args: { from: validUserAddress1, to: validUserAddress2, amount: '1000' },
            } as any,
            info: {
              blockNumber: 100,
              transactionHash: '0xabcd',
              transactionIndex: 0,
              logIndex: 0,
              network: NetworksEnum.ethereumMainnet,
            } as any,
            transferSide: ITransferSide.outgoing,
            dbId: 'tx-id-1',
            eventType: 'transfer' as const,
          },
        ],
      }

      const mockMemberBalance = {} // Empty object, no amount or votingPower

      sandbox.stub(handler as any, 'getExistingTxIds').resolves(new Set())
      const processSingleTransactionStub = sandbox.stub(handler as any, 'processSingleTransaction').resolves()
      const handleDaoMembershipStub = sandbox.stub(handler as any, 'handleDaoMembership').resolves()

      await (handler as any).processUserTransactionsWithBalance(mockUserData, mockMemberBalance)

      expect(processSingleTransactionStub.calledOnce).to.be.true
      expect(handleDaoMembershipStub.called).to.be.false // Should not be called for zero balance
    })
  })

  describe('processSingleTransaction', () => {
    it('should create member transaction record', async () => {
      const mockEvent = {
        parsedEvent: {
          args: {
            from: validUserAddress1,
            to: validUserAddress2,
            amount: '1000',
          },
        } as any,
        info: {
          blockNumber: 100,
          transactionHash: '0xabcd',
          transactionIndex: 0,
          logIndex: 0,
          network: NetworksEnum.ethereumMainnet,
        },
        transferSide: ITransferSide.outgoing,
        dbId: 'tx-id-1',
      }

      const mockMemberBalance = { amount: '2000' }

      sandbox.stub(handler as any, 'getBlockTimestamp').resolves(1609459200)
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        await fn({ session: { commitTransaction: sandbox.stub() } })
      })
      const createStub = sandbox.stub(Models.MemberTransaction, 'create').resolves()

      await (handler as any).processSingleTransaction(validUserAddress1, mockMemberBalance, mockEvent)

      expect(
        createStub.calledWith(
          {
            id: 'tx-id-1',
            network: NetworksEnum.ethereumMainnet,
            transactionHash: '0xabcd',
            transactionIndex: 0,
            logIndex: 0,
            blockNumber: 100,
            blockTimestamp: 1609459200,
            address: validUserAddress1,
            type: ITransferType.tokenTransfer,
            side: ITransferSide.outgoing,
            from: validUserAddress1,
            to: validUserAddress2,
            amount: '1000',
            tokenAddress: validTokenAddress,
            memberBalance: '2000',
            tokenId: null,
          },
          { session: sinon.match.any },
        ),
      ).to.be.true
    })

    it('should handle NFT transfers with tokenId', async () => {
      const mockEvent = {
        parsedEvent: {
          args: {
            from: validUserAddress1,
            to: validUserAddress2,
            tokenId: 123,
          },
        } as any,
        info: {
          blockNumber: 100,
          transactionHash: '0xabcd',
          transactionIndex: 0,
          logIndex: 0,
          network: NetworksEnum.ethereumMainnet,
        },
        transferSide: ITransferSide.outgoing,
        dbId: 'tx-id-1',
      }

      const mockMemberBalance = { amount: '1' }

      sandbox.stub(handler as any, 'getBlockTimestamp').resolves(1609459200)
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        await fn({ session: { commitTransaction: sandbox.stub() } })
      })
      const createStub = sandbox.stub(Models.MemberTransaction, 'create').resolves()

      await (handler as any).processSingleTransaction(validUserAddress1, mockMemberBalance, mockEvent)

      expect(
        createStub.calledWith(
          sinon.match({
            amount: 1,
            tokenId: 123,
          }),
          { session: sinon.match.any },
        ),
      ).to.be.true
    })

    it('should handle missing amount in args', async () => {
      const mockEvent = {
        parsedEvent: {
          args: {
            from: validUserAddress1,
            to: validUserAddress2,
            // No amount property
          },
        } as any,
        info: {
          blockNumber: 100,
          transactionHash: '0xabcd',
          transactionIndex: 0,
          logIndex: 0,
          network: NetworksEnum.ethereumMainnet,
        },
        transferSide: ITransferSide.outgoing,
        dbId: 'tx-id-1',
      }

      const mockMemberBalance = { amount: '2000' }

      sandbox.stub(handler as any, 'getBlockTimestamp').resolves(1609459200)
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        await fn({ session: { commitTransaction: sandbox.stub() } })
      })
      const createStub = sandbox.stub(Models.MemberTransaction, 'create').resolves()

      await (handler as any).processSingleTransaction(validUserAddress1, mockMemberBalance, mockEvent)

      expect(
        createStub.calledWith(
          sinon.match({
            amount: '0', // Should default to '0'
          }),
          { session: sinon.match.any },
        ),
      ).to.be.true
    })
  })

  describe('processSingleDelegation', () => {
    it('should process delegation event successfully', async () => {
      const mockEvent = {
        parsedEvent: {
          args: {
            delegate: validUserAddress1,
            newBalance: '2000',
          },
        } as any,
        info: {
          blockNumber: 100,
          transactionHash: '0xabcd',
          transactionIndex: 0,
          logIndex: 0,
          network: NetworksEnum.ethereumMainnet,
        },
        dbId: 'delegation-id-1',
      }

      const mockMemberBalance = { amount: '1000' }
      const mockPlugins = [{ address: validPluginAddress }]

      sandbox.stub(handler as any, 'getBlockTimestamp').resolves(1609459200)
      sandbox.stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt').resolves({
        from: utils.zeroAddress,
        to: validUserAddress1,
        delegator: validUserAddress2,
      })
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        await fn({ session: { commitTransaction: sandbox.stub() } })
      })
      const createStub = sandbox.stub(Models.MemberTransaction, 'create').resolves()
      const updateDelegationMetricsStub = sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      const updateActivityStub = sandbox.stub(ProxyMember, 'updateActivity').resolves()

      handler['plugins'] = mockPlugins

      await (handler as any).processSingleDelegation(validUserAddress1, mockMemberBalance, mockEvent)

      expect(
        createStub.calledWith(
          sinon.match({
            type: ITransferType.delegate,
            side: ITransferSide.incoming,
            delegator: validUserAddress2,
          }),
          { session: sinon.match.any },
        ),
      ).to.be.true
      expect(updateDelegationMetricsStub.calledOnce).to.be.true
      expect(updateActivityStub.calledOnce).to.be.true
    })

    it('should skip when from and to are the same or both zero', async () => {
      const mockEvent = {
        parsedEvent: {
          args: { delegate: validUserAddress1, newBalance: '2000' },
        } as any,
        info: {
          blockNumber: 100,
          transactionHash: '0xabcd',
          transactionIndex: 0,
          logIndex: 0,
          network: NetworksEnum.ethereumMainnet,
        },
        dbId: 'delegation-id-1',
      }

      sandbox.stub(handler as any, 'getBlockTimestamp').resolves(1609459200)
      sandbox.stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt').resolves({
        from: validUserAddress1,
        to: validUserAddress1,
        delegator: validUserAddress2,
      })

      const createStub = sandbox.stub(Models.MemberTransaction, 'create')

      await (handler as any).processSingleDelegation(validUserAddress1, {}, mockEvent)

      expect(createStub.called).to.be.false
      expect((logger.warn as any).calledWith('Skip from and to address', sinon.match.any)).to.be.true
    })

    it('should handle errors in delegation processing', async () => {
      const mockEvent = {
        parsedEvent: { args: { delegate: validUserAddress1, newBalance: '2000' } } as any,
        info: {
          blockNumber: 100,
          transactionHash: '0xabcd',
          transactionIndex: 0,
          logIndex: 0,
          network: NetworksEnum.ethereumMainnet,
        },
        dbId: 'delegation-id-1',
      }

      sandbox.stub(handler as any, 'getBlockTimestamp').rejects(new Error('Timestamp error'))

      await (handler as any).processSingleDelegation(validUserAddress1, {}, mockEvent)

      expect((logger.error as any).calledWith('Error processing delegation', sinon.match.any)).to.be.true
    })

    it('should handle delegation where address equals from (outgoing)', async () => {
      const mockEvent = {
        parsedEvent: {
          args: {
            delegate: validUserAddress1,
            newBalance: '2000',
          },
        } as any,
        info: {
          blockNumber: 100,
          transactionHash: '0xabcd',
          transactionIndex: 0,
          logIndex: 0,
          network: NetworksEnum.ethereumMainnet,
        },
        dbId: 'delegation-id-1',
      }

      const mockMemberBalance = { amount: '1000' }
      const mockPlugins = [{ address: validPluginAddress }]

      sandbox.stub(handler as any, 'getBlockTimestamp').resolves(1609459200)
      sandbox.stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt').resolves({
        from: validUserAddress1, // Same as address
        to: validUserAddress2,
        delegator: validUserAddress2,
      })
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        await fn({ session: { commitTransaction: sandbox.stub() } })
      })
      const createStub = sandbox.stub(Models.MemberTransaction, 'create').resolves()
      sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      sandbox.stub(ProxyMember, 'updateActivity').resolves()

      handler['plugins'] = mockPlugins

      await (handler as any).processSingleDelegation(validUserAddress1, mockMemberBalance, mockEvent)

      expect(
        createStub.calledWith(
          sinon.match({
            type: ITransferType.delegate,
            side: ITransferSide.outgoing, // Should be outgoing
          }),
          { session: sinon.match.any },
        ),
      ).to.be.true
    })

    it('should handle delegation with neither from nor to matching address', async () => {
      const mockEvent = {
        parsedEvent: {
          args: {
            delegate: validUserAddress1,
            newBalance: '2000',
          },
        } as any,
        info: {
          blockNumber: 100,
          transactionHash: '0xabcd',
          transactionIndex: 0,
          logIndex: 0,
          network: NetworksEnum.ethereumMainnet,
        },
        dbId: 'delegation-id-1',
      }

      const mockMemberBalance = { amount: '1000' }

      sandbox.stub(handler as any, 'getBlockTimestamp').resolves(1609459200)
      sandbox.stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt').resolves({
        from: validUserAddress2, // Different from address
        to: validDaoAddress, // Also different from address
        delegator: validUserAddress2,
      })

      const createStub = sandbox.stub(Models.MemberTransaction, 'create')

      await (handler as any).processSingleDelegation(validUserAddress1, mockMemberBalance, mockEvent)

      expect(createStub.called).to.be.false
      expect((logger.error as any).calledWith('Error cannot detect delegation side', sinon.match.any)).to.be.true
    })

    it('should handle missing newBalance in delegation args', async () => {
      const mockEvent = {
        parsedEvent: {
          args: {
            delegate: validUserAddress1,
            // No newBalance property
          },
        } as any,
        info: {
          blockNumber: 100,
          transactionHash: '0xabcd',
          transactionIndex: 0,
          logIndex: 0,
          network: NetworksEnum.ethereumMainnet,
        },
        dbId: 'delegation-id-1',
      }

      const mockMemberBalance = { amount: '1000' }
      const mockPlugins = [{ address: validPluginAddress }]

      sandbox.stub(handler as any, 'getBlockTimestamp').resolves(1609459200)
      sandbox.stub(GovernanceErc20Handler, '_findDelegatorsFromReceipt').resolves({
        from: utils.zeroAddress,
        to: validUserAddress1,
        delegator: validUserAddress2,
      })
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        await fn({ session: { commitTransaction: sandbox.stub() } })
      })
      const createStub = sandbox.stub(Models.MemberTransaction, 'create').resolves()
      sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      sandbox.stub(ProxyMember, 'updateActivity').resolves()

      handler['plugins'] = mockPlugins

      await (handler as any).processSingleDelegation(validUserAddress1, mockMemberBalance, mockEvent)

      expect(
        createStub.calledWith(
          sinon.match({
            amount: '0', // Should default to '0'
            memberVotingPower: '0', // Should default to '0'
          }),
          { session: sinon.match.any },
        ),
      ).to.be.true
    })
  })

  describe('updateDaoMetrics', () => {
    it('should send DAO metrics messages for unique DAOs', async () => {
      handler['plugins'] = [
        { daoAddress: validDaoAddress },
        { daoAddress: validDaoAddress }, // Duplicate
        { daoAddress: '0x1234567890123456789012345678901234567890' },
      ]

      sandbox
        .stub(utils, 'getUniqueValuesByKey')
        .returns([validDaoAddress, '0x1234567890123456789012345678901234567890'])
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await (handler as any).updateDaoMetrics()

      expect(sendMessageStub.callCount).to.equal(2)
      expect(
        sendMessageStub.calledWith(
          EnumQueueName.daoMetrics,
          sinon.match({
            id: validDaoAddress,
            params: { address: validDaoAddress, network: NetworksEnum.ethereumMainnet },
          }),
        ),
      ).to.be.true
    })

    it('should handle errors in DAO metrics update', async () => {
      handler['plugins'] = [{ daoAddress: validDaoAddress }]

      sandbox.stub(utils, 'getUniqueValuesByKey').throws(new Error('Utils error'))

      await (handler as any).updateDaoMetrics()

      expect((logger.error as any).calledWith('Error updating DAO metrics', sinon.match.any)).to.be.true
    })
  })

  describe('handleDaoMembership', () => {
    let mockMemberBalance: any
    let mockPlugins: any[]

    beforeEach(() => {
      mockMemberBalance = {
        amount: '1000',
        votingPower: '500',
      }

      mockPlugins = [
        {
          daoAddress: validDaoAddress,
          network: NetworksEnum.ethereumMainnet,
          address: validPluginAddress,
          tokenAddress: validTokenAddress,
        },
      ]

      handler['plugins'] = mockPlugins
    })

    it('should add member to DAO when they have balance but are not a member', async () => {
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()

      await (handler as any).handleDaoMembership(validUserAddress1, mockMemberBalance)

      expect(addToDaoStub.calledOnce).to.be.true
      expect((logger.info as any).calledWith('Added member to DAO', sinon.match.any)).to.be.true
    })

    it('should remove member from DAO when they have no balance but are a member', async () => {
      mockMemberBalance.amount = '0'
      mockMemberBalance.votingPower = '0'

      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao').resolves()

      await (handler as any).handleDaoMembership(validUserAddress1, mockMemberBalance)

      expect(removeFromDaoStub.calledOnce).to.be.true
      expect((logger.info as any).calledWith('Removed member from DAO', sinon.match.any)).to.be.true
    })

    it('should not change membership when member has balance and is already a member', async () => {
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao')
      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao')

      await (handler as any).handleDaoMembership(validUserAddress1, mockMemberBalance)

      expect(addToDaoStub.called).to.be.false
      expect(removeFromDaoStub.called).to.be.false
    })

    it('should not change membership when member has no balance and is not a member', async () => {
      mockMemberBalance.amount = '0'
      mockMemberBalance.votingPower = '0'

      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao')
      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao')

      await (handler as any).handleDaoMembership(validUserAddress1, mockMemberBalance)

      expect(addToDaoStub.called).to.be.false
      expect(removeFromDaoStub.called).to.be.false
    })

    it('should handle errors in DAO membership processing', async () => {
      sandbox.stub(ProxyMember, 'isMemberOfDao').rejects(new Error('Membership check error'))

      await (handler as any).handleDaoMembership(validUserAddress1, mockMemberBalance)

      expect((logger.error as any).calledWith('Error handling DAO membership', sinon.match.any)).to.be.true
    })

    it('should handle voting power balance correctly', async () => {
      mockMemberBalance.amount = '0'
      mockMemberBalance.votingPower = '1000' // Has voting power but no token balance

      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()

      await (handler as any).handleDaoMembership(validUserAddress1, mockMemberBalance)

      expect(addToDaoStub.calledOnce).to.be.true
    })

    it('should handle missing amount and votingPower properties in balance check', async () => {
      const mockMemberBalance = {} // Empty object, no amount or votingPower
      handler['plugins'] = [
        {
          daoAddress: validDaoAddress,
          network: NetworksEnum.ethereumMainnet,
          address: validPluginAddress,
          tokenAddress: validTokenAddress,
        },
      ]

      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao')
      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao')

      await (handler as any).handleDaoMembership(validUserAddress1, mockMemberBalance)

      expect(addToDaoStub.called).to.be.false
      expect(removeFromDaoStub.called).to.be.false
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle very large batch sizes', async () => {
      const largeHandler = new BatchTransfersHandler(NetworksEnum.ethereumMainnet, validTokenAddress, {
        batchSize: 1000,
        parallelUsers: 50,
      })

      const events: BatchEvents[] = Array(2000)
        .fill(null)
        .map((_, i) => ({
          log: {
            name: 'Transfer',
            args: {
              from: validUserAddress1,
              to: validUserAddress2,
              amount: '1000',
            },
          } as any,
          info: {
            blockNumber: 100 + i,
            transactionHash: `0x${i.toString(16).padStart(64, '0')}`,
            transactionIndex: 0,
            logIndex: 0,
            network: NetworksEnum.ethereumMainnet,
          },
        })) as any

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([{ address: validPluginAddress }])
      sandbox.stub(Models.Token, 'findExistingLog').resolves({ address: validTokenAddress })
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(largeHandler as any, 'batchProcessBalances').resolves(new Map())
      sandbox.stub(largeHandler as any, 'processUserTransactionsWithBalance').resolves()

      await largeHandler.processEvents(events)

      expect((logger.info as any).calledWith('Batch processing completed', sinon.match.any)).to.be.true
    })

    it('should handle network timeouts gracefully', async () => {
      const events: BatchEvents[] = [
        {
          log: {
            name: 'Transfer',
            args: { from: validUserAddress1, to: validUserAddress2, amount: '1000' },
          } as any,
          info: {
            blockNumber: 100,
            transactionHash: '0xabcd',
            transactionIndex: 0,
            logIndex: 0,
            network: NetworksEnum.ethereumMainnet,
          } as any,
        },
      ]

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([{ address: validPluginAddress }])
      sandbox.stub(Models.Token, 'findExistingLog').resolves({ address: validTokenAddress })
      sandbox.stub(ProxyMember, 'createMember').rejects(new Error('Network timeout'))

      await handler.processEvents(events)

      expect((logger.error as any).calledWith('Error in batch processing', sinon.match.any)).to.be.true
    })

    it('should handle events with complex sorting requirements', () => {
      const mockEvents: BatchEvents[] = [
        {
          log: {
            name: 'Transfer',
            args: { from: validUserAddress1, to: validUserAddress2, amount: '1000' },
          } as any,
          info: {
            blockNumber: 100,
            transactionHash: '0x1',
            transactionIndex: 0,
            logIndex: 2,
            network: NetworksEnum.ethereumMainnet,
          } as any,
        },
        {
          log: {
            name: 'Transfer',
            args: { from: validUserAddress1, to: validUserAddress2, amount: '2000' },
          } as any,
          info: {
            blockNumber: 100,
            transactionHash: '0x2',
            transactionIndex: 0,
            logIndex: 1,
            network: NetworksEnum.ethereumMainnet,
          } as any,
        },
      ]

      sandbox.stub(utils, 'zeroAddress').value('0x0000000000000000000000000000000000000000')

      const result = (handler as any).groupEventsByUser(mockEvents)

      const userEvents = result[validUserAddress1].events
      // Should be sorted by logIndex when block and transaction index are the same
      expect(userEvents[0].parsedEvent.args.amount).to.equal('2000') // logIndex 1
      expect(userEvents[1].parsedEvent.args.amount).to.equal('1000') // logIndex 2
    })
  })
})
