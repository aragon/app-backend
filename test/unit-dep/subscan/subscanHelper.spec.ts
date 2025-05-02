import { expect } from 'chai'
import SubscanApiHelper from '@helpers/subscanApi'
import { NetworksEnum } from '@types'
import logger from '@logger'

describe.skip('Subscan Integration Tests - getAllTokenHolders', function () {
  this.timeout(30000) // Extended timeout for API calls

  const testTokens = {
    // Example tokens on Peaq Network - replace with actual token addresses from the network you're testing
    token1: '0x5c3126bfb9a68a7021d461230127470b3824886b', // Example ERC20 token
    token2: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Example ERC20 token
  }

  // Define the network to test - use the appropriate network for Subscan
  const network = NetworksEnum.peaqMainnet

  before(function () {
    const networkConfig = SubscanApiHelper._parseNetworkToConfig(network)
    if (!networkConfig?.SUBSCAN_API_URL) {
      logger.warn(`Subscan API is not configured for ${network}, skipping integration tests`)
      this.skip()
    }
  })

  it('should fetch token holders for a token', async () => {
    const options = {
      pageSize: 10,
      maxPages: 1,
      delayMs: 500,
    }

    const result = await SubscanApiHelper.getAllTokenHolders(testTokens.token1, network, options)

    expect(result).to.be.an('object')
    expect(result.holders).to.be.an('array')
    if (result.holders.length > 0) {
      expect(result.total).to.be.greaterThan(0)

      const firstHolder = result.holders[0]
      expect(firstHolder).to.have.property('address').that.is.a('string')
      expect(firstHolder).to.have.property('value').that.is.a('string')

      expect(result.holders.length).to.be.at.most(10)

      logger.info(`Fetched ${result.holders.length} holders for token on ${network}`, {
        hasMore: result.hasMore,
        sampleHolder: firstHolder,
      })
    } else {
      logger.info(`No holders found for token ${testTokens.token1} on ${network}`)
    }
  })

  it('should process each holder with callback function', async () => {
    const options = {
      pageSize: 5,
      maxPages: 1,
      delayMs: 500,
    }

    const processedHolders: Array<{ address: string; value: string }> = []

    const callback = (holder: { address: string; value: string }) => {
      processedHolders.push(holder)
      logger.info(`Processing holder: ${holder.address}`)
    }

    const result = await SubscanApiHelper.getAllTokenHolders(testTokens.token1, network, options, callback)

    expect(result).to.be.an('object')

    if (result.holders.length > 0) {
      expect(result.holders).to.be.an('array').that.is.not.empty
      expect(processedHolders.length).to.equal(result.holders.length)
      expect(processedHolders[0]).to.deep.equal(result.holders[0])
      logger.info(`Processed ${processedHolders.length} holders through callback`)
    } else {
      logger.info(`No holders to process for token ${testTokens.token1}`)
    }
  })

  it('should fetch token holders for second token', async () => {
    const options = {
      pageSize: 15,
      maxPages: 1,
      delayMs: 500,
    }

    const result = await SubscanApiHelper.getAllTokenHolders(testTokens.token2, network, options)

    expect(result).to.be.an('object')

    if (result.holders.length > 0) {
      expect(result.holders).to.be.an('array').that.is.not.empty
      expect(result.total).to.be.greaterThan(0)
      expect(result.holders.length).to.be.at.most(15)

      logger.info(`Fetched ${result.holders.length} holders for second token on ${network}`, {
        hasMore: result.hasMore,
      })
    } else {
      logger.info(`No holders found for token ${testTokens.token2} on ${network}`)
    }
  })

  it('should handle non-existent tokens gracefully', async () => {
    const nonExistentToken = '0x0000000000000000000000000000000000000001'

    const result = await SubscanApiHelper.getAllTokenHolders(nonExistentToken, network)

    expect(result).to.be.an('object')
    expect(result.holders).to.be.an('array').that.is.empty
    expect(result.total).to.equal(0)
    expect(result.hasMore).to.be.false
  })

  it('should respect the maxPages limit for popular tokens', async () => {
    const options = {
      pageSize: 5,
      maxPages: 3,
      delayMs: 300,
    }

    const result = await SubscanApiHelper.getAllTokenHolders(testTokens.token1, network, options)

    // If the token has more than 15 holders, we should hit the maxPages limit
    if (result.total > 15) {
      expect(result.holders.length).to.equal(15) // 5 holders per page × 3 pages
      expect(result.hasMore).to.be.true
    } else {
      // If the token has fewer holders, we should get all of them
      expect(result.holders.length).to.equal(result.total)
      expect(result.hasMore).to.be.false
    }
  })
})
