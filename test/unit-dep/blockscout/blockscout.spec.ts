import { expect } from 'chai'
import BlockScoutProvider from '@modules/proxyProvider/blockscoutProvider'
import { NetworksEnum } from '@types'
import logger from '@logger'

describe('BlockScout Provider Integration Tests', function () {
  this.timeout(6000000)

  const network = NetworksEnum.polygonMainnet // Replace with actual BlockScout network
  const testAddresses = {
    userAddress: '0x1F8486Dd5B7902aEc9ECe5833D971A82cCBF4493', // Replace with test address
  }

  describe('Address Transactions', function () {
    it('should fetch address transactions (ERC20 + Internal + External)', async () => {
      const transactions = await BlockScoutProvider.fetchAddressTxns({
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
    })
  })
})
