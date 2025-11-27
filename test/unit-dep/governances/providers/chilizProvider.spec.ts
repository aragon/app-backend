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
