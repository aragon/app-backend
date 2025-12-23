import logger from '@logger'
import RoutescanProvider from '@modules/proxyProvider/routescanProvider'
import { NetworksEnum } from '@types'
import { expect } from 'chai'

describe('Integ: Routescan Provider', function () {
  this.timeout(6000000)

  describe('Chiliz Network', function () {
    const network = NetworksEnum.chilizMainnet
    const testAddresses = {
      contractAddress: '0xDedD0A73c3EC17dfbd057b0bD3FE6D2152b7284B',
      userAddress: '0xdE015725E9dcC16451DCfb31534c57D6111B65aB',
    }

    describe('Token Balances', function () {
      it('should fetch token balances for an address', async () => {
        const balances = await RoutescanProvider.getTokenBalances({
          address: testAddresses.userAddress,
          network,
        })

        expect(balances).to.be.an('array')

        if (balances.length > 0) {
          const firstBalance = balances[0]
          expect(firstBalance).to.have.property('contractAddress').that.is.a('string')
          expect(firstBalance).to.have.property('tokenBalance').that.is.a('string')
        }

        logger.info(`Fetched ${balances.length} token balances for Chiliz address`)
      })
    })

    describe('Contract Information', function () {
      it('should fetch contract source code', async () => {
        const sourceCode = await RoutescanProvider.fetchContractSourceCode({
          address: testAddresses.contractAddress,
          network,
        })

        if (sourceCode) {
          expect(sourceCode).to.be.an('array')
          expect(sourceCode[0]).to.have.property('SourceCode').that.is.a('string')
          expect(sourceCode[0]).to.have.property('ContractName').that.is.a('string')
          expect(sourceCode[0]).to.have.property('ABI').that.is.a('string')

          logger.info('Chiliz contract source code fetched', {
            contractName: sourceCode[0].ContractName,
            hasSourceCode: sourceCode[0].SourceCode.length > 0,
          })
        } else {
          logger.info('No source code available for this Chiliz contract')
        }
      })

      it('should search contract details', async () => {
        const details = await RoutescanProvider.searchDetailsOfContract({
          address: testAddresses.contractAddress,
          network,
        })

        expect(details).to.be.an('object')
        expect(details).to.have.property('type')
        expect(details).to.have.property('name')

        logger.info('Chiliz contract details', {
          type: details.type,
          name: details.name,
        })
      })
    })

    describe('Contract Creation', function () {
      it('should fetch contract creation info with blockNumber', async () => {
        const creation = await RoutescanProvider.fetchContractCreation({
          address: testAddresses.contractAddress,
          network,
        })

        expect(creation).to.be.an('object')
        expect(creation).to.have.property('blockNumber').that.is.a('number')
        expect(creation).to.have.property('transactionHash').that.is.a('string')
        expect(creation).to.have.property('address').that.is.a('string')

        // Verify we actually got a valid block number (not 0)
        expect(creation.blockNumber).to.be.greaterThan(0, 'blockNumber should be fetched from tx if missing')
        expect(creation.transactionHash).to.have.length.greaterThan(0)

        logger.info('Chiliz contract creation', {
          blockNumber: creation.blockNumber,
          transactionHash: creation.transactionHash,
          address: creation.address,
        })
      })
    })
  })

  describe('Corn Network', function () {
    const network = NetworksEnum.cornMainnet
    const testAddresses = {
      contractAddress: '0x83D2F19B80c377e6b320ee97A59CfD7B3bAAe058',
      userAddress: '0xc28D8A7aC0ab03D88aEa11f2722cf7e618a360DD',
    }

    describe('Token Balances', function () {
      it('should fetch token balances for an address', async () => {
        const balances = await RoutescanProvider.getTokenBalances({
          address: testAddresses.userAddress,
          network,
        })

        expect(balances).to.be.an('array')

        if (balances.length > 0) {
          const firstBalance = balances[0]
          expect(firstBalance).to.have.property('contractAddress').that.is.a('string')
          expect(firstBalance).to.have.property('tokenBalance').that.is.a('string')
        }

        logger.info(`Fetched ${balances.length} token balances for Corn address`)
      })
    })

    describe('Contract Information', function () {
      it('should fetch contract source code', async () => {
        const sourceCode = await RoutescanProvider.fetchContractSourceCode({
          address: testAddresses.contractAddress,
          network,
        })

        if (sourceCode) {
          expect(sourceCode).to.be.an('array')
          expect(sourceCode[0]).to.have.property('SourceCode').that.is.a('string')
          expect(sourceCode[0]).to.have.property('ContractName').that.is.a('string')
          expect(sourceCode[0]).to.have.property('ABI').that.is.a('string')

          logger.info('Corn contract source code fetched', {
            contractName: sourceCode[0].ContractName,
            hasSourceCode: sourceCode[0].SourceCode.length > 0,
          })
        } else {
          logger.info('No source code available for this Corn contract')
        }
      })

      it('should search contract details', async () => {
        const details = await RoutescanProvider.searchDetailsOfContract({
          address: testAddresses.contractAddress,
          network,
        })

        expect(details).to.be.an('object')
        expect(details).to.have.property('type')
        expect(details).to.have.property('name')

        logger.info('Corn contract details', {
          type: details.type,
          name: details.name,
        })
      })
    })

    describe('Contract Creation', function () {
      it('should fetch contract creation info with blockNumber', async () => {
        const creation = await RoutescanProvider.fetchContractCreation({
          address: testAddresses.contractAddress,
          network,
        })

        expect(creation).to.be.an('object')
        expect(creation).to.have.property('blockNumber').that.is.a('number')
        expect(creation).to.have.property('transactionHash').that.is.a('string')
        expect(creation).to.have.property('address').that.is.a('string')

        // Verify we actually got a valid block number (not 0)
        expect(creation.blockNumber).to.be.greaterThan(0, 'blockNumber should be fetched from tx if missing')
        expect(creation.transactionHash).to.have.length.greaterThan(0)

        logger.info('Corn contract creation', {
          blockNumber: creation.blockNumber,
          transactionHash: creation.transactionHash,
          address: creation.address,
        })
      })
    })
  })
})
