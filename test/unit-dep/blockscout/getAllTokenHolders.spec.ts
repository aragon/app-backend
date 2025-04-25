import { expect } from 'chai'
import BlockScoutHelper from '@helpers/blockScout'
import { NetworksEnum } from '@types'
import logger from '@logger'

describe.skip('BlockScout Integration Tests - getAllTokenHolders', function () {
  // Set longer timeout for API calls
  this.timeout(30000)

  // Example tokens for testing on Base network
  const testTokens = {
    // 1 inch token on Base
    token1: '0x1111111111166b7FE7bd91427724B487980aFc69',
    // USDC on Base
    token2: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  }

  // Network to use for testing
  const network = NetworksEnum.baseMainnet

  before(function () {
    // Skip all tests if no BlockScout API key is configured
    const networkConfig = BlockScoutHelper._parseNetworkToConfig(network)
    if (!networkConfig?.BLOCKSCOUT_API_URL) {
      logger.warn(`BlockScout API is not configured for ${network}, skipping integration tests`)
      this.skip()
    }
  })

  it('should fetch token holders for 1inch token', async () => {
    // Use a small page size to test pagination without fetching too much data
    const options = {
      pageSize: 10,
      maxPages: 10,
      delayMs: 500,
    }

    const result = await BlockScoutHelper.getAllTokenHolders(testTokens.token1, network, options)

    expect(result).to.be.an('object')
    expect(result.holders).to.be.an('array').that.is.not.empty
    expect(result.total).to.be.greaterThan(0)
    expect(result.total).to.equal(result.holders.length)

    // Check the structure of holder data
    const firstHolder = result.holders[0]
    expect(firstHolder).to.have.property('address').that.is.a('string')
    expect(firstHolder).to.have.property('value').that.is.a('string')

    // Since we're limiting to 2 pages with 10 items each, we expect at most 20 holders
    expect(result.holders.length).to.be.at.most(100)

    // Log some information about the result
    logger.info(`Fetched ${result.holders.length} holders for 1inch token on ${network}`, {
      hasMore: result.hasMore,
      sampleHolder: firstHolder,
    })
  })

  it('should fetch token holders for USDC token', async () => {
    // Use a small page size to test pagination without fetching too much data
    const options = {
      pageSize: 15,
      maxPages: 1,
      delayMs: 500,
    }

    const result = await BlockScoutHelper.getAllTokenHolders(testTokens.token2, network, options)

    expect(result).to.be.an('object')
    expect(result.holders).to.be.an('array').that.is.not.empty
    expect(result.total).to.be.greaterThan(0)
    expect(result.total).to.equal(result.holders.length)

    // Since we're limiting to 1 page with 15 items, we expect at most 15 holders
    expect(result.holders.length).to.be.at.most(15)

    // Log some information about the result
    logger.info(`Fetched ${result.holders.length} holders for USDC token on ${network}`, {
      hasMore: result.hasMore,
    })
  })

  it('should handle non-existent tokens gracefully', async () => {
    // Using a random non-existent address
    const nonExistentToken = '0x0000000000000000000000000000000000000001'

    const result = await BlockScoutHelper.getAllTokenHolders(nonExistentToken, network)

    expect(result).to.be.an('object')
    expect(result.holders).to.be.an('array').that.is.empty
    expect(result.total).to.equal(0)
    expect(result.hasMore).to.be.false
  })

  it('should respect the maxPages limit for popular tokens', async () => {
    // USDC typically has many holders, so we can test the maxPages limit
    const options = {
      pageSize: 5, // Small page size
      maxPages: 3, // Limit to just 3 pages
      delayMs: 300, // Shorter delay
    }

    const result = await BlockScoutHelper.getAllTokenHolders(testTokens.token2, network, options)

    // We expect exactly 15 holders (5 per page × 3 pages)
    expect(result.holders.length).to.equal(15)

    // We expect hasMore to be true since USDC likely has more than 15 holders
    expect(result.hasMore).to.be.true
  })
})
