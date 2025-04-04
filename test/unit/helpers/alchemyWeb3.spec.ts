import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import AlchemyWeb3 from '@helpers/alchemyWeb3'
import { NetworksEnum } from '@types'
import logger from '@logger'

describe('Helpers:AlchemyWeb3', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('handleAlchemyCrazyBalance', () => {
    it('handleAlchemyCrazyBalance', () => {
      expect(AlchemyWeb3.handleAlchemyCrazyBalance('7.326e+22', 18)).to.equal('73260.0')
      expect(AlchemyWeb3.handleAlchemyCrazyBalance('0', 18)).to.equal('0')
      expect(AlchemyWeb3.handleAlchemyCrazyBalance('50000000000000000', 18)).to.equal('50000000000000000')
      expect(AlchemyWeb3.handleAlchemyCrazyBalance('0.01', 18)).to.equal('0.01')
      expect(AlchemyWeb3.handleAlchemyCrazyBalance(0.01, 18)).to.equal('0.01')
      expect(AlchemyWeb3.handleAlchemyCrazyBalance('1.73462724372438', 18)).to.equal('1.73462724372438')
      expect(AlchemyWeb3.handleAlchemyCrazyBalance(1.73462724372438, 18)).to.equal('1.73462724372438')
      expect(AlchemyWeb3.handleAlchemyCrazyBalance(4.2e-16, 18)).to.equal('0.000000000000000420')
      expect(AlchemyWeb3.handleAlchemyCrazyBalance('4.2e-16', 18)).to.equal('0.000000000000000420')
      expect(
        AlchemyWeb3.handleAlchemyCrazyBalance('0x0000000000000000000000000000000000000000000000000000000000124f80', 18),
      ).to.equal('0.0000000000012')
      expect(AlchemyWeb3.handleAlchemyCrazyBalance('43943983483908340948.438934780934834409', 18)).to.equal(
        '43943983483908340948.438934780934834409',
      )
    })

    it('should log an error when amount is a string without "0x"', () => {
      const address = '0xUserAddress'
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet
      const amount = '12345' // Invalid format (should be hex)
      const decimals = 18

      const errorLoggerStub = sandbox.stub(logger, 'error')

      AlchemyWeb3.alchemyCrazyBalanceOnError(address, tokenAddress, network, amount, decimals)

      expect(errorLoggerStub.calledOnceWith('Error alchemyCrazyBalance wrong format' as any)).to.be.true
    })

    it('should not log an error when amount includes "0x"', () => {
      const address = '0xUserAddress'
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet
      const amount = '0x12345' // Correct hex format
      const decimals = 18

      const errorLoggerStub = sandbox.stub(logger, 'error')

      AlchemyWeb3.alchemyCrazyBalanceOnError(address, tokenAddress, network, amount, decimals)

      expect(errorLoggerStub.notCalled).to.be.true
    })

    it('should not log an error when amount is not a string', () => {
      const address = '0xUserAddress'
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet
      const amount = 12345 // Numeric value (valid)
      const decimals = 18

      const errorLoggerStub = sandbox.stub(logger, 'error')

      AlchemyWeb3.alchemyCrazyBalanceOnError(address, tokenAddress, network, amount, decimals)

      expect(errorLoggerStub.notCalled).to.be.true
    })

    it('should handle undefined amount gracefully without logging an error', () => {
      const address = '0xUserAddress'
      const tokenAddress = '0xTokenAddress'
      const network = NetworksEnum.ethereumMainnet
      const amount = undefined // Undefined value
      const decimals = 18

      const errorLoggerStub = sandbox.stub(logger, 'error')

      AlchemyWeb3.alchemyCrazyBalanceOnError(address, tokenAddress, network, amount, decimals)

      expect(errorLoggerStub.notCalled).to.be.true
    })
  })
})
