import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { removeDaoTransactionsMigration } from '@src/migrations/20250828132611-removeDaoTransactions'
import { NetworksEnum, ITransactionSide, ITransactionType, ITokenType } from '@types'

describe('Migration: removeDaoTransactions', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    // Clean up before each test
    await Models.Transaction.deleteMany({})
    await Models.ConfigIndexer.deleteMany({})
  })

  afterEach(async () => {
    sandbox?.restore()
    // Clean up after each test
    await Models.Transaction.deleteMany({})
    await Models.ConfigIndexer.deleteMany({})
  })

  it('should delete all Transaction records from database', async () => {
    // Arrange - Create test transactions
    const testTransactions = [
      {
        id: 'dao1-ethereum-mainnet-0xabc123-0-erc20-0xtoken1',
        transactionHash: '0xabc123',
        blockNumber: 1000000,
        blockTimestamp: 1234567890,
        network: NetworksEnum.ethereumMainnet,
        side: ITransactionSide.deposit,
        type: ITransactionType.erc20,
        fromAddress: '0xfromAddress1',
        toAddress: '0xdaoAddress1',
        daoAddress: '0xdaoAddress1',
        value: '1000000000000000000',
        tokenAddress: '0xtoken1',
        token: {
          network: NetworksEnum.ethereumMainnet,
          type: ITokenType.ERC20,
          address: '0xtoken1',
          name: 'Test Token 1',
          symbol: 'TEST1',
          decimals: 18,
        },
      },
      {
        id: 'dao2-polygon-mainnet-0xdef456-0-erc721-0xnft1-123',
        transactionHash: '0xdef456',
        blockNumber: 2000000,
        blockTimestamp: 1234567900,
        network: NetworksEnum.polygonMainnet,
        side: ITransactionSide.withdraw,
        type: ITransactionType.erc721,
        fromAddress: '0xdaoAddress2',
        toAddress: '0xtoAddress2',
        daoAddress: '0xdaoAddress2',
        value: '1',
        tokenAddress: '0xnft1',
        tokenId: '123',
        token: {
          network: NetworksEnum.polygonMainnet,
          type: ITokenType.ERC721,
          address: '0xnft1',
          name: 'Test NFT',
          symbol: 'NFT1',
          decimals: 0,
        },
      },
      {
        id: 'dao3-ethereum-mainnet-0x789abc-native',
        transactionHash: '0x789abc',
        blockNumber: 3000000,
        blockTimestamp: 1234567910,
        network: NetworksEnum.ethereumMainnet,
        side: ITransactionSide.deposit,
        type: ITransactionType.native,
        fromAddress: '0xfromAddress3',
        toAddress: '0xdaoAddress3',
        daoAddress: '0xdaoAddress3',
        value: '5000000000000000000',
        tokenAddress: '0x0000000000000000000000000000000000000000',
      },
    ]

    // Create transactions in database
    await Promise.all(testTransactions.map(tx => Models.Transaction.create(tx)))

    // Verify transactions were created
    const beforeCount = await Models.Transaction.countDocuments({})
    expect(beforeCount).to.equal(3)

    // Act - Run the migration
    await removeDaoTransactionsMigration.start()

    // Assert - All transactions should be deleted
    const afterCount = await Models.Transaction.countDocuments({})
    expect(afterCount).to.equal(0)

    // Verify specific transactions are gone
    const tx1 = await Models.Transaction.findOne({ id: 'dao1-ethereum-mainnet-0xabc123-0-erc20-0xtoken1' })
    const tx2 = await Models.Transaction.findOne({ id: 'dao2-polygon-mainnet-0xdef456-0-erc721-0xnft1-123' })
    const tx3 = await Models.Transaction.findOne({ id: 'dao3-ethereum-mainnet-0x789abc-native' })

    expect(tx1).to.be.null
    expect(tx2).to.be.null
    expect(tx3).to.be.null
  })

  it('should delete ConfigIndexer entries with transaction sync patterns', async () => {
    // Arrange - Create test ConfigIndexer entries
    const testConfigs = [
      // Old format entries that should be deleted
      {
        service: 'deposit-ethereum-mainnet-0xdaoAddress1-depositTxs',
        network: NetworksEnum.ethereumMainnet,
        lastBlock: 1000000,
      },
      {
        service: 'withdraw-polygon-mainnet-0xdaoAddress2-withdrawTxs',
        network: NetworksEnum.polygonMainnet,
        lastBlock: 2000000,
      },
      {
        service: 'deposit-arbitrum-mainnet-0xdaoAddress3-depositTxs',
        network: NetworksEnum.arbitrumMainnet,
        lastBlock: 3000000,
      },
      // Other entries that should NOT be deleted
      {
        service: 'proposal-ethereum-mainnet-0xdaoAddress1',
        network: NetworksEnum.ethereumMainnet,
        lastBlock: 1500000,
      },
      {
        service: 'vote-polygon-mainnet-0xdaoAddress2',
        network: NetworksEnum.polygonMainnet,
        lastBlock: 2500000,
      },
      {
        service: 'member-ethereum-mainnet-0xdaoAddress3',
        network: NetworksEnum.ethereumMainnet,
        lastBlock: 3500000,
      },
    ]

    // Create ConfigIndexer entries in database
    await Promise.all(testConfigs.map(config => Models.ConfigIndexer.create(config)))

    // Verify all entries were created
    const beforeCount = await Models.ConfigIndexer.countDocuments({})
    expect(beforeCount).to.equal(6)

    // Act - Run the migration
    await removeDaoTransactionsMigration.start()

    // Assert - Only transaction-related configs should be deleted
    const afterCount = await Models.ConfigIndexer.countDocuments({})
    expect(afterCount).to.equal(3) // Only non-transaction configs should remain

    // Verify specific entries
    const deletedConfigs = await Models.ConfigIndexer.find({
      service: {
        $in: [
          'deposit-ethereum-mainnet-0xdaoAddress1-depositTxs',
          'withdraw-polygon-mainnet-0xdaoAddress2-withdrawTxs',
          'deposit-arbitrum-mainnet-0xdaoAddress3-depositTxs',
        ],
      },
    })
    expect(deletedConfigs).to.have.lengthOf(0)

    // Verify other entries still exist
    const remainingConfigs = await Models.ConfigIndexer.find({
      service: {
        $in: [
          'proposal-ethereum-mainnet-0xdaoAddress1',
          'vote-polygon-mainnet-0xdaoAddress2',
          'member-ethereum-mainnet-0xdaoAddress3',
        ],
      },
    })
    expect(remainingConfigs).to.have.lengthOf(3)
  })

  it('should handle empty database gracefully', async () => {
    // Arrange - Ensure database is empty
    const beforeTxCount = await Models.Transaction.countDocuments({})
    const beforeConfigCount = await Models.ConfigIndexer.countDocuments({})
    expect(beforeTxCount).to.equal(0)
    expect(beforeConfigCount).to.equal(0)

    // Act - Run the migration
    await removeDaoTransactionsMigration.start()

    // Assert - Should complete without errors
    const afterTxCount = await Models.Transaction.countDocuments({})
    const afterConfigCount = await Models.ConfigIndexer.countDocuments({})
    expect(afterTxCount).to.equal(0)
    expect(afterConfigCount).to.equal(0)
  })

  it('should delete only matching ConfigIndexer patterns', async () => {
    // Arrange - Create edge case ConfigIndexer entries
    const edgeCaseConfigs = [
      // Should be deleted (matches patterns)
      { service: 'deposit-network-dao-depositTxs', network: NetworksEnum.ethereumMainnet, lastBlock: 100 },
      { service: 'withdraw-net-addr-withdrawTxs', network: NetworksEnum.ethereumMainnet, lastBlock: 200 },

      // Should NOT be deleted (doesn't match patterns exactly)
      { service: 'depositTxs-ethereum-mainnet-dao', network: NetworksEnum.ethereumMainnet, lastBlock: 300 },
      { service: 'pre-deposit-network-dao-depositTxs', network: NetworksEnum.ethereumMainnet, lastBlock: 400 },
      { service: 'deposit-network-dao-depositTxs-extra', network: NetworksEnum.ethereumMainnet, lastBlock: 500 },
      { service: 'deposit-network-dao', network: NetworksEnum.ethereumMainnet, lastBlock: 600 },
      { service: 'withdraw-network-dao', network: NetworksEnum.ethereumMainnet, lastBlock: 700 },
    ]

    await Promise.all(edgeCaseConfigs.map(config => Models.ConfigIndexer.create(config)))

    // Act
    await removeDaoTransactionsMigration.start()

    // Assert
    const remaining = await Models.ConfigIndexer.find({})
    expect(remaining).to.have.lengthOf(5) // Only 2 should be deleted

    const deletedServices = ['deposit-network-dao-depositTxs', 'withdraw-net-addr-withdrawTxs']
    for (const service of deletedServices) {
      const found = await Models.ConfigIndexer.findOne({ service })
      expect(found).to.be.null
    }
  })

  it('should have empty stop method', async () => {
    // Act & Assert - stop method is async and returns undefined
    const result = await removeDaoTransactionsMigration.stop()
    expect(result).to.be.undefined
  })
})
