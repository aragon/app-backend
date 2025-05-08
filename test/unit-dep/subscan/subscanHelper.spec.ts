import { expect } from 'chai'
import SubscanApiHelper from '@helpers/subscanApi'
import { NetworksEnum } from '@types'
import logger from '@logger'

describe.skip('Subscan Integration Tests', function () {
  this.timeout(30000)

  describe('token holders', function () {
    const testTokens = {
      token1: '0x1111111111166b7FE7bd91427724B487980aFc69',
      token2: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    }

    const network = NetworksEnum.peaqMainnet

    before(function () {
      const networkConfig = SubscanApiHelper._parseNetworkToConfig(network)
      if (!networkConfig?.SUBSCAN_API_URL) {
        logger.warn(`Subscan API is not configured for ${network}, skipping integration tests`)
        this.skip()
      }
    })

    it('should fetch token holders for token1', async () => {
      const options = {
        pageSize: 10,
        delayMs: 500,
        startPage: 0, // Add the missing startPage property
      }

      const result = await SubscanApiHelper.getAllTokenHolders(testTokens.token1, network, options)

      expect(result).to.be.an('object')
      expect(result.holders).to.be.an('array')

      if (result.holders.length > 0) {
        const firstHolder = result.holders[0]
        expect(firstHolder).to.have.property('address').that.is.a('string')
        expect(firstHolder).to.have.property('value').that.is.a('string')
      }

      logger.info(`Fetched ${result.holders.length} holders for token1 on ${network}`, {
        hasMore: result.hasMore,
      })
    })

    it('should process each holder with callback function', async () => {
      const options = {
        pageSize: 5,
        delayMs: 500,
        startPage: 0, // Add the missing startPage property
      }

      const processedHolders: Array<{ address: string; value: string }> = []

      const callback = (holders: Array<{ address: string; value: string }>) => {
        processedHolders.push(...holders)
        logger.info(`Processing ${holders.length} holders`)
      }

      const result = await SubscanApiHelper.getAllTokenHolders(testTokens.token1, network, options, callback)

      expect(result).to.be.an('object')
      expect(result.holders).to.be.an('array')

      if (result.holders.length > 0) {
        expect(processedHolders.length).to.equal(result.holders.length)
        expect(processedHolders[0]).to.deep.equal(result.holders[0])
      }

      logger.info(`Processed ${processedHolders.length} holders through callback`)
    })

    it('should fetch token holders for token2', async () => {
      const options = {
        pageSize: 15,
        delayMs: 500,
        startPage: 0, // Add the missing startPage property
      }

      const result = await SubscanApiHelper.getAllTokenHolders(testTokens.token2, network, options)

      expect(result).to.be.an('object')
      expect(result.holders).to.be.an('array')

      logger.info(`Fetched ${result.holders.length} holders for token2 on ${network}`, {
        hasMore: result.hasMore,
      })
    })

    it('should handle non-existent tokens gracefully', async () => {
      const nonExistentToken = '0x0000000000000000000000000000000000000001'

      const result = await SubscanApiHelper.getAllTokenHolders(nonExistentToken, network)

      expect(result).to.be.an('object')
      expect(result.holders).to.be.an('array').that.is.empty
      expect(result.total).to.equal(0)
      expect(result.hasMore).to.be.false
    })

    it('should respect pagination parameters', async () => {
      const options = {
        pageSize: 5,
        delayMs: 300,
        startPage: 0, // Add the missing startPage property
      }

      const result = await SubscanApiHelper.getAllTokenHolders(testTokens.token1, network, options)

      // Just verify it doesn't crash with the pagination parameters
      expect(result).to.be.an('object')
      expect(result.holders).to.be.an('array')
    })
  })
})
