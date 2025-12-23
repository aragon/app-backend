import TransactionController from '@api/controllers/transaction'
import { Models } from '@dbModels'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { daoForDaoTransactions } from '@test/mock/daoTransactions/dao'
import { pluginForDaoTransactions } from '@test/mock/daoTransactions/plugin'
import { proposalForDaoTransactions } from '@test/mock/daoTransactions/proposal'
import { ITransactionSide, ITransactionType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe.skip('Integration: DAO Transaction Service', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it.skip('should process all DAO transfer types with proper unique IDs and values', async function () {
    this.timeout(600000)

    /**
     * TEST PLAN - Complete verification of all transfer types:
     *
     * INCOMING TRANSFERS (Deposits):
     * - Expected: 35 ERC20 transfers to the DAO
     * - Expected: 8 native ETH deposits
     * - Expected: 3 NFT/ERC721 transfers
     *
     * OUTGOING TRANSFERS (Withdrawals):
     * - Expected: 26 ERC20 transfers from DAO
     * - Expected: 2 native ETH withdrawals (from batch Executed events with actionIndex)
     * - Expected: 1 NFT/ERC721 transfer from DAO
     *
     * TOTAL: 75 transactions matching Etherscan data
     */

    // Populate the database
    const dao = daoForDaoTransactions[0]
    await Promise.all(daoForDaoTransactions.map(async dao => Models.Dao.create(dao)))
    await Promise.all(pluginForDaoTransactions.map(async plugin => Models.Plugin.create(plugin)))
    await Promise.all(proposalForDaoTransactions.map(async proposal => Models.Proposal.create(proposal)))

    console.log(`Starting to fetch transactions for DAO ${dao.address} from block ${dao.blockNumber}...`)
    console.log('Network:', dao.network)
    console.log('Testing only native outgoing transfers (other crawlers disabled)')
    console.log('Block range limited to 50k blocks')

    // Run the actual DaoTransactions service with timeout
    const startTime = Date.now()
    try {
      await DaoTransactions.start({
        daoAddress: dao.address,
        network: dao.network as NetworksEnum,
      })
      console.log(`DaoTransactions.start completed in ${Date.now() - startTime}ms`)
    } catch (error) {
      console.error('Error in DaoTransactions.start:', error)
      throw error
    }

    // Query the database for saved transactions
    const allTxs = await Models.Transaction.find({
      daoAddress: dao.address,
      network: dao.network,
    })

    console.log(`\n=== Found ${allTxs.length} total transactions in database ===\n`)

    // Check for duplicate transaction hashes
    const txHashGroups = allTxs.reduce((acc: any, tx) => {
      if (!acc[tx.transactionHash]) acc[tx.transactionHash] = []
      acc[tx.transactionHash].push(tx)
      return acc
    }, {})

    const duplicateHashes = Object.keys(txHashGroups).filter(hash => txHashGroups[hash].length > 1)
    if (duplicateHashes.length > 0) {
      console.log(`\n⚠️  Found ${duplicateHashes.length} transaction hashes with multiple records:`)
      duplicateHashes.forEach(hash => {
        const txs = txHashGroups[hash]
        console.log(`  Hash: ${hash}`)
        txs.forEach((tx: any) => {
          console.log(`    - ID: ${tx.id}, actionIndex: ${tx.actionIndex}`)
        })
      })
    }

    // Filter by transaction type and token type
    const depositTxs = allTxs.filter(tx => tx.side === ITransactionSide.deposit)
    const withdrawTxs = allTxs.filter(tx => tx.side === ITransactionSide.withdraw)

    const erc20Deposits = depositTxs.filter(
      tx => tx.tokenAddress !== '0x0000000000000000000000000000000000000000' && !tx.erc721TokenId,
    )
    const erc20Withdraws = withdrawTxs.filter(
      tx => tx.tokenAddress !== '0x0000000000000000000000000000000000000000' && !tx.erc721TokenId,
    )
    const nativeDeposits = depositTxs.filter(tx => tx.tokenAddress === '0x0000000000000000000000000000000000000000')
    const nativeWithdraws = withdrawTxs.filter(tx => tx.tokenAddress === '0x0000000000000000000000000000000000000000')
    const erc721Deposits = depositTxs.filter(tx => tx.erc721TokenId || tx.tokenId)
    const erc721Withdraws = withdrawTxs.filter(tx => tx.erc721TokenId || tx.tokenId)

    console.log('Breakdown by type:')
    console.log('INCOMING (Deposits):')
    console.log(`  ERC20 deposits: ${erc20Deposits.length} (expected: 35)`)
    console.log(`  Native deposits: ${nativeDeposits.length} (expected: 8)`)
    console.log(`  ERC721 deposits: ${erc721Deposits.length} (expected: 3)`)

    // Log all transactions that have NFT characteristics
    const nftLikeTxs = allTxs.filter(
      tx => tx.type === 'erc721' || tx.erc721TokenId || tx.tokenId || tx.id.includes('-nft-'),
    )
    console.log(`\nAll NFT-like transactions found: ${nftLikeTxs.length}`)
    nftLikeTxs.forEach((tx, i) => {
      console.log(`  NFT ${i}:`)
      console.log(`    ID: ${tx.id}`)
      console.log(`    Hash: ${tx.transactionHash}`)
      console.log(`    Token Address: ${tx.tokenAddress}`)
      console.log(`    Token ID: ${tx.tokenId}`)
      console.log(`    Value: ${tx.value} (should be 1 for NFTs)`)
      console.log(`    Side: ${tx.side}`)
      console.log(`    Type: ${tx.type}`)
    })
    console.log('\nOUTGOING (Withdrawals):')
    console.log(`  ERC20 withdrawals: ${erc20Withdraws.length} (expected: 26)`)
    console.log(`  Native withdrawals: ${nativeWithdraws.length} (expected: 2)`)
    console.log(`  ERC721 withdrawals: ${erc721Withdraws.length} (expected: 1)`)
    console.log(`  Total outgoing: ${withdrawTxs.length} (expected: 29)`)

    // Show sample ERC20 deposits for debugging
    // Display NFT transfer details
    if (nftLikeTxs.length > 0) {
      console.log('\n=== NFT Transfer Details ===')
      const ensNFTs = nftLikeTxs.filter(tx => tx.tokenAddress === '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85')
      const dripsNFTs = nftLikeTxs.filter(tx => tx.tokenAddress === '0xcf9c49B0962EDb01Cdaa5326299ba85D72405258')

      console.log(`ENS NFTs: ${ensNFTs.length}`)
      ensNFTs.forEach((tx, i) => {
        console.log(
          `  ${i + 1}. ${tx.side === 'deposit' ? 'IN' : 'OUT'} - Hash: ${tx.transactionHash.substring(0, 10)}... TokenID: ${tx.tokenId.substring(0, 20)}...`,
        )
      })

      console.log(`Drips NFTs: ${dripsNFTs.length}`)
      dripsNFTs.forEach((tx, i) => {
        console.log(
          `  ${i + 1}. ${tx.side === 'deposit' ? 'IN' : 'OUT'} - Hash: ${tx.transactionHash.substring(0, 10)}... TokenID: ${tx.tokenId.substring(0, 20)}...`,
        )
      })
    }

    if (erc20Deposits.length > 0) {
      console.log('\nSample ERC20 deposits:')
      erc20Deposits.slice(0, 3).forEach((tx, i) => {
        console.log(`\n  ${i + 1}. Transaction:`)
        console.log(`     ID: ${tx.id}`)
        console.log(`     Hash: ${tx.transactionHash}`)
        console.log(`     Token: ${tx.tokenAddress}`)
        console.log(`     Symbol: ${tx.token?.symbol || 'N/A'}`)
        console.log(`     Value: ${tx.value}`)
        console.log(`     Decimals: ${tx.token?.decimals}`)
      })
    }

    // Show sample outgoing transfers if any
    if (withdrawTxs.length > 0) {
      console.log('\nSample outgoing transfers:')
      withdrawTxs.slice(0, 3).forEach((tx, i) => {
        console.log(`\n  ${i + 1}. Transaction:`)
        console.log(`     ID: ${tx.id}`)
        console.log(`     Hash: ${tx.transactionHash}`)
        console.log(`     Type: ${tx.type}`)
        console.log(`     Token: ${tx.tokenAddress}`)
        console.log(`     Symbol: ${tx.token?.symbol || 'N/A'}`)
        console.log(`     Value: ${tx.value}`)
      })
    }

    // Additional validation
    console.log(`\n=== Validating all transfers ===`)

    // Verify incoming transfers
    expect(erc20Deposits.length, 'Should have at least 30 ERC20 deposits').to.be.at.least(30)
    expect(nativeDeposits.length, 'Should have 8 native deposits').to.equal(8)
    expect(erc721Deposits.length, 'Should have at least 1 ERC721 deposit').to.be.at.least(1)

    // Verify outgoing transfers
    expect(withdrawTxs.length, 'Should have outgoing transfers').to.be.greaterThan(5)

    // Verify each ERC20 deposit has correct properties
    erc20Deposits.forEach((tx: any, index: number) => {
      expect(tx.id).to.match(/-\d+-erc20/i, `ERC20 tx[${index}] should have correct ID format`)
      expect(tx.side).to.equal(ITransactionSide.deposit)
      expect(tx.type).to.equal(ITransactionType.erc20)
      expect(tx.toAddress.toLowerCase()).to.equal(dao.address.toLowerCase())
      expect(tx.token).to.exist
      expect(tx.token.type.toLowerCase()).to.equal('erc20')
      expect(tx.value).to.exist.and.not.equal('0', `ERC20 tx[${index}] should have non-zero value`)
      expect(tx.token.decimals).to.be.a('number').and.be.at.least(0)
      expect(tx.blockNumber).to.be.a('number').and.be.greaterThan(0)
      expect(tx.blockTimestamp).to.be.a('number').and.be.greaterThan(0)
    })

    // Verify native deposits have correct properties
    nativeDeposits.forEach((tx: any, index: number) => {
      expect(tx.id).to.match(/-native($|-action\d+$)/, `Native tx[${index}] should have correct ID format`)
      expect(tx.side).to.equal(ITransactionSide.deposit)
      expect(tx.type).to.equal(ITransactionType.native)
      expect(tx.toAddress.toLowerCase()).to.equal(dao.address.toLowerCase())
      expect(tx.tokenAddress).to.equal('0x0000000000000000000000000000000000000000')
      expect(tx.value).to.exist.and.not.equal('0', `Native tx[${index}] should have non-zero value`)
    })

    // Verify native withdrawals (from Executed events) have actionIndex for batch transactions
    const nativeWithdrawsWithActionIndex = nativeWithdraws.filter((tx: any) => tx.actionIndex !== null)
    if (nativeWithdrawsWithActionIndex.length > 0) {
      console.log(`\\nFound ${nativeWithdrawsWithActionIndex.length} native withdrawals from batch Executed events`)
      nativeWithdrawsWithActionIndex.forEach((tx: any, index: number) => {
        console.log(`  Native withdraw ${index}: ID="${tx.id}", actionIndex=${tx.actionIndex}`)
        expect(tx.id).to.match(/-native-action\d+$/, `Batch native tx[${index}] should have actionIndex in ID`)
        expect(tx.actionIndex).to.be.a('number').and.be.at.least(0)
      })
    }

    // Verify transaction counts match expected values
    expect(allTxs.length, 'Total transaction count').to.equal(75)
    expect(erc20Deposits.length, 'ERC20 deposits count').to.equal(35)
    expect(erc20Withdraws.length, 'ERC20 withdrawals count').to.equal(26)
    expect(nativeDeposits.length, 'Native deposits count').to.equal(8)
    expect(nativeWithdraws.length, 'Native withdrawals count').to.equal(2)
    expect(erc721Deposits.length, 'ERC721/NFT deposits count').to.equal(3)
    expect(erc721Withdraws.length, 'ERC721/NFT withdrawals count').to.equal(1)

    // Verify NFT transaction properties
    console.log('\n=== Validating NFT transaction properties ===')
    const expectedNFTHashes = [
      '0x12fd7572658c41a2e992ce9efeded62c94b660e9af4b453ae1d086b26eb3b859', // ENS deposit
      '0x2fbae4cdbbc22ec0ac0bfa3dbf2404512b56859f8530c7e877eb689c0385eda3', // ENS withdrawal
      '0x68717f5102ed000e69147e9857b378e5a2ce33118a53c77aad07805da5b9a120', // Drips deposit
      '0x2df1f876556902e7b9d50d478a9bcf8ad50bccb00738cdae3e1383676923c8d4', // ENS deposit
    ]

    nftLikeTxs.forEach((tx: any) => {
      // Verify NFT value is always '1'
      expect(tx.value, `NFT ${tx.transactionHash} should have value='1'`).to.equal('1')

      // Verify NFT type
      expect(tx.type, `NFT ${tx.transactionHash} should have type='erc721'`).to.equal('erc721')

      // Verify token ID exists
      expect(tx.tokenId, `NFT ${tx.transactionHash} should have a tokenId`).to.exist
      expect(tx.erc721TokenId, `NFT ${tx.transactionHash} should have an erc721TokenId`).to.exist
      expect(tx.tokenId, `NFT ${tx.transactionHash} tokenId should match erc721TokenId`).to.equal(tx.erc721TokenId)

      // Verify transaction hash is one of the expected
      expect(expectedNFTHashes, `NFT ${tx.transactionHash} should be one of the expected NFT transactions`).to.include(
        tx.transactionHash,
      )

      // Verify side (deposit or withdraw)
      expect(['deposit', 'withdraw'], `NFT ${tx.transactionHash} should have valid side`).to.include(tx.side)

      // Verify token addresses
      const validNFTContracts = [
        '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85', // ENS
        '0xcf9c49B0962EDb01Cdaa5326299ba85D72405258', // Drips
      ]
      expect(validNFTContracts, `NFT ${tx.transactionHash} should be from a known NFT contract`).to.include(
        tx.tokenAddress,
      )

      // Verify ID format includes 'nft'
      expect(tx.id, `NFT ${tx.transactionHash} ID should contain '-nft-'`).to.include('-nft-')
    })

    console.log('✓ All NFT transactions have correct properties')

    // Verify unique IDs
    const allIds = allTxs.map((tx: any) => tx.id)
    const uniqueIds = new Set(allIds)
    expect(uniqueIds.size, 'All transactions should have unique IDs').to.equal(allIds.length)

    // Test TransactionController.getTransactionsWithPagination
    console.log('\n=== Testing TransactionController.getTransactionsWithPagination ===')

    // Test with DAO filter
    const txsResult = await TransactionController.getTransactionsWithPagination(
      { pageSize: 100, page: 1, order: 'desc' },
      { daoAddress: dao.address, network: dao.network as NetworksEnum },
    )

    console.log(`Controller returned ${txsResult.data.length} transactions`)
    console.log(`Total records: ${txsResult.metadata.totalRecords}`)
    console.log(`Total pages: ${txsResult.metadata.totalPages}`)

    // Verify pagination metadata
    expect(txsResult.metadata.totalRecords, 'Controller should return all 75 transactions').to.equal(75)
    expect(txsResult.data.length, 'Controller should return all transactions with limit 100').to.equal(75)
    expect(txsResult.metadata.page, 'Should be on page 1').to.equal(1)
    expect(txsResult.metadata.pageSize, 'Page size should match requested limit').to.equal(100)

    // Test pagination with smaller page size
    const paginatedTxsResult = await TransactionController.getTransactionsWithPagination(
      { pageSize: 10, page: 2, order: 'desc' },
      { daoAddress: dao.address, network: dao.network as NetworksEnum },
    )

    console.log(`\nPaginated test - Page 2 with limit 10:`)
    console.log(`  Returned ${paginatedTxsResult.data.length} transactions`)
    console.log(`  Current page: ${paginatedTxsResult.metadata.page}`)

    expect(paginatedTxsResult.data.length, 'Page 2 should have 10 transactions').to.equal(10)
    expect(paginatedTxsResult.metadata.page, 'Should be on page 2').to.equal(2)
    expect(paginatedTxsResult.metadata.totalPages, 'Should have 8 total pages (75/10)').to.equal(8)

    // Test filtering by transaction type
    const erc20Txs = await TransactionController.getTransactionsWithPagination({ pageSize: 100, page: 1 }, {
      daoAddress: dao.address,
      network: dao.network as NetworksEnum,
      type: ITransactionType.erc20,
    } as any)

    console.log(`\nFiltered by ERC20 type:`)
    console.log(`  Returned ${erc20Txs.data.length} ERC20 transactions`)
    expect(erc20Txs.data.length, 'Should return 61 ERC20 transactions').to.equal(61)

    // Test filtering by transaction side
    const depositTxsFromController = await TransactionController.getTransactionsWithPagination(
      { pageSize: 100, page: 1 },
      { daoAddress: dao.address, network: dao.network as NetworksEnum, side: ITransactionSide.deposit } as any,
    )

    console.log(`\nFiltered by deposits:`)
    console.log(`  Returned ${depositTxsFromController.data.length} deposit transactions`)
    expect(
      depositTxsFromController.data.length,
      'Should return 46 deposit transactions (35 ERC20 + 8 native + 3 NFT)',
    ).to.equal(46)

    // Test NFT transactions via controller
    const nftTxs = await TransactionController.getTransactionsWithPagination({ pageSize: 100, page: 1 }, {
      daoAddress: dao.address,
      network: dao.network as NetworksEnum,
      type: ITransactionType.erc721,
    } as any)

    console.log(`\nFiltered by NFT/ERC721 type:`)
    console.log(`  Returned ${nftTxs.data.length} NFT transactions`)
    expect(nftTxs.data.length, 'Should return 4 NFT transactions').to.equal(4)

    // Verify NFT data structure from controller
    nftTxs.data.forEach((nft: any) => {
      expect(nft.type, 'NFT from controller should have type=erc721').to.equal('erc721')
      expect(nft.value, 'NFT from controller should have value=1').to.equal('1')
      expect(nft.tokenId || nft.erc721TokenId, 'NFT from controller should have tokenId').to.exist
      // Note: filterKeys() removes some fields, so we check what's available
      expect(nft.transactionHash, 'NFT from controller should have transactionHash').to.exist
      expect(nft.blockNumber, 'NFT from controller should have blockNumber').to.exist
    })

    console.log('✓ TransactionController.getTransactionsWithPagination works correctly')

    console.log('\n=== All assertions passed! ===')
  })
})
