import Alchemy from '@helpers/alchemy'
import utils from '@helpers/utils'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helpers:AlchemyHelper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('handleAlchemyCrazyBalance', () => {
    it('handleAlchemyCrazyBalance', () => {
      expect(Alchemy.handleAlchemyCrazyBalance('7.326e+22', 18)).to.equal('73260.0')
      expect(Alchemy.handleAlchemyCrazyBalance('0', 18)).to.equal('0')
      expect(Alchemy.handleAlchemyCrazyBalance('50000000000000000', 18)).to.equal('50000000000000000')
      expect(Alchemy.handleAlchemyCrazyBalance('0.01', 18)).to.equal('0.01')
      expect(Alchemy.handleAlchemyCrazyBalance(0.01, 18)).to.equal('0.01')
      expect(Alchemy.handleAlchemyCrazyBalance('1.73462724372438', 18)).to.equal('1.73462724372438')
      expect(Alchemy.handleAlchemyCrazyBalance(1.73462724372438, 18)).to.equal('1.73462724372438')
      expect(Alchemy.handleAlchemyCrazyBalance(4.2e-16, 18)).to.equal('0.000000000000000420')
      expect(Alchemy.handleAlchemyCrazyBalance('4.2e-16', 18)).to.equal('0.000000000000000420')
      expect(
        Alchemy.handleAlchemyCrazyBalance('0x0000000000000000000000000000000000000000000000000000000000124f80', 18),
      ).to.equal('0.0000000000012')
      expect(Alchemy.handleAlchemyCrazyBalance('43943983483908340948.438934780934834409', 18)).to.equal(
        '43943983483908340948.438934780934834409',
      )
    })

    it('should handle error for scientific notation with toLocaleString', () => {
      // Arrange
      sandbox.stub(utils, 'isScientificNumber').returns(true)
      sandbox.stub(Number.prototype, 'toLocaleString').throws(new Error('Locale error'))
      const loggerStub = sandbox.stub(logger, 'error')

      // Act
      const result = Alchemy.handleAlchemyCrazyBalance('1e20', 18, 'testTransaction')

      // Assert
      expect(result).to.equal('0')
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.firstCall.args[0]).to.equal('Error in conversion')
    })

    it('should log an error when amount is a string without "0x"', () => {
      const address = '0xUserAddress'
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet
      const amount = '12345' // Invalid format (should be hex)
      const decimals = 18

      const errorLoggerStub = sandbox.stub(logger, 'error')

      Alchemy.alchemyCrazyBalanceOnError(address, tokenAddress, network, amount, decimals)

      expect(errorLoggerStub.calledOnceWith('Error alchemyCrazyBalance wrong format' as any)).to.be.true
    })

    it('should not log an error when amount includes "0x"', () => {
      const address = '0xUserAddress'
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet
      const amount = '0x12345' // Correct hex format
      const decimals = 18

      const errorLoggerStub = sandbox.stub(logger, 'error')

      Alchemy.alchemyCrazyBalanceOnError(address, tokenAddress, network, amount, decimals)

      expect(errorLoggerStub.notCalled).to.be.true
    })

    it('should not log an error when amount is not a string', () => {
      const address = '0xUserAddress'
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet
      const amount = 12345 // Numeric value (valid)
      const decimals = 18

      const errorLoggerStub = sandbox.stub(logger, 'error')

      Alchemy.alchemyCrazyBalanceOnError(address, tokenAddress, network, amount, decimals)

      expect(errorLoggerStub.notCalled).to.be.true
    })

    it('should handle undefined amount gracefully without logging an error', () => {
      const address = '0xUserAddress'
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet
      const amount = undefined // Undefined value
      const decimals = 18

      const errorLoggerStub = sandbox.stub(logger, 'error')

      Alchemy.alchemyCrazyBalanceOnError(address, tokenAddress, network, amount, decimals)

      expect(errorLoggerStub.notCalled).to.be.true
    })

    it('should log error and return "0" for invalid amount format', () => {
      const loggerStub = sandbox.stub(logger, 'error')

      // Pass an object that is not a valid number and doesn't have 0x prefix
      const result = Alchemy.handleAlchemyCrazyBalance({ invalid: 'value' } as any, 18, 'testTx')

      expect(result).to.equal('0')
      expect(loggerStub.calledWith('Error not handled amount format' as any)).to.be.true
    })
  })
})
