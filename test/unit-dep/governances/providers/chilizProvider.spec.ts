import { expect } from 'chai'
import ChilizProvider from '@modules/proxyProvider/chilizProvider'
import { ITokenType, NetworksEnum } from '@types'
import logger from '@logger'

describe.skip('Integ: Chiliz Provider', function () {
  this.timeout(6000000)

  const network = NetworksEnum.chilizMainnet
  const testAddresses = {
    tokenContract: '0x60f397acbcfb8f4e3234c659a3e10867e6fa6b67',
    userAddress: '0xb286A1D1102f8986b4EE2B15f8BDE2D41b668616',
    contractAddress: '0x69d8d2f6050ca02a79dc64adeb33039fde3735b9',
  }

  describe('Basic Token Info', function () {
    it('should fetch basic token info for ERC20 token', async () => {
      const tokenInfo = await ChilizProvider.fetchBasicTokenInfo({
        address: testAddresses.tokenContract,
        network,
      })

      expect(tokenInfo).to.be.an('object')
      expect(tokenInfo.address).to.equal(testAddresses.tokenContract)
      expect(tokenInfo.name).to.be.a('string')
      expect(tokenInfo.symbol).to.be.a('string')
      expect(tokenInfo.decimals).to.be.a('string')
      expect(tokenInfo.type).to.be.oneOf([ITokenType.ERC20, ITokenType.ERC721])

      logger.info('Token info fetched', {
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        decimals: tokenInfo.decimals,
        type: tokenInfo.type,
      })
    })

    it('should fetch native token info for zero address', async () => {
      const tokenInfo = await ChilizProvider.fetchBasicTokenInfo({
        address: '0x0000000000000000000000000000000000000000',
        network,
      })

      expect(tokenInfo).to.be.an('object')
      expect(tokenInfo.name).to.equal('Chiliz')
      expect(tokenInfo.symbol).to.equal('CHZ')
      expect(tokenInfo.decimals).to.equal(18)
      expect(tokenInfo.type).to.equal(ITokenType.native)
      expect(tokenInfo.priceUsd).to.be.a('string')

      logger.info('Native token info fetched', {
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        priceUsd: tokenInfo.priceUsd,
      })
    })
  })

  describe('Token Balances', function () {
    it('should fetch token balances for an address', async () => {
      const balances = await ChilizProvider.getTokenBalances({
        address: testAddresses.userAddress,
        network,
      })

      expect(balances).to.be.an('array')

      if (balances.length > 0) {
        const firstBalance = balances[0]
        expect(firstBalance).to.have.property('contractAddress').that.is.a('string')
        expect(firstBalance).to.have.property('tokenBalance').that.is.a('string')
      }

      logger.info(`Fetched ${balances.length} token balances for address`)
    })
  })

  describe('Address Transactions', function () {
    it('should fetch address transactions (ERC20 + Internal)', async () => {
      const transactions = await ChilizProvider.fetchAddressTxns({
        address: testAddresses.userAddress,
        network,
      })

      expect(transactions).to.be.an('array')

      if (transactions.length > 0) {
        const firstTx = transactions[0]
        expect(firstTx).to.have.property('from').that.is.a('string')
        expect(firstTx).to.have.property('to').that.is.a('string')
        expect(firstTx).to.have.property('value').that.is.a('string')
        expect(firstTx).to.have.property('blockNum').that.is.a('number')
        expect(firstTx).to.have.property('hash').that.is.a('string')
        expect(firstTx).to.have.property('category')
        expect(firstTx).to.have.property('rawContract').that.is.an('object')

        logger.info('First transaction details', {
          hash: firstTx.hash,
          category: firstTx.category,
          value: firstTx.value,
          tokenSymbol: firstTx.rawContract.symbol,
        })
      }

      logger.info(`Fetched ${transactions.length} transactions for address`)

      const subsequentTransactions = await ChilizProvider.fetchAddressTxns({
        address: testAddresses.userAddress,
        network,
      })

      expect(subsequentTransactions).to.be.an('array')
      expect(subsequentTransactions.length).to.equal(0)
    })
  })

  describe('Contract Information', function () {
    it('should fetch contract source code', async () => {
      const sourceCode = await ChilizProvider.fetchContractSourceCode({
        address: testAddresses.tokenContract,
        network,
      })

      if (sourceCode) {
        expect(sourceCode).to.be.an('array')
        expect(sourceCode[0]).to.have.property('SourceCode').that.is.a('string')
        expect(sourceCode[0]).to.have.property('ContractName').that.is.a('string')
        expect(sourceCode[0]).to.have.property('ABI').that.is.a('string')

        logger.info('Contract source code fetched', {
          contractName: sourceCode[0].ContractName,
          hasSourceCode: sourceCode[0].SourceCode.length > 0,
        })
      } else {
        logger.info('No source code available for this contract')
      }
    })

    it('should search contract details', async () => {
      const details = await ChilizProvider.searchDetailsOfContract({
        address: testAddresses.tokenContract,
        network,
      })

      expect(details).to.be.an('object')
      expect(details).to.have.property('type')
      expect(details).to.have.property('name')

      logger.info('Contract details', {
        type: details.type,
        name: details.name,
      })
    })
  })

  describe('Token Price', function () {
    it('should fetch CHZ native token price', async () => {
      const price = await ChilizProvider.fetchTokenPrice({
        address: '0x0000000000000000000000000000000000000000',
        network,
      })

      expect(price).to.be.an('object')
      expect(price).to.have.property('priceUsd').that.is.a('string')
      expect(parseFloat(price.priceUsd)).to.be.greaterThanOrEqual(0)

      logger.info('CHZ price fetched', { priceUsd: price.priceUsd })
    })

    it('should return zero price for ERC20 tokens', async () => {
      const price = await ChilizProvider.fetchTokenPrice({
        address: testAddresses.tokenContract,
        network,
      })

      expect(price).to.be.an('object')
      expect(price).to.have.property('priceUsd').that.is.a('string')
      expect(price.priceUsd).to.equal('0')

      logger.info('ERC20 token price (should be 0)', { priceUsd: price.priceUsd })
    })
  })

  describe('Token Counters', function () {
    it('should fetch token counters', async () => {
      const counters = await ChilizProvider.getTokenCounters({
        address: testAddresses.tokenContract,
        network,
      })

      expect(counters).to.be.an('object')
      expect(counters).to.have.property('transfers').that.is.a('number')
      expect(counters).to.have.property('holders').that.is.a('number')

      logger.info('Token counters fetched', {
        transfers: counters.transfers,
        holders: counters.holders,
      })
    })
  })

  describe('Token Holder and Supply', function () {
    it('should fetch token holder count and supply', async () => {
      const metrics = await ChilizProvider.fetchTokenHolderAndSupply({
        address: testAddresses.tokenContract,
        network,
      })

      expect(metrics).to.be.an('object')
      expect(metrics).to.have.property('totalHolders').that.is.a('string')
      expect(metrics).to.have.property('totalSupply').that.is.a('string')

      logger.info('Token metrics fetched', {
        totalHolders: metrics.totalHolders,
        totalSupply: metrics.totalSupply,
      })
    })
  })

  describe('Error Handling', function () {
    it('should handle non-existent token gracefully', async () => {
      const nonExistentToken = '0x0000000000000000000000000000000000000001'

      const tokenInfo = await ChilizProvider.fetchBasicTokenInfo({
        address: nonExistentToken,
        network,
      })

      expect(tokenInfo).to.be.an('object')
      expect(tokenInfo.type).to.equal(ITokenType.unknown)

      logger.info('Non-existent token handled gracefully')
    })

    it('should handle non-existent address transactions gracefully', async () => {
      const nonExistentAddress = '0x0000000000000000000000000000000000000001'

      const transactions = await ChilizProvider.fetchAddressTxns({
        address: nonExistentAddress,
        network,
      })

      expect(transactions).to.be.an('array')
      // Should return empty array for non-existent address
      expect(transactions.length).to.equal(0)

      logger.info('Non-existent address transactions handled gracefully')
    })
  })

  describe('Contract Creation', function () {
    it('should return placeholder contract creation info', async () => {
      const creation = await ChilizProvider.fetchContractCreation({
        address: testAddresses.tokenContract,
        network: NetworksEnum.chilizMainnet,
      })

      expect(creation).to.be.an('object')
      expect(creation).to.have.property('blockNumber').that.equals(0)
      expect(creation).to.have.property('transactionHash').that.is.null
      expect(creation).to.have.property('address').that.equals(testAddresses.tokenContract)

      logger.info('Contract creation placeholder returned')
    })
  })
})
