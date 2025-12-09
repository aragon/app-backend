import { expect } from 'chai'
import sinon from 'sinon'
import { NetworksEnum, ITokenType } from '@types'
import logger from '@logger'
import SubscanApi from '@helpers/subscanApi'
import { ethers } from 'ethers'
import PeaqProvider from '@modules/proxyProvider/peaqProvider'

describe('PeaqProvider', () => {
  let sandbox: any
  let loggerStub: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerStub = sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getTokenBalances', () => {
    it('should return properly formatted token balances', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.peaqMainnet
      const tokens = [
        {
          contractAddress: '0x5f1680d0c2c5e9d3615a036fbdc7432e7bf246fb',
          tokenBalance: '1000000000000000000',
          decimals: 18,
        },
        {
          contractAddress: '0x5f1680d0c2c5e9d3615a036fbdc7432e7bf246fd',
          tokenBalance: '2000000000000000000',
          decimals: 18,
        },
      ]

      const getAccountBalanceStub = sandbox.stub(SubscanApi, 'getAccountBalance').resolves(tokens as any)
      const formatUnitsStub = sandbox.stub(ethers, 'formatUnits')
      formatUnitsStub.withArgs('1000000000000000000', 18).returns('1')
      formatUnitsStub.withArgs('2000000000000000000', 18).returns('2')

      // Act
      const result = await PeaqProvider.getTokenBalances({ address, network })

      // Assert
      expect(getAccountBalanceStub.calledOnce).to.be.true
      expect(getAccountBalanceStub.firstCall.args[0]).to.equal(address)
      expect(getAccountBalanceStub.firstCall.args[1]).to.equal(network)

      expect(result).to.have.lengthOf(2)
      expect(result[0]).to.deep.equal({
        tokenBalance: '1.0',
        contractAddress: ethers.getAddress('0x5f1680d0c2c5e9d3615a036fbdc7432e7bf246fb'),
      })
      expect(result[1]).to.deep.equal({
        tokenBalance: '2.0',
        contractAddress: ethers.getAddress('0x5f1680d0c2c5e9d3615a036fbdc7432e7bf246fd'),
      })
    })

    it('should handle empty token list', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.peaqMainnet

      const getAccountBalanceStub = sandbox.stub(SubscanApi, 'getAccountBalance').resolves([])

      // Act
      const result = await PeaqProvider.getTokenBalances({ address, network })

      // Assert
      expect(getAccountBalanceStub.calledOnce).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })
  })

  describe('fetchContractCreation', () => {
    it('should return contract creation info when found', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.peaqMainnet
      const contractInfo = {
        blockNumber: 12345,
        transactionHash: '0xtxhash',
        address,
      }

      const fetchContractCreationStub = sandbox.stub(SubscanApi, 'fetchContractCreation').resolves(contractInfo)

      // Act
      const result = await PeaqProvider.fetchContractCreation({ address, network })

      // Assert
      expect(fetchContractCreationStub.calledOnce).to.be.true
      expect(fetchContractCreationStub.firstCall.args[0]).to.equal(address)
      expect(fetchContractCreationStub.firstCall.args[1]).to.equal(network)
      expect(result).to.equal(contractInfo)
    })

    it('should return default values when contract creation info not found', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.peaqMainnet

      const fetchContractCreationStub = sandbox.stub(SubscanApi, 'fetchContractCreation').resolves(null)

      // Act
      const result = await PeaqProvider.fetchContractCreation({ address, network })

      // Assert
      expect(fetchContractCreationStub.calledOnce).to.be.true
      expect(fetchContractCreationStub.firstCall.args[0]).to.equal(address)
      expect(fetchContractCreationStub.firstCall.args[1]).to.equal(network)
      expect(result).to.deep.equal({
        blockNumber: 0,
        transactionHash: null,
        address,
      })
    })
  })

  describe('fetchContractSourceCode', () => {
    it('should forward request to SubscanApi.getContractSourceCode', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.peaqMainnet
      const sourceCode = { source: 'contract source code' }

      const getContractSourceCodeStub = sandbox.stub(SubscanApi, 'getContractSourceCode').resolves(sourceCode as any)

      // Act
      const result = await PeaqProvider.fetchContractSourceCode({ address, network })

      // Assert
      expect(getContractSourceCodeStub.calledOnce).to.be.true
      expect(getContractSourceCodeStub.firstCall.args[0]).to.equal(address)
      expect(getContractSourceCodeStub.firstCall.args[1]).to.equal(network)
      expect(result).to.equal(sourceCode)
    })
  })

  describe('searchDetailsOfContract', () => {
    it('should return details from contract source code when available', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.peaqMainnet
      const sourceCode = [{ ContractName: 'TestContract' }]

      const getContractSourceCodeStub = sandbox.stub(SubscanApi, 'getContractSourceCode').resolves(sourceCode as any)
      const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails')

      // Act
      const result = await PeaqProvider.searchDetailsOfContract({ address, network })

      // Assert
      expect(getContractSourceCodeStub.calledOnce).to.be.true
      expect(getContractSourceCodeStub.firstCall.args[0]).to.equal(address)
      expect(getContractSourceCodeStub.firstCall.args[1]).to.equal(network)
      expect(getTokenFullDetailsStub.notCalled).to.be.true

      expect(result).to.deep.equal({
        name: 'TestContract',
      })
    })

    it('should fallback to token details when source code is not available', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.peaqMainnet
      const sourceCode = [] // Empty array (no source code)
      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
      }

      const getContractSourceCodeStub = sandbox.stub(SubscanApi, 'getContractSourceCode').resolves(sourceCode)
      const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails').resolves(tokenDetails as any)

      // Act
      const result = await PeaqProvider.searchDetailsOfContract({ address, network })

      // Assert
      expect(getContractSourceCodeStub.calledOnce).to.be.true
      expect(getTokenFullDetailsStub.calledOnce).to.be.true
      expect(getTokenFullDetailsStub.firstCall.args[0]).to.equal(address)
      expect(getTokenFullDetailsStub.firstCall.args[1]).to.equal(network)

      expect(result).to.deep.equal({
        name: 'Test Token',
        type: 'token',
      })
    })

    it('should handle null values in contract name', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.peaqMainnet

      const getContractSourceCodeStub = sandbox.stub(SubscanApi, 'getContractSourceCode').resolves(null as any)
      const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails').resolves(null as any)

      // Act
      const result = await PeaqProvider.searchDetailsOfContract({ address, network })

      // Assert
      expect(getContractSourceCodeStub.calledOnce).to.be.true
      expect(getTokenFullDetailsStub.calledOnce).to.be.true

      expect(result).to.deep.equal({
        name: null,
        type: ITokenType.unknown,
      })
    })
  })
})
