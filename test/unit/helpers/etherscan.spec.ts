import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import EtherscanHelper from '@helpers/etherscan'
import logger from '@logger'
import config from '@config'

describe('Helpers: Etherscan', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('_rpCall', async () => {
    it('Should _rpCall', async () => {
      const expectedResult = { data: { result: 1 } }
      const rpcCallStub = sandbox.stub(EtherscanHelper.axiosInstance, 'get').resolves(expectedResult)

      const result = await EtherscanHelper._rpCall({
        module: 'account',
        action: 'txlist',
        apikey: config.ETHERSCAN.API_KEY,
      })

      expect(result).to.eq(1)
      expect(rpcCallStub.calledOnce).to.be.true
      expect(
        rpcCallStub.calledWith('', {
          params: { module: 'account', action: 'txlist', apikey: config.ETHERSCAN.API_KEY },
        }),
      ).to.be.true
    })

    it('Should handle errors in _rpCall', async () => {
      const expectedError = new Error('RPC Call Failed')
      sandbox.stub(EtherscanHelper.axiosInstance, 'get').rejects(expectedError)
      const loggerStub = sandbox.stub(logger, 'error')

      await expect(
        EtherscanHelper._rpCall({ module: 'account', action: 'txlist', apikey: config.ETHERSCAN.API_KEY }),
      ).to.be.rejectedWith(expectedError)

      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.firstCall.args[0]).to.equal('Error in Etherscan API call')
    })
  })

  describe('fetchAllTransactions', async () => {
    it('should fetch all transactions', async () => {
      const mockTransactions = [{ hash: '0x123' }, { hash: '0x456' }]
      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const transactions = await EtherscanHelper.fetchAllTransactions('0x123', 100)

      expect(transactions).to.deep.equal(mockTransactions)
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.deep.equal({
        module: 'account',
        action: 'txlist',
        address: '0x123',
        startblock: 100,
        endblock: 'latest',
        sort: 'asc',
        apikey: config.ETHERSCAN.API_KEY,
      })
    })

    it('should handle errors when fetching all transactions fails', async () => {
      const expectedError = new Error('Failed to fetch transactions')
      sandbox.stub(EtherscanHelper, '_rpCall').rejects(expectedError)
      const loggerStub = sandbox.stub(logger, 'error')

      await expect(EtherscanHelper.fetchAllTransactions('0x123', 100)).to.be.rejectedWith(expectedError)

      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.args[0]).to.include('Error in Etherscan API call')
    })
  })
})
