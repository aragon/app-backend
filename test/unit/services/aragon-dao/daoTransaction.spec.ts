import * as sinon from 'sinon'
import { expect } from 'chai'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import { DAO } from '@artifacts/dao'
import { Multisig } from '@artifacts/Multisig'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { ProxyToken } from '@modules/proxyToken'
import utils from '@helpers/utils'
import { ITokenType, ITransactionCategory, ITransactionType, NetworksEnum } from '@types'
import TokenUtils from '@helpers/tokenUtils'

describe('AragonDao: DaoTransactions', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should process transactions successfully', async () => {
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')
      const mockDao = {
        id: 'test-dao-id',
        address: '0x123',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1000,
      }

      const mockTxns = [
        { hash: 'tx1', type: 'deposit' },
        { hash: 'tx2', type: 'withdraw' },
      ]

      const findByAddressStub = sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao)
      const fetchAddressTxnsStub = sandbox.stub(ProxyWeb3Provider, 'fetchAddressTxns').resolves(mockTxns)
      const saveTransactionStub = sandbox.stub(DaoTransactions, 'saveTransaction').resolves()
      const stubFindProposal = sandbox.stub(Models.Proposal, 'findByEntityId')

      // Execute
      await DaoTransactions.start({
        daoAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
      })

      // Verify
      expect(findByAddressStub.calledOnce).to.be.true
      expect(fetchAddressTxnsStub.calledOnce).to.be.true
      expect(
        fetchAddressTxnsStub.calledWith({
          address: mockDao.address,
          network: mockDao.network,
          blockNumber: mockDao.blockNumber,
        }),
      ).to.be.true

      expect(stubFindProposal.notCalled).to.be.true
      expect(saveTransactionStub.calledTwice).to.be.true
      expect(verboseLoggerStub.calledWith('Start DaoTransactions' as any)).to.be.true
      expect(verboseLoggerStub.calledWith('End DaoTransactions' as any)).to.be.true
    })

    it('should process transactions with proposalId successfully', async () => {
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')
      const mockDao = {
        id: 'test-dao-id',
        address: '0x123',
        network: NetworksEnum.baseMainnet,
        blockNumber: 1000,
      }

      const mockProposal = {
        id: 'proposal-123',
        proposalIndex: '1',
        daoAddress: '0x123',
        pluginAddress: '0xplugin',
        network: NetworksEnum.baseMainnet,
        executed: {
          transactionHash: '0xtxhash',
          blockNumber: 1500,
          blockTimestamp: 1623456789,
        },
        rawActions: [
          { to: '0xrecipient1', value: '1000000000000000000', from: '0xaction1' },
          { to: '0xrecipient2', value: '2000000000000000000', from: '0xaction2' },
        ],
      }

      const mockTxns = [
        { hash: 'tx1', type: ITransactionType.deposit, uniqueId: 'tx1-unique' },
        { hash: 'tx2', type: ITransactionType.withdraw, uniqueId: 'tx2-unique' },
      ]

      const findByAddressStub = sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao)
      const findByEntityIdStub = sandbox.stub(Models.Proposal, 'findByEntityId').resolves(mockProposal)
      const supportsInternalTransactionsStub = sandbox.stub(TokenUtils, 'supportsInternalTransactions').returns(false)
      const parseTransactionStub = sandbox.stub(DaoTransactions, 'parseTransactionFromProposalAction').resolves()
      const fetchAddressTxnsStub = sandbox.stub(ProxyWeb3Provider, 'fetchAddressTxns').resolves(mockTxns)
      const saveTransactionStub = sandbox.stub(DaoTransactions, 'saveTransaction').resolves()

      await DaoTransactions.start({
        daoAddress: '0x123',
        network: NetworksEnum.baseMainnet,
        proposalId: 'proposal-123',
      })

      expect(findByAddressStub.calledOnce).to.be.true
      expect(findByAddressStub.calledWith('0x123', NetworksEnum.baseMainnet)).to.be.true

      expect(supportsInternalTransactionsStub.calledOnce).to.be.true
      expect(supportsInternalTransactionsStub.calledWith(NetworksEnum.baseMainnet)).to.be.true

      expect(findByEntityIdStub.calledOnce).to.be.true
      expect(findByEntityIdStub.calledWith('proposal-123')).to.be.true

      expect(parseTransactionStub.calledOnce).to.be.true
      expect(parseTransactionStub.calledWith(mockProposal)).to.be.true

      expect(fetchAddressTxnsStub.calledOnce).to.be.true
      expect(
        fetchAddressTxnsStub.calledWith({
          address: mockDao.address,
          network: mockDao.network,
          blockNumber: mockDao.blockNumber,
        }),
      ).to.be.true

      expect(saveTransactionStub.calledTwice).to.be.true
      expect(
        saveTransactionStub.firstCall.calledWith(
          mockTxns[0],
          ITransactionType.deposit,
          mockDao.address,
          mockDao.network,
        ),
      ).to.be.true
      expect(
        saveTransactionStub.secondCall.calledWith(
          mockTxns[1],
          ITransactionType.withdraw,
          mockDao.address,
          mockDao.network,
        ),
      ).to.be.true

      expect(verboseLoggerStub.calledWith('Start DaoTransactions' as any)).to.be.true
      expect(verboseLoggerStub.calledWith('End DaoTransactions' as any)).to.be.true
    })

    it('should exit gracefully if DAO is not found', async () => {
      // Setup stubs
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')
      const findByAddressStub = sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const fetchAddressTxnsStub = sandbox.stub(ProxyWeb3Provider, 'fetchAddressTxns')

      // Execute
      await DaoTransactions.start({
        daoAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
      })

      // Verify
      expect(findByAddressStub.calledOnce).to.be.true
      expect(fetchAddressTxnsStub.notCalled).to.be.true
      expect(verboseLoggerStub.calledWith('Start DaoTransactions' as any)).to.be.true
      expect(verboseLoggerStub.calledWith('End DaoTransactions' as any)).to.be.false
    })

    it('should log a message when no transactions are found', async () => {
      // Setup stubs
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')
      const mockDao = {
        id: 'test-dao-id',
        address: '0x123',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1000,
      }

      const findByAddressStub = sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao)
      const fetchAddressTxnsStub = sandbox.stub(ProxyWeb3Provider, 'fetchAddressTxns').resolves([])
      const saveTransactionStub = sandbox.stub(DaoTransactions, 'saveTransaction')

      // Execute
      await DaoTransactions.start({
        daoAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
      })

      // Verify
      expect(findByAddressStub.calledOnce).to.be.true
      expect(fetchAddressTxnsStub.calledOnce).to.be.true
      expect(saveTransactionStub.notCalled).to.be.true
      expect(verboseLoggerStub.calledWith('No transactions found' as any)).to.be.true
    })

    it('should handle errors gracefully', async () => {
      // Setup stubs
      const errorLoggerStub = sandbox.stub(logger, 'error')
      const findByAddressStub = sandbox.stub(Models.Dao, 'findByAddress').rejects(new Error('Database error'))

      sandbox.stub(logger, 'verbose')
      // Execute
      await DaoTransactions.start({
        daoAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
      })

      // Verify
      expect(findByAddressStub.calledOnce).to.be.true
      expect(errorLoggerStub.calledOnce).to.be.true
      expect(errorLoggerStub.calledWithMatch('Error start DaoTransactions' as any)).to.be.true
    })
  })

  describe('saveTransaction', () => {
    it('should save a new transaction successfully', async () => {
      // Setup
      const mockTx = {
        hash: '0xabc123',
        uniqueId: 'unique123',
        blockNum: '0x100',
        blockTimestamp: 1623456789,
        category: 'erc20',
        from: '0xsender',
        to: '0xreceiver',
        value: '1000000000000000000',
        rawContract: {
          address: '0xtoken',
          symbol: 'TKN',
          name: 'Token',
          type: 'ERC20',
          logo: 'logo-url',
          decimals: 18,
          priceUsd: 2.5,
          priceUpdatedAt: 1623456700,
        },
      }

      const mockDao = {
        address: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      }

      const mockToken = {
        network: NetworksEnum.ethereumMainnet,
        address: '0xtoken',
        symbol: 'TKN',
        name: 'Token',
        type: 'ERC20',
        logo: 'logo-url',
        decimals: 18,
      }

      // Stubs
      const findExistingLogStub = sandbox.stub(Models.Transaction, 'findExistingLog').resolves(null)
      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [
          {
            address: '0xdao',
            topics: ['0xtopic1', '0xtopic2'],
          },
        ],
      } as any)

      const findLogsByNameStub = sandbox.stub(Web3Utils, 'findLogsByName')
      findLogsByNameStub.withArgs(sinon.match.any, 'Executed', DAO.abi).returns([
        {
          txLog: { address: '0xdao' },
        },
      ] as any)
      findLogsByNameStub.withArgs(sinon.match.any, 'ProposalExecuted', Multisig.abi).returns([
        {
          txLog: { address: '0xplugin', topics: ['0xtopic1', '0xproposalIndex'] },
        },
      ] as any)

      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockToken as any)
      const fetchHistoricalTokenPriceStub = sandbox.stub(ProxyWeb3Provider, 'fetchHistoricalTokenPrice').resolves('2.5')

      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      await DaoTransactions.saveTransaction(mockTx, ITransactionType.deposit, mockDao.address, mockDao.network)

      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getTransactionReceiptStub.calledOnce).to.be.true
      expect(findLogsByNameStub.calledTwice).to.be.true
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(fetchHistoricalTokenPriceStub.calledOnce).to.be.true
      expect(verboseLoggerStub.calledWithMatch('New Transaction' as any as any)).to.be.true

      const dbTxs = await Models.Transaction.find({})
      expect(dbTxs.length).to.equal(1)
      expect(dbTxs[0].transactionHash).to.equal(mockTx.hash)
      expect(dbTxs[0].uniqueId).to.equal(mockTx.uniqueId)
      expect(dbTxs[0].blockNumber).to.equal(Number(mockTx.blockNum))
      expect(dbTxs[0].blockTimestamp).to.equal(mockTx.blockTimestamp)
      expect(dbTxs[0].network).to.equal(mockDao.network)
      expect(dbTxs[0].type).to.equal(ITransactionType.deposit)
      expect(dbTxs[0].daoAddress).to.equal('0xdao')
      expect(dbTxs[0].pluginAddress).to.equal('0xplugin')
      expect(dbTxs[0].fromAddress).to.equal(mockTx.from)
      expect(dbTxs[0].toAddress).to.equal(mockTx.to)
      expect(dbTxs[0].value).to.equal(mockTx.value)
    })

    it('should skip if transaction already exists', async () => {
      const mockTx = {
        hash: '0xabc123',
        uniqueId: 'unique123',
        category: 'erc20',
        from: '0xsender',
        to: '0xreceiver',
      }

      const mockDao = {
        address: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      }

      // Stubs
      const findExistingLogStub = sandbox.stub(Models.Transaction, 'findExistingLog').resolves({
        id: 'existing-tx-id',
      })

      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt')
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')

      // Execute
      await DaoTransactions.saveTransaction(mockTx, ITransactionType.deposit, mockDao.address, mockDao.network)

      // Verify
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getTransactionReceiptStub.notCalled).to.be.true
      expect(saveAndGetTokenStub.notCalled).to.be.true
      expect(verboseLoggerStub.calledWithMatch('Transaction already saved' as any)).to.be.true
    })

    it('should handle when token is not found', async () => {
      // Setup
      const mockTx = {
        hash: '0xabc123',
        uniqueId: 'unique123',
        category: 'erc20',
        from: '0xsender',
        to: '0xreceiver',
        rawContract: {
          address: '0xtoken',
        },
      }

      const mockDao = {
        address: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      }
      // Stubs
      const findExistingLogStub = sandbox.stub(Models.Transaction, 'findExistingLog').resolves(null)
      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [],
      } as any)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)
      const fetchHistoricalTokenPriceStub = sandbox.stub(ProxyWeb3Provider, 'fetchHistoricalTokenPrice')
      const dbTxStub = sandbox.stub(DbTx, 'executeTxFn')

      // Execute
      await DaoTransactions.saveTransaction(mockTx, ITransactionType.deposit, mockDao.address, mockDao.network)

      // Verify
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getTransactionReceiptStub.calledOnce).to.be.true
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(fetchHistoricalTokenPriceStub.notCalled).to.be.true
      expect(dbTxStub.notCalled).to.be.true
    })

    it('should handle transaction without raw contract data', async () => {
      // Setup
      const mockTx = {
        hash: '0xabc123',
        uniqueId: 'unique123',
        blockNum: '0x100',
        blockTimestamp: 1623456789,
        category: 'erc20',
        from: '0xsender',
        to: '0xreceiver',
        value: '1000000000000000000',
      }

      const mockDao = {
        address: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      }

      const mockToken = {
        network: NetworksEnum.ethereumMainnet,
        address: utils.zeroAddress,
        symbol: 'ETH',
        name: 'Ethereum',
        type: ITokenType.native,
        logo: null,
        decimals: 18,
      }

      // Stubs
      const findExistingLogStub = sandbox.stub(Models.Transaction, 'findExistingLog').resolves(null)
      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [],
      } as any)

      sandbox.stub(Web3Utils, 'findLogsByName').returns([])
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockToken as any)
      const fetchHistoricalTokenPriceStub = sandbox.stub(ProxyWeb3Provider, 'fetchHistoricalTokenPrice').resolves('0')

      await DaoTransactions.saveTransaction(mockTx, ITransactionType.deposit, mockDao.address, mockDao.network)

      // Verify
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getTransactionReceiptStub.calledOnce).to.be.true
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(saveAndGetTokenStub.calledWith(utils.zeroAddress, mockDao.network)).to.be.true
      expect(fetchHistoricalTokenPriceStub.calledOnce).to.be.true
    })

    it('should handle error during transaction save', async () => {
      // Setup
      const mockTx = {
        hash: '0xabc123',
        uniqueId: 'unique123',
        category: 'erc20',
        from: '0xsender',
        to: '0xreceiver',
      }

      const mockDao = {
        address: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      }

      // Stubs
      const findExistingLogStub = sandbox
        .stub(Models.Transaction, 'findExistingLog')
        .rejects(new Error('Database error'))
      const errorLoggerStub = sandbox.stub(logger, 'error')

      // Execute
      await DaoTransactions.saveTransaction(mockTx, ITransactionType.deposit, mockDao.address, mockDao.network)

      // Verify
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(errorLoggerStub.calledOnce).to.be.true
    })

    it('should handle transaction with ERC721 token data', async () => {
      // Setup
      const mockTx = {
        hash: '0xabc123',
        uniqueId: 'unique123',
        blockNum: '0x100',
        blockTimestamp: 1623456789,
        category: ITransactionCategory.ERC721,
        from: '0xsender',
        to: '0xreceiver',
        tokenId: '123',
        erc721TokenId: '123',
        rawContract: {
          address: '0xnft',
          symbol: 'NFT',
          name: 'Non-Fungible Token',
          type: ITokenType.ERC721,
          logo: 'nft-logo-url',
          decimals: 0,
          priceUsd: 0,
          priceUpdatedAt: 1623456700,
        },
      }

      const mockDao = {
        address: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(logger, 'verbose')

      const mockToken = {
        network: NetworksEnum.ethereumMainnet,
        address: '0xnft',
        symbol: 'NFT',
        name: 'Non-Fungible Token',
        type: ITokenType.ERC721,
        logo: 'nft-logo-url',
        decimals: 0,
      }

      // Stubs
      const findExistingLogStub = sandbox.stub(Models.Transaction, 'findExistingLog').resolves(null)
      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [],
      } as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([])
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockToken as any)
      const fetchHistoricalTokenPriceStub = sandbox.stub(ProxyWeb3Provider, 'fetchHistoricalTokenPrice').resolves('0')

      await DaoTransactions.saveTransaction(mockTx, ITransactionType.deposit, mockDao.address, mockDao.network)

      // Verify
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getTransactionReceiptStub.calledOnce).to.be.true
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(fetchHistoricalTokenPriceStub.calledOnce).to.be.true
      const dbTxs = await Models.Transaction.find({})
      expect(dbTxs.length).to.equal(1)
      expect(dbTxs[0].transactionHash).to.equal(mockTx.hash)
      expect(dbTxs[0].uniqueId).to.equal(mockTx.uniqueId)
      expect(dbTxs[0].blockNumber).to.equal(Number(mockTx.blockNum))
      expect(dbTxs[0].erc721TokenId).to.equal(mockTx.erc721TokenId)
    })

    it('should handle transaction with ERC1155 metadata', async () => {
      // Setup
      const mockTx = {
        hash: '0xabc123',
        uniqueId: 'unique123',
        blockNum: '0x100',
        blockTimestamp: 1623456789,
        category: ITransactionCategory.ERC1155,
        from: '0xsender',
        to: '0xreceiver',
        erc1155Metadata: [
          { tokenId: '1', value: '5' },
          { tokenId: '2', value: '10' },
        ],
        rawContract: {
          address: '0xerc1155',
          symbol: 'MT',
          name: 'Multi Token',
          type: ITokenType.ERC1155,
          logo: 'mt-logo-url',
          decimals: 0,
          priceUsd: 0,
          priceUpdatedAt: 1623456700,
        },
      }

      const mockDao = {
        address: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      }

      const mockToken = {
        network: NetworksEnum.ethereumMainnet,
        address: '0xerc1155',
        symbol: 'MT',
        name: 'Multi Token',
        type: ITokenType.ERC1155,
        logo: 'mt-logo-url',
        decimals: 0,
      }

      sandbox.stub(logger, 'verbose')

      // Stubs
      const findExistingLogStub = sandbox.stub(Models.Transaction, 'findExistingLog').resolves(null)
      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [],
      } as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([])
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockToken as any)
      const fetchHistoricalTokenPriceStub = sandbox.stub(ProxyWeb3Provider, 'fetchHistoricalTokenPrice').resolves('0')

      // Execute
      await DaoTransactions.saveTransaction(mockTx, ITransactionType.deposit, mockDao.address, mockDao.network)

      // Verify
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getTransactionReceiptStub.calledOnce).to.be.true
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(fetchHistoricalTokenPriceStub.calledOnce).to.be.true

      const dbTxs = await Models.Transaction.find({})
      expect(dbTxs.length).to.equal(1)

      expect(dbTxs[0].transactionHash).to.equal(mockTx.hash)
      expect(dbTxs[0].uniqueId).to.equal(mockTx.uniqueId)
      expect(dbTxs[0].erc1155Metadata.map((a: any) => ({ tokenId: a.tokenId, value: a.value }))).to.deep.equal([
        { tokenId: '1', value: '5' },
        { tokenId: '2', value: '10' },
      ])
    })

    it('should process BigInt values correctly', async () => {
      // Setup
      const mockTx = {
        hash: '0xabc123',
        uniqueId: 'unique123',
        blockNum: '0x100',
        blockTimestamp: 1623456789,
        category: ITransactionCategory.ERC721,
        from: '0xsender',
        to: '0xreceiver',
        tokenId: '0x7b', // Hex representation of 123
        erc721TokenId: '0x7b', // Hex representation of 123
        rawContract: {
          address: '0xnft',
          symbol: 'NFT',
          name: 'Non-Fungible Token',
          type: ITokenType.ERC721,
          decimals: 0,
        },
      }

      sandbox.stub(logger, 'verbose')

      const mockDao = {
        address: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      }

      const mockToken = {
        network: NetworksEnum.ethereumMainnet,
        address: '0xnft',
        symbol: 'NFT',
        name: 'Non-Fungible Token',
        type: ITokenType.ERC721,
        decimals: 0,
      }

      const findExistingLogStub = sandbox.stub(Models.Transaction, 'findExistingLog').resolves(null)
      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [],
      } as any)
      const findLogsByNameStub = sandbox.stub(Web3Utils, 'findLogsByName').returns([])
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockToken as any)
      const fetchHistoricalTokenPriceStub = sandbox.stub(ProxyWeb3Provider, 'fetchHistoricalTokenPrice').resolves('0')

      // Execute
      await DaoTransactions.saveTransaction(mockTx, ITransactionType.deposit, mockDao.address, mockDao.network)

      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getTransactionReceiptStub.calledOnce).to.be.true
      expect(findLogsByNameStub.calledOnce).to.be.true
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(fetchHistoricalTokenPriceStub.calledOnce).to.be.true
    })

    it('should extract proposal information from transaction logs', async () => {
      // Setup
      const mockTx = {
        hash: '0xabc123',
        uniqueId: 'unique123',
        blockNum: '0x100',
        blockTimestamp: 1623456789,
        category: ITransactionCategory.External,
        from: '0xsender',
        to: '0xreceiver',
      }

      const mockDao = {
        address: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      }

      const mockToken = {
        network: NetworksEnum.ethereumMainnet,
        address: utils.zeroAddress,
        symbol: 'ETH',
        name: 'Ethereum',
        type: ITokenType.native,
        decimals: 18,
      }

      // Stubs
      const findExistingLogStub = sandbox.stub(Models.Transaction, 'findExistingLog').resolves(null)

      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [
          {
            address: '0xdao',
            topics: ['0xtopic1', '0xtopic2'],
          },
          {
            address: '0xplugin',
            topics: ['0xtopic3', '0xproposal456'],
          },
        ],
      } as any)

      const findLogsByNameStub = sandbox.stub(Web3Utils, 'findLogsByName')
      findLogsByNameStub.withArgs(sinon.match.any, 'Executed', DAO.abi).returns([
        {
          txLog: { address: '0xexecutedAddress' },
        },
      ] as any)
      findLogsByNameStub.withArgs(sinon.match.any, 'ProposalExecuted', Multisig.abi).returns([
        {
          txLog: { address: '0xpluginAddress', topics: ['0xtopic', '0x456'] },
        },
      ] as any)

      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockToken as any)
      const fetchHistoricalTokenPriceStub = sandbox.stub(ProxyWeb3Provider, 'fetchHistoricalTokenPrice').resolves('0')
      // Execute
      await DaoTransactions.saveTransaction(mockTx, ITransactionType.deposit, mockDao.address, mockDao.network)

      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getTransactionReceiptStub.calledOnce).to.be.true
      expect(findLogsByNameStub.calledTwice).to.be.true
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(fetchHistoricalTokenPriceStub.calledOnce).to.be.true

      const dbTxs = await Models.Transaction.find({})
      expect(dbTxs.length).to.equal(1)
      expect(dbTxs[0].transactionHash).to.equal(mockTx.hash)
      expect(dbTxs[0].uniqueId).to.equal(mockTx.uniqueId)
      expect(dbTxs[0].blockNumber).to.equal(Number(mockTx.blockNum))
      expect(dbTxs[0].blockTimestamp).to.equal(mockTx.blockTimestamp)
      expect(dbTxs[0].network).to.equal(mockDao.network)
      expect(dbTxs[0].type).to.equal(ITransactionType.deposit)
      expect(dbTxs[0].daoAddress).to.equal('0xexecutedAddress')
      expect(dbTxs[0].pluginAddress).to.equal('0xpluginAddress')
      expect(dbTxs[0].fromAddress).to.equal(mockTx.from)
      expect(dbTxs[0].toAddress).to.equal(mockTx.to)
      expect(dbTxs[0].proposalIndex).to.equal('0x456')
      expect(dbTxs[0].tokenAddress).to.equal(utils.zeroAddress)
    })
  })

  describe('parseTransactionFromProposalAction', () => {
    it('should handle multiple actions: existing, new, and error cases', async () => {
      const mockProposal = {
        id: 'proposal-123',
        proposalIndex: '1',
        daoAddress: '0xdao',
        pluginAddress: '0xplugin',
        network: NetworksEnum.baseMainnet,
        executed: {
          transactionHash: '0xtxhash',
          blockNumber: 1500,
          blockTimestamp: 1623456789,
        },
        rawActions: [
          { to: '0xrecipient1', value: '1000000000000000000', from: '0xaction1' }, // Will already exist (1 ETH)
          { to: '0xrecipient2', value: '2000000000000000000', from: '0xaction2' }, // Will be saved (2 ETH)
          { to: '0xrecipient3', value: '3000000000000000000', from: '0xaction3' }, // Will fail (3 ETH)
        ],
      }

      const mockNativeToken = {
        address: utils.zeroAddress,
        symbol: 'ETH',
        name: 'Ethereum',
        type: ITokenType.native,
        logo: null,
        decimals: 18,
      }

      // Create an existing transaction first with the correct uniqueId pattern
      const existingTx = await Models.Transaction.create({
        transactionHash: '0xtxhash',
        uniqueId: 'proposal-123-0', // Using proposal.id-index pattern
        network: NetworksEnum.baseMainnet,
        category: ITransactionCategory.Internal,
        blockNumber: 1500,
        blockTimestamp: 1623456789,
        type: ITransactionType.withdraw,
        daoAddress: '0xdao',
        fromAddress: '0xaction1',
        toAddress: '0xrecipient1',
        value: '1000000000000000000',
      })

      // Stub for findOne - first call returns existing, others return null
      const findOneStub = sandbox.stub(Models.Transaction, 'findOne')
      findOneStub.withArgs({ uniqueId: 'proposal-123-0' }).resolves(existingTx) // First action already exists
      findOneStub.withArgs({ uniqueId: 'proposal-123-1' }).resolves(null) // Second action doesn't exist
      findOneStub.withArgs({ uniqueId: 'proposal-123-2' }).resolves(null) // Third action doesn't exist

      // Token stub - always returns the native token
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockNativeToken as any)

      // Price fetch stub - fails on second call (which is the third action)
      const fetchHistoricalTokenPriceStub = sandbox.stub(ProxyWeb3Provider, 'fetchHistoricalTokenPrice')
      fetchHistoricalTokenPriceStub.onFirstCall().resolves('2000') // For second action
      fetchHistoricalTokenPriceStub.onSecondCall().rejects(new Error('Price fetch failed')) // For third action

      // Logger stubs
      const verboseLoggerStub = sandbox.stub(logger, 'verbose')
      const errorLoggerStub = sandbox.stub(logger, 'error')

      // Execute
      await DaoTransactions.parseTransactionFromProposalAction(mockProposal as any)

      // Verify stubs were called correctly
      expect(findOneStub.callCount).to.equal(3)
      expect(saveAndGetTokenStub.callCount).to.equal(2) // Not called for existing transaction
      expect(fetchHistoricalTokenPriceStub.callCount).to.equal(2) // Called for second and third actions

      // Verify logger calls for first action (existing transaction)
      const firstActionLog = verboseLoggerStub.args[0] as any
      expect(firstActionLog[0]).to.equal('Manual internal transaction already exists')
      expect(firstActionLog[1]).to.include({
        uniqueId: 'proposal-123-0',
        logId: existingTx.id,
      })

      // Verify logger calls for second action (successful save)
      const secondActionLog = verboseLoggerStub.args[1] as any
      expect(secondActionLog[0]).to.equal('New Transaction')
      // The logId will be the MongoDB _id of the saved transaction
      expect(secondActionLog[1]).to.have.property('logId')
      expect(secondActionLog[1].logId).to.exist

      // Verify error logger for third action (error case)
      expect(errorLoggerStub.callCount).to.equal(1)
      const errorLog = errorLoggerStub.args[0] as any
      expect(errorLog[0]).to.equal('Error saveTransaction')
      expect(errorLog[1]).to.include({
        uniqueId: 'proposal-123-2',
      })
      expect(errorLog[1]).to.have.property('error')
      expect(errorLog[1].error.message).to.equal('Price fetch failed')

      // Verify database state - we should have 2 transactions (1 existing + 1 new)
      const dbTxs = await Models.Transaction.find({}).sort({ uniqueId: 1 })
      expect(dbTxs.length).to.equal(2)

      // The first transaction is the existing one we created
      expect(dbTxs[0].uniqueId).to.equal('proposal-123-0')
      expect(dbTxs[0].toAddress).to.equal('0xrecipient1')

      // Verify the newly saved transaction details (second transaction)
      const savedTx = dbTxs[1]
      expect(savedTx.transactionHash).to.equal('0xtxhash')
      expect(savedTx.uniqueId).to.equal('proposal-123-1')
      expect(savedTx.blockNumber).to.equal(1500)
      expect(savedTx.blockTimestamp).to.equal(1623456789)
      expect(savedTx.network).to.equal(NetworksEnum.baseMainnet)
      expect(savedTx.type).to.equal(ITransactionType.withdraw)
      expect(savedTx.daoAddress).to.equal('0xdao')
      expect(savedTx.pluginAddress).to.equal('0xplugin')
      expect(savedTx.fromAddress).to.equal('0xdao')
      expect(savedTx.toAddress).to.equal('0xrecipient2')
      expect(savedTx.value).to.equal('2000000000000000000')
      expect(savedTx.category).to.equal(ITransactionCategory.Internal)
      expect(savedTx.proposalIndex).to.equal('1')
      expect(savedTx.tokenAddress).to.equal(utils.zeroAddress)

      // Verify amountUsd calculation: (2000000000000000000 / 10^18) * 2000 = 4000.00
      expect(savedTx.amountUsd).to.equal('4000.00')

      expect(savedTx.token).to.deep.include({
        network: NetworksEnum.baseMainnet,
        address: utils.zeroAddress,
        symbol: 'ETH',
        name: 'Ethereum',
        type: ITokenType.native,
        decimals: 18,
      })
      expect(savedTx.token.snapshot).to.deep.include({
        priceUsd: '2000',
        priceUpdatedAt: 1623456789,
      })
    })
  })
})
