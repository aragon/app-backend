import { expect } from 'chai'
import BlockScoutHelper from '@helpers/blockScout'
import { NetworksEnum } from '@types'
import logger from '@logger'

describe.skip('BlockScout Integration Tests - getAllTokenHolders', function () {
  this.timeout(30000)

  const testTokens = {
    token1: '0x1111111111166b7FE7bd91427724B487980aFc69',
    token2: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  }

  const network = NetworksEnum.baseMainnet

  before(function () {
    const networkConfig = BlockScoutHelper._parseNetworkToConfig(network)
    if (!networkConfig?.BLOCKSCOUT_API_URL) {
      logger.warn(`BlockScout API is not configured for ${network}, skipping integration tests`)
      this.skip()
    }
  })

  it('should fetch token holders for 1inch token', async () => {
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

    const firstHolder = result.holders[0]
    expect(firstHolder).to.have.property('address').that.is.a('string')
    expect(firstHolder).to.have.property('value').that.is.a('string')

    expect(result.holders.length).to.be.at.most(100)

    logger.info(`Fetched ${result.holders.length} holders for 1inch token on ${network}`, {
      hasMore: result.hasMore,
      sampleHolder: firstHolder,
    })
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

    const result = await BlockScoutHelper.getAllTokenHolders(testTokens.token1, network, options, callback)

    expect(result).to.be.an('object')
    expect(result.holders).to.be.an('array').that.is.not.empty

    expect(processedHolders.length).to.equal(result.holders.length)
    expect(processedHolders[0]).to.deep.equal(result.holders[0])

    logger.info(`Processed ${processedHolders.length} holders through callback`)
  })

  it('should fetch token holders for USDC token', async () => {
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

    expect(result.holders.length).to.be.at.most(15)

    logger.info(`Fetched ${result.holders.length} holders for USDC token on ${network}`, {
      hasMore: result.hasMore,
    })
  })

  it('should handle non-existent tokens gracefully', async () => {
    const nonExistentToken = '0x0000000000000000000000000000000000000001'

    const result = await BlockScoutHelper.getAllTokenHolders(nonExistentToken, network)

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

    const result = await BlockScoutHelper.getAllTokenHolders(testTokens.token2, network, options)

    expect(result.holders.length).to.equal(15)
    expect(result.hasMore).to.be.true
  })
})
