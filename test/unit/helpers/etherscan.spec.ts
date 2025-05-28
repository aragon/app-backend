import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import EtherscanHelper from '@helpers/etherscan'
import logger from '@logger'
import { NetworksEnum } from '@types'
import axios from 'axios'
import config from '@config'

describe('Helpers: Etherscan', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('axiosInstance', async () => {
    const stubAxios = sandbox.stub(axios, 'create')
    EtherscanHelper.axiosInstance()
    expect(stubAxios.calledOnce).to.be.true
  })

  describe('_rpCall', () => {
    it('Should make a successful _rpCall', async () => {
      const expectedResult = { data: { result: 1 } }
      const getCall = sandbox.stub().resolves(expectedResult)
      const axiosInstanceStub = sandbox.stub(EtherscanHelper, 'axiosInstance').returns({
        get: getCall,
      } as any)

      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await EtherscanHelper._rpCall(
        {
          module: 'account',
          action: 'txlist',
        },
        NetworksEnum.ethereumMainnet,
      )

      expect(result).to.eq(1)
      expect(axiosInstanceStub.calledOnce).to.be.true
      expect(getCall.calledOnce).to.be.true
      expect(getCall.firstCall.args[1]).to.be.deep.equal({
        params: {
          module: 'account',
          action: 'txlist',
          apikey: 'test-api-key',
          chainid: 1,
        },
      })
    })

    it('Should handle errors in _rpCall', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getCall = sandbox.stub().rejects(expectedResult)
      sandbox.stub(EtherscanHelper, 'axiosInstance').returns({
        get: getCall,
      } as any)
      const loggerStub = sandbox.stub(logger, 'error')

      await expect(
        EtherscanHelper._rpCall(
          {
            module: 'account',
            action: 'txlist',
          },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.rejectedWith(expectedResult)

      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.firstCall.args[0]).to.equal('Error in Etherscan API call')
    })
  })

  describe('fetchAllTransactions', () => {
    it('should fetch all transactions successfully', async () => {
      const mockTransactions = [{ hash: '0x123' }, { hash: '0x456' }]
      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const transactions = await EtherscanHelper.fetchAllTransactions({
        contractAddress: '0x123',
        startBlock: 100,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(transactions).to.deep.equal(mockTransactions)
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.deep.equal({
        module: 'account',
        action: 'txlist',
        address: '0x123',
        startblock: 100,
        endblock: 'latest',
        sort: 'asc',
      })
    })

    it('should handle errors when fetching all transactions fails', async () => {
      const expectedError = new Error('Failed to fetch transactions')
      sandbox.stub(EtherscanHelper, '_rpCall').rejects(expectedError)
      const loggerStub = sandbox.stub(logger, 'error')

      await expect(
        EtherscanHelper.fetchAllTransactions({
          contractAddress: '0x123',
          startBlock: 100,
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.rejectedWith(expectedError)

      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.args[0]).to.include('Error fetchAllTransactions')
    })
  })

  describe('fetchContractSourceCode', () => {
    it('should fetch contract source code successfully', async () => {
      const mockSourceCode = [{ SourceCode: 'SourceCode', ContractName: 'ContractName', ABI: 'ABI' }]
      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockSourceCode)

      const result = await EtherscanHelper.fetchContractSourceCode({
        contractAddress: '0xf96e6FD76BD0A15580604e1Ea5818D448b1041C0',
        network: NetworksEnum.ethereumSepolia,
      })

      expect(result?.[0]).to.deep.equal({
        SourceCode: 'SourceCode',
        ContractName: 'ContractName',
        ABI: 'ABI',
      })
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.deep.equal({
        module: 'contract',
        action: 'getsourcecode',
        address: '0xf96e6FD76BD0A15580604e1Ea5818D448b1041C0',
      })
    })

    it('should return null if the network is not configured', async () => {
      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').throws(new Error('Network not configured'))
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await EtherscanHelper.fetchContractSourceCode({
        contractAddress: '0xf96e6FD76BD0A15580604e1Ea5818D448b1041C0',
        network: NetworksEnum.ethereumSepolia,
      })

      expect(result).to.be.null
      expect(rpcCallStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.args[0][0]).to.include('Error fetchContractSourceCode')
    })

    it('should handle errors when fetching contract source code fails', async () => {
      const expectedError = new Error('Failed to fetch contract source code')
      sandbox.stub(EtherscanHelper, '_rpCall').rejects(expectedError)
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await EtherscanHelper.fetchContractSourceCode({
        contractAddress: '0xf96e6FD76BD0A15580604e1Ea5818D448b1041C0',
        network: NetworksEnum.ethereumSepolia,
      })

      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.args[0][0]).to.include('Error fetchContractSourceCode')
    })
  })

  describe('getTokenMetrics', () => {
    it('should fetch getTokenMetrics', async () => {
      const mockSupply = { result: '100000000000000000000000000', status: '1' }
      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockSupply)
      const result = await EtherscanHelper.getTokenMetrics('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.equal('100000000000000000000000000')
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.deep.equal({
        module: 'token',
        action: 'tokensupply',
        contractaddress: '0x123',
      })
    })

    it('should handle errors when fetching getTokenMetrics', async () => {
      const expectedError = new Error('Failed to fetch token supply')
      sandbox.stub(EtherscanHelper, '_rpCall').rejects(expectedError)
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await EtherscanHelper.getTokenMetrics('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.equal('0')
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.args[0][0]).to.include('Error getTokenMetrics')
    })

    it('should return "0" when the API response is invalid or status is not "1"', async () => {
      sandbox.stub(EtherscanHelper, '_rpCall').resolves({ status: '0' })
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await EtherscanHelper.getTokenMetrics('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.equal('0')
      expect(loggerStub.called).to.be.false
    })

    it('should return "0" when the API call throws an error', async () => {
      sandbox.stub(EtherscanHelper, '_rpCall').rejects(new Error('API Failure'))
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await EtherscanHelper.getTokenMetrics('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.equal('0')
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.firstCall.args[0]).to.equal('Error getTokenMetrics')
    })
  })

  describe('fetchContractCreation', () => {
    it('should fetch contract creation successfully', async () => {
      const mockCreationData = [{ address: '0x123', txHash: '0xabc' }]
      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockCreationData)

      const result = await EtherscanHelper.fetchContractCreation({
        contractAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.deep.equal(mockCreationData)
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.deep.equal({
        module: 'contract',
        action: 'getcontractcreation',
        contractaddresses: '0x123',
      })
    })

    it('should return an empty array if the network is not configured', async () => {
      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').throws(new Error('Network not configured'))

      const result = await EtherscanHelper.fetchContractCreation({
        contractAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.deep.equal([])
      expect(rpcCallStub.calledOnce).to.be.true
    })

    it('should handle errors when fetching contract creation fails', async () => {
      const expectedError = new Error('Failed to fetch contract creation')
      sandbox.stub(EtherscanHelper, '_rpCall').rejects(expectedError)

      const result = await EtherscanHelper.fetchContractCreation({
        contractAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.deep.equal([])
    })
  })
})
