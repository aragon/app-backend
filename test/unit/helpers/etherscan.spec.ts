import config from '@config'
import EtherscanHelper from '@helpers/etherscan'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import { NetworksEnum } from '@types'
import axios from 'axios'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helpers: Etherscan', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('nativeTokens', () => {
    it('should have correct native token addresses for supported networks', () => {
      expect(EtherscanHelper.nativeTokens[NetworksEnum.ethereumMainnet]).to.equal(
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      )
      expect(EtherscanHelper.nativeTokens[NetworksEnum.ethereumSepolia]).to.equal(
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      )
      expect(EtherscanHelper.nativeTokens[NetworksEnum.polygonMainnet]).to.equal(
        '0x0000000000000000000000000000000000001010',
      )
      expect(EtherscanHelper.nativeTokens[NetworksEnum.arbitrumMainnet]).to.equal(
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      )
      expect(EtherscanHelper.nativeTokens[NetworksEnum.baseMainnet]).to.equal(
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      )
      expect(EtherscanHelper.nativeTokens[NetworksEnum.zksyncMainnet]).to.equal(
        '0x000000000000000000000000000000000000800A',
      )
      expect(EtherscanHelper.nativeTokens[NetworksEnum.zksyncSepolia]).to.equal(
        '0x000000000000000000000000000000000000800A',
      )
      expect(EtherscanHelper.nativeTokens[NetworksEnum.optimismMainnet]).to.equal(
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      )
      expect(EtherscanHelper.nativeTokens[NetworksEnum.avaxMainnet]).to.equal(
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      )
    })

    it('should return undefined for unsupported networks', () => {
      expect(EtherscanHelper.nativeTokens['unsupported-network']).to.be.undefined
    })
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
      sandbox.stub(ProviderModule, 'getChainId').throws(new Error('fake-error'))

      const loggerStub = sandbox.stub(logger, 'error')

      await expect(
        EtherscanHelper._rpCall(
          {
            module: 'account',
            action: 'txlist',
          },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.rejectedWith(Error, 'fake-error')

      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.firstCall.args[0]).to.equal('Error in Etherscan API call')
    })
  })

  describe('fetchNormalTransactions', () => {
    it('should fetch and filter normal transactions successfully', async () => {
      const mockTransactions = [
        { hash: '0x1', value: '1000000000000000000', methodId: '0x', isError: '0' }, // Valid native transfer
        { hash: '0x2', value: '2000000000000000000', methodId: '0x', isError: '0' }, // Valid native transfer
        { hash: '0x3', value: '0', methodId: '0x', isError: '0' }, // Zero value - should be filtered
        { hash: '0x4', value: '3000000000000000000', methodId: '0x123', isError: '0' }, // Contract call - should be filtered
        { hash: '0x5', value: '4000000000000000000', methodId: '0x', isError: '1' }, // Failed tx - should be filtered
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchNormalTransactions({
        contractAddress: '0xDAO123',
        startBlock: 1000,
        endBlock: '2000',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.have.lengthOf(2)
      expect(result[0]).to.deep.equal(mockTransactions[0])
      expect(result[1]).to.deep.equal(mockTransactions[1])

      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.deep.equal({
        module: 'account',
        action: 'txlist',
        address: '0xDAO123',
        startblock: 1000,
        endblock: '2000',
        sort: 'asc',
      })
      expect(rpcCallStub.firstCall.args[1]).to.equal(NetworksEnum.ethereumMainnet)
    })

    it('should use default values for startBlock and endBlock', async () => {
      const mockTransactions = [{ hash: '0x1', value: '1000000000000000000', methodId: '0x', isError: '0' }]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchNormalTransactions({
        contractAddress: '0xDAO456',
        network: NetworksEnum.polygonMainnet,
      })

      expect(result).to.have.lengthOf(1)
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.deep.equal({
        module: 'account',
        action: 'txlist',
        address: '0xDAO456',
        startblock: 0,
        endblock: 'latest',
        sort: 'asc',
      })
    })

    it('should handle empty transaction list', async () => {
      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves([])

      const result = await EtherscanHelper.fetchNormalTransactions({
        contractAddress: '0xDAO789',
        startBlock: 5000,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.deep.equal([])
      expect(rpcCallStub.calledOnce).to.be.true
    })

    it('should filter out all transactions if none meet criteria', async () => {
      const mockTransactions = [
        { hash: '0x1', value: '0', methodId: '0x', isError: '0' }, // Zero value
        { hash: '0x2', value: '1000000000000000000', methodId: '0xabc123', isError: '0' }, // Contract call
        { hash: '0x3', value: '2000000000000000000', methodId: '0x', isError: '1' }, // Failed
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchNormalTransactions({
        contractAddress: '0xDAO999',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.deep.equal([])
      expect(rpcCallStub.calledOnce).to.be.true
    })

    it('should handle large BigInt values correctly', async () => {
      const mockTransactions = [
        { hash: '0x1', value: '999999999999999999999999999', methodId: '0x', isError: '0' }, // Very large value
        { hash: '0x2', value: '1', methodId: '0x', isError: '0' }, // Minimum valid value
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchNormalTransactions({
        contractAddress: '0xDAOBig',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.have.lengthOf(2)
      expect(result[0].value).to.equal('999999999999999999999999999')
      expect(result[1].value).to.equal('1')
      expect(rpcCallStub.calledOnce).to.be.true
    })

    it('should handle API errors gracefully', async () => {
      const expectedError = new Error('Etherscan API error')
      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').rejects(expectedError)
      const loggerStub = sandbox.stub(logger, 'error')

      await expect(
        EtherscanHelper.fetchNormalTransactions({
          contractAddress: '0xDAOError',
          startBlock: 1000,
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.rejectedWith(expectedError)

      expect(rpcCallStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.firstCall.args[0]).to.equal('Error fetchNormalTransactions')
    })

    it('should handle network-specific requests', async () => {
      const mockTransactions = [{ hash: '0x1', value: '1000000000000000000', methodId: '0x', isError: '0' }]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      // Test with different networks
      const networks = [NetworksEnum.polygonMainnet, NetworksEnum.baseMainnet, NetworksEnum.arbitrumMainnet]

      for (const network of networks) {
        rpcCallStub.resetHistory()

        const result = await EtherscanHelper.fetchNormalTransactions({
          contractAddress: '0xDAONetwork',
          network,
        })

        expect(result).to.have.lengthOf(1)
        expect(rpcCallStub.calledOnce).to.be.true
        expect(rpcCallStub.firstCall.args[1]).to.equal(network)
      }
    })
  })

  describe('fetchInternalTransactions', () => {
    it('should fetch and filter internal transactions successfully', async () => {
      const mockTransactions = [
        { hash: '0x1', value: '1000000000000000000', type: 'call', isError: '0', from: '0xcontract1' }, // Valid internal transfer
        { hash: '0x2', value: '2000000000000000000', type: 'call', isError: '0', from: '0xcontract2' }, // Valid internal transfer
        { hash: '0x3', value: '0', type: 'call', isError: '0', from: '0xcontract3' }, // Zero value - should be filtered
        { hash: '0x4', value: '3000000000000000000', type: 'create', isError: '0', from: '0xcontract4' }, // Contract creation - should be filtered
        { hash: '0x5', value: '4000000000000000000', type: 'call', isError: '1', from: '0xcontract5' }, // Failed tx - should be filtered
        { hash: '0x6', value: '5000000000000000000', type: 'delegatecall', isError: '0', from: '0xcontract6' }, // Delegate call - should be filtered
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchInternalTransactions({
        contractAddress: '0xDAO123',
        startBlock: 1000,
        endBlock: '2000',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.have.lengthOf(2)
      expect(result[0]).to.deep.equal(mockTransactions[0])
      expect(result[1]).to.deep.equal(mockTransactions[1])

      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.deep.equal({
        module: 'account',
        action: 'txlistinternal',
        address: '0xDAO123',
        startblock: 1000,
        endblock: '2000',
        sort: 'asc',
      })
      expect(rpcCallStub.firstCall.args[1]).to.equal(NetworksEnum.ethereumMainnet)
    })

    it('should use default values for startBlock and endBlock', async () => {
      const mockTransactions = [{ hash: '0x1', value: '1000000000000000000', type: 'call', isError: '0' }]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchInternalTransactions({
        contractAddress: '0xDAO456',
        network: NetworksEnum.ethereumSepolia,
      })

      expect(result).to.have.lengthOf(1)
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.deep.equal({
        module: 'account',
        action: 'txlistinternal',
        address: '0xDAO456',
        startblock: 0,
        endblock: 'latest',
        sort: 'asc',
      })
    })

    it('should handle empty internal transaction list', async () => {
      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves([])

      const result = await EtherscanHelper.fetchInternalTransactions({
        contractAddress: '0xDAO789',
        startBlock: 5000,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.deep.equal([])
      expect(rpcCallStub.calledOnce).to.be.true
    })

    it('should filter out all internal transactions if none meet criteria', async () => {
      const mockTransactions = [
        { hash: '0x1', value: '0', type: 'call', isError: '0' }, // Zero value
        { hash: '0x2', value: '1000000000000000000', type: 'create', isError: '0' }, // Not a call
        { hash: '0x3', value: '2000000000000000000', type: 'call', isError: '1' }, // Failed
        { hash: '0x4', value: '3000000000000000000', type: 'delegatecall', isError: '0' }, // Not a regular call
        { hash: '0x5', value: '4000000000000000000', type: 'staticcall', isError: '0' }, // Static call
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchInternalTransactions({
        contractAddress: '0xDAO999',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.deep.equal([])
      expect(rpcCallStub.calledOnce).to.be.true
    })

    it('should handle large BigInt values correctly in internal transactions', async () => {
      const mockTransactions = [
        { hash: '0x1', value: '999999999999999999999999999', type: 'call', isError: '0' }, // Very large value
        { hash: '0x2', value: '1', type: 'call', isError: '0' }, // Minimum valid value
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchInternalTransactions({
        contractAddress: '0xDAOBig',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.have.lengthOf(2)
      expect(result[0].value).to.equal('999999999999999999999999999')
      expect(result[1].value).to.equal('1')
      expect(rpcCallStub.calledOnce).to.be.true
    })

    it('should handle API errors gracefully', async () => {
      const expectedError = new Error('Etherscan API error')
      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').rejects(expectedError)
      const loggerStub = sandbox.stub(logger, 'error')

      await expect(
        EtherscanHelper.fetchInternalTransactions({
          contractAddress: '0xDAOError',
          startBlock: 1000,
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.rejectedWith(expectedError)

      expect(rpcCallStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.firstCall.args[0]).to.equal('Error fetchInternalTransactions')
    })

    it('should handle network-specific internal transaction requests', async () => {
      const mockTransactions = [{ hash: '0x1', value: '1000000000000000000', type: 'call', isError: '0' }]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      // Test with different networks
      const networks = [NetworksEnum.polygonMainnet, NetworksEnum.baseMainnet, NetworksEnum.optimismMainnet]

      for (const network of networks) {
        rpcCallStub.resetHistory()

        const result = await EtherscanHelper.fetchInternalTransactions({
          contractAddress: '0xDAONetwork',
          network,
        })

        expect(result).to.have.lengthOf(1)
        expect(rpcCallStub.calledOnce).to.be.true
        expect(rpcCallStub.firstCall.args[1]).to.equal(network)
      }
    })

    it('should handle mixed transaction types correctly', async () => {
      const mockTransactions = [
        { hash: '0x1', value: '1000000000000000000', type: 'call', isError: '0' }, // Valid
        { hash: '0x2', value: '2000000000000000000', type: 'CALL', isError: '0' }, // Case sensitivity check
        { hash: '0x3', value: '3000000000000000000', type: 'create2', isError: '0' }, // Create2 - should be filtered
        { hash: '0x4', value: '4000000000000000000', type: 'selfdestruct', isError: '0' }, // Self destruct - should be filtered
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchInternalTransactions({
        contractAddress: '0xDAOMixed',
        network: NetworksEnum.ethereumMainnet,
      })

      // Only lowercase 'call' should pass
      expect(result).to.have.lengthOf(1)
      expect(result[0].hash).to.equal('0x1')
      expect(rpcCallStub.calledOnce).to.be.true
    })
  })

  describe('fetchErc721Transactions', () => {
    it('should fetch and filter ERC721 transactions successfully', async () => {
      const mockTransactions = [
        { hash: '0x1', tokenID: '1', contractAddress: '0xNFT1', isError: '0', from: '0xuser1', to: '0xDAO' }, // Valid NFT transfer
        { hash: '0x2', tokenID: '100', contractAddress: '0xNFT2', isError: '0', from: '0xuser2', to: '0xDAO' }, // Valid NFT transfer
        { hash: '0x3', tokenID: '0', contractAddress: '0xNFT3', isError: '0', from: '0xuser3', to: '0xDAO' }, // Valid NFT with tokenID 0
        { hash: '0x4', tokenID: '', contractAddress: '0xNFT4', isError: '0', from: '0xuser4', to: '0xDAO' }, // Empty tokenID - should be filtered
        { hash: '0x5', tokenID: '500', contractAddress: '0xNFT5', isError: '1', from: '0xuser5', to: '0xDAO' }, // Failed tx - should be filtered
        { hash: '0x6', contractAddress: '0xNFT6', isError: '0', from: '0xuser6', to: '0xDAO' }, // No tokenID field - should be filtered
        { hash: '0x7', tokenID: null, contractAddress: '0xNFT7', isError: '0', from: '0xuser7', to: '0xDAO' }, // Null tokenID - should be filtered
        { hash: '0x8', tokenID: undefined, contractAddress: '0xNFT8', isError: '0', from: '0xuser8', to: '0xDAO' }, // Undefined tokenID - should be filtered
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchErc721Transactions({
        contractAddress: '0xDAO123',
        startBlock: 1000,
        endBlock: '2000',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.have.lengthOf(3)
      expect(result[0]).to.deep.equal(mockTransactions[0])
      expect(result[1]).to.deep.equal(mockTransactions[1])
      expect(result[2]).to.deep.equal(mockTransactions[2])

      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.deep.equal({
        module: 'account',
        action: 'tokennfttx',
        address: '0xDAO123',
        startblock: 1000,
        endblock: '2000',
        sort: 'asc',
      })
      expect(rpcCallStub.firstCall.args[1]).to.equal(NetworksEnum.ethereumMainnet)
    })

    it('should use default values for startBlock and endBlock', async () => {
      const mockTransactions = [{ hash: '0x1', tokenID: '999', contractAddress: '0xNFT', isError: '0' }]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchErc721Transactions({
        contractAddress: '0xDAO456',
        network: NetworksEnum.polygonMainnet,
      })

      expect(result).to.have.lengthOf(1)
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.deep.equal({
        module: 'account',
        action: 'tokennfttx',
        address: '0xDAO456',
        startblock: 0,
        endblock: 'latest',
        sort: 'asc',
      })
    })

    it('should handle empty ERC721 transaction list', async () => {
      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves([])

      const result = await EtherscanHelper.fetchErc721Transactions({
        contractAddress: '0xDAO789',
        startBlock: 5000,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.deep.equal([])
      expect(rpcCallStub.calledOnce).to.be.true
    })

    it('should filter out all ERC721 transactions if none meet criteria', async () => {
      const mockTransactions = [
        { hash: '0x1', tokenID: '', contractAddress: '0xNFT1', isError: '0' }, // Empty tokenID
        { hash: '0x2', tokenID: '100', contractAddress: '0xNFT2', isError: '1' }, // Failed transaction
        { hash: '0x3', contractAddress: '0xNFT3', isError: '0' }, // Missing tokenID field
        { hash: '0x4', tokenID: null, contractAddress: '0xNFT4', isError: '0' }, // Null tokenID
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchErc721Transactions({
        contractAddress: '0xDAO999',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.deep.equal([])
      expect(rpcCallStub.calledOnce).to.be.true
    })

    it('should handle large tokenID values correctly', async () => {
      const mockTransactions = [
        {
          hash: '0x1',
          tokenID: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
          contractAddress: '0xNFT1',
          isError: '0',
        }, // Max uint256
        { hash: '0x2', tokenID: '0', contractAddress: '0xNFT2', isError: '0' }, // Min valid tokenID
        { hash: '0x3', tokenID: '999999999', contractAddress: '0xNFT3', isError: '0' }, // Large tokenID
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchErc721Transactions({
        contractAddress: '0xDAOBig',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.have.lengthOf(3)
      expect(result[0].tokenID).to.equal(
        '115792089237316195423570985008687907853269984665640564039457584007913129639935',
      )
      expect(result[1].tokenID).to.equal('0')
      expect(result[2].tokenID).to.equal('999999999')
      expect(rpcCallStub.calledOnce).to.be.true
    })

    it('should handle API errors gracefully', async () => {
      const expectedError = new Error('Etherscan API error')
      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').rejects(expectedError)
      const loggerStub = sandbox.stub(logger, 'error')

      await expect(
        EtherscanHelper.fetchErc721Transactions({
          contractAddress: '0xDAOError',
          startBlock: 1000,
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.rejectedWith(expectedError)

      expect(rpcCallStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.firstCall.args[0]).to.equal('Error fetchErc721Transactions')
    })

    it('should handle network-specific ERC721 requests', async () => {
      const mockTransactions = [{ hash: '0x1', tokenID: '42', contractAddress: '0xNFT', isError: '0' }]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      // Test with different networks
      const networks = [NetworksEnum.polygonMainnet, NetworksEnum.baseMainnet, NetworksEnum.arbitrumMainnet]

      for (const network of networks) {
        rpcCallStub.resetHistory()

        const result = await EtherscanHelper.fetchErc721Transactions({
          contractAddress: '0xDAONetwork',
          network,
        })

        expect(result).to.have.lengthOf(1)
        expect(rpcCallStub.calledOnce).to.be.true
        expect(rpcCallStub.firstCall.args[1]).to.equal(network)
      }
    })

    it('should handle various tokenID formats correctly', async () => {
      const mockTransactions = [
        { hash: '0x1', tokenID: '123', contractAddress: '0xNFT1', isError: '0' }, // String number - valid
        { hash: '0x2', tokenID: 456, contractAddress: '0xNFT2', isError: '0' }, // Number - valid (truthy)
        { hash: '0x3', tokenID: '0x1F4', contractAddress: '0xNFT3', isError: '0' }, // Hex string - valid
        { hash: '0x4', tokenID: 0, contractAddress: '0xNFT4', isError: '0' }, // Number 0 - falsy, should be filtered
        { hash: '0x5', tokenID: false, contractAddress: '0xNFT5', isError: '0' }, // Boolean false - should be filtered
        { hash: '0x6', tokenID: 'abc', contractAddress: '0xNFT6', isError: '0' }, // Non-numeric string - valid (truthy)
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchErc721Transactions({
        contractAddress: '0xDAOFormats',
        network: NetworksEnum.ethereumMainnet,
      })

      // Filter checks for truthy tokenID values
      expect(result).to.have.lengthOf(4)
      expect(result[0].tokenID).to.equal('123')
      expect(result[1].tokenID).to.equal(456)
      expect(result[2].tokenID).to.equal('0x1F4')
      expect(result[3].tokenID).to.equal('abc')
      expect(rpcCallStub.calledOnce).to.be.true
    })

    it('should handle batch NFT transfers correctly', async () => {
      const mockTransactions = [
        { hash: '0x1', tokenID: '1', contractAddress: '0xNFT1', isError: '0', from: '0xuser1', to: '0xDAO' },
        { hash: '0x1', tokenID: '2', contractAddress: '0xNFT1', isError: '0', from: '0xuser1', to: '0xDAO' }, // Same tx hash, different token
        { hash: '0x1', tokenID: '3', contractAddress: '0xNFT1', isError: '0', from: '0xuser1', to: '0xDAO' }, // Same tx hash, different token
        { hash: '0x2', tokenID: '10', contractAddress: '0xNFT2', isError: '0', from: '0xuser2', to: '0xDAO' },
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchErc721Transactions({
        contractAddress: '0xDAOBatch',
        network: NetworksEnum.ethereumMainnet,
      })

      // All valid NFT transfers should be included
      expect(result).to.have.lengthOf(4)
      expect(result.filter(tx => tx.hash === '0x1')).to.have.lengthOf(3)
      expect(rpcCallStub.calledOnce).to.be.true
    })
  })

  describe('fetchErc20Transactions', () => {
    it('should fetch and filter ERC20 transactions successfully', async () => {
      const mockTransactions = [
        { hash: '0x1', value: '1000000000000000000', tokenSymbol: 'USDT', isError: '0', from: '0xuser1', to: '0xDAO' }, // Valid ERC20 transfer
        { hash: '0x2', value: '2000000000', tokenSymbol: 'USDC', isError: '0', from: '0xuser2', to: '0xDAO' }, // Valid ERC20 transfer
        { hash: '0x3', value: '3000000000000000000', tokenSymbol: 'DAI', isError: '1', from: '0xuser3', to: '0xDAO' }, // Failed tx - should be filtered
        { hash: '0x4', value: '0', tokenSymbol: 'WETH', isError: '0', from: '0xuser4', to: '0xDAO' }, // Zero value but valid
        { hash: '0x5', value: '5000000000000000000', tokenSymbol: 'LINK', isError: '0', from: '0xDAO', to: '0xuser5' }, // Outgoing transfer - valid
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchErc20Transactions({
        contractAddress: '0xDAO123',
        startBlock: 1000,
        endBlock: '2000',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.have.lengthOf(4) // All except the failed one
      expect(result[0]).to.deep.equal(mockTransactions[0])
      expect(result[1]).to.deep.equal(mockTransactions[1])
      expect(result[2]).to.deep.equal(mockTransactions[3]) // Zero value transfer
      expect(result[3]).to.deep.equal(mockTransactions[4])

      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.deep.equal({
        module: 'account',
        action: 'tokentx',
        address: '0xDAO123',
        startblock: 1000,
        endblock: '2000',
        sort: 'asc',
      })
      expect(rpcCallStub.firstCall.args[1]).to.equal(NetworksEnum.ethereumMainnet)
    })

    it('should use default values for startBlock and endBlock', async () => {
      const mockTransactions = [{ hash: '0x1', value: '1000000000000000000', tokenSymbol: 'USDT', isError: '0' }]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchErc20Transactions({
        contractAddress: '0xDAO456',
        network: NetworksEnum.baseMainnet,
      })

      expect(result).to.have.lengthOf(1)
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.deep.equal({
        module: 'account',
        action: 'tokentx',
        address: '0xDAO456',
        startblock: 0,
        endblock: 'latest',
        sort: 'asc',
      })
    })

    it('should handle empty ERC20 transaction list', async () => {
      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves([])

      const result = await EtherscanHelper.fetchErc20Transactions({
        contractAddress: '0xDAO789',
        startBlock: 5000,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.deep.equal([])
      expect(rpcCallStub.calledOnce).to.be.true
    })

    it('should filter out all failed ERC20 transactions', async () => {
      const mockTransactions = [
        { hash: '0x1', value: '1000000000000000000', tokenSymbol: 'USDT', isError: '1' }, // Failed
        { hash: '0x2', value: '2000000000000000000', tokenSymbol: 'USDC', isError: '1' }, // Failed
        { hash: '0x3', value: '3000000000000000000', tokenSymbol: 'DAI', isError: '1' }, // Failed
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchErc20Transactions({
        contractAddress: '0xDAO999',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.deep.equal([])
      expect(rpcCallStub.calledOnce).to.be.true
    })

    it('should handle various isError values correctly', async () => {
      const mockTransactions = [
        { hash: '0x1', value: '1000', tokenSymbol: 'USDT', isError: '0' }, // Valid
        { hash: '0x2', value: '2000', tokenSymbol: 'USDC', isError: '1' }, // Failed - should be filtered
        { hash: '0x3', value: '3000', tokenSymbol: 'DAI', isError: '' }, // Empty string - valid
        { hash: '0x4', value: '4000', tokenSymbol: 'WETH', isError: null }, // Null - valid
        { hash: '0x5', value: '5000', tokenSymbol: 'LINK', isError: undefined }, // Undefined - valid
        { hash: '0x6', value: '6000', tokenSymbol: 'UNI', isError: '2' }, // Other error code - valid
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchErc20Transactions({
        contractAddress: '0xDAOErrors',
        network: NetworksEnum.ethereumMainnet,
      })

      // Only isError === '1' should be filtered out
      expect(result).to.have.lengthOf(5)
      expect(result.find(tx => tx.hash === '0x2')).to.be.undefined
      expect(rpcCallStub.calledOnce).to.be.true
    })

    it('should handle large value amounts correctly', async () => {
      const mockTransactions = [
        { hash: '0x1', value: '999999999999999999999999999999999999', tokenSymbol: 'BIG', isError: '0' }, // Very large value
        { hash: '0x2', value: '1', tokenSymbol: 'TINY', isError: '0' }, // Minimum value
        { hash: '0x3', value: '0', tokenSymbol: 'ZERO', isError: '0' }, // Zero value (valid for ERC20)
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchErc20Transactions({
        contractAddress: '0xDAOBig',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.have.lengthOf(3)
      expect(result[0].value).to.equal('999999999999999999999999999999999999')
      expect(result[1].value).to.equal('1')
      expect(result[2].value).to.equal('0')
      expect(rpcCallStub.calledOnce).to.be.true
    })

    it('should handle API errors gracefully', async () => {
      const expectedError = new Error('Etherscan API error')
      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').rejects(expectedError)
      const loggerStub = sandbox.stub(logger, 'error')

      await expect(
        EtherscanHelper.fetchErc20Transactions({
          contractAddress: '0xDAOError',
          startBlock: 1000,
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.rejectedWith(expectedError)

      expect(rpcCallStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.firstCall.args[0]).to.equal('Error fetchErc20Transactions')
    })

    it('should handle network-specific ERC20 requests', async () => {
      const mockTransactions = [{ hash: '0x1', value: '1000000000000000000', tokenSymbol: 'TOKEN', isError: '0' }]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      // Test with different networks
      const networks = [NetworksEnum.polygonMainnet, NetworksEnum.optimismMainnet, NetworksEnum.arbitrumMainnet]

      for (const network of networks) {
        rpcCallStub.resetHistory()

        const result = await EtherscanHelper.fetchErc20Transactions({
          contractAddress: '0xDAONetwork',
          network,
        })

        expect(result).to.have.lengthOf(1)
        expect(rpcCallStub.calledOnce).to.be.true
        expect(rpcCallStub.firstCall.args[1]).to.equal(network)
      }
    })

    it('should handle multiple token types in the same response', async () => {
      const mockTransactions = [
        { hash: '0x1', value: '1000000000000000000', tokenSymbol: 'USDT', tokenDecimal: '6', isError: '0' },
        { hash: '0x2', value: '2000000000', tokenSymbol: 'USDC', tokenDecimal: '6', isError: '0' },
        { hash: '0x3', value: '3000000000000000000', tokenSymbol: 'DAI', tokenDecimal: '18', isError: '0' },
        { hash: '0x4', value: '4000000000000000000', tokenSymbol: 'WETH', tokenDecimal: '18', isError: '0' },
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchErc20Transactions({
        contractAddress: '0xDAOMulti',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.have.lengthOf(4)
      expect(result.map(tx => tx.tokenSymbol)).to.deep.equal(['USDT', 'USDC', 'DAI', 'WETH'])
      expect(rpcCallStub.calledOnce).to.be.true
    })

    it('should handle transactions with missing optional fields', async () => {
      const mockTransactions = [
        { hash: '0x1', value: '1000', isError: '0' }, // Missing tokenSymbol
        { hash: '0x2', value: '2000', tokenSymbol: 'TOKEN', isError: '0', gas: '21000' }, // Has extra field
        { hash: '0x3', isError: '0' }, // Missing value
        { hash: '0x4', value: '4000', tokenSymbol: 'TEST', isError: '0' }, // Complete
      ]

      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockTransactions)

      const result = await EtherscanHelper.fetchErc20Transactions({
        contractAddress: '0xDAOPartial',
        network: NetworksEnum.ethereumMainnet,
      })

      // All should be included as they have isError !== '1'
      expect(result).to.have.lengthOf(4)
      expect(result[0].tokenSymbol).to.be.undefined
      expect(result[1].gas).to.equal('21000')
      expect(result[2].value).to.be.undefined
      expect(rpcCallStub.calledOnce).to.be.true
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

    it('should return "0" when response is null', async () => {
      sandbox.stub(EtherscanHelper, '_rpCall').resolves(null)
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await EtherscanHelper.getTokenMetrics('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.equal('0')
      expect(loggerStub.called).to.be.false
    })

    it('should return "0" when response is undefined', async () => {
      sandbox.stub(EtherscanHelper, '_rpCall').resolves(undefined)
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await EtherscanHelper.getTokenMetrics('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.equal('0')
      expect(loggerStub.called).to.be.false
    })

    it('should return "0" when response has no status field', async () => {
      sandbox.stub(EtherscanHelper, '_rpCall').resolves({ result: '100000' })
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await EtherscanHelper.getTokenMetrics('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.equal('0')
      expect(loggerStub.called).to.be.false
    })

    it('should return "0" when response has status "1" but missing result field', async () => {
      sandbox.stub(EtherscanHelper, '_rpCall').resolves({ status: '1' })
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await EtherscanHelper.getTokenMetrics('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.equal('0')
      expect(loggerStub.called).to.be.false
    })

    it('should return "0" when response is an empty object', async () => {
      sandbox.stub(EtherscanHelper, '_rpCall').resolves({})
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await EtherscanHelper.getTokenMetrics('0x123', NetworksEnum.ethereumMainnet)

      expect(result).to.equal('0')
      expect(loggerStub.called).to.be.false
    })

    it('should handle different networks correctly', async () => {
      const mockSupply = { result: '500000000000000000000', status: '1' }
      const rpcCallStub = sandbox.stub(EtherscanHelper, '_rpCall').resolves(mockSupply)

      const networks = [NetworksEnum.polygonMainnet, NetworksEnum.baseMainnet, NetworksEnum.arbitrumMainnet]

      for (const network of networks) {
        rpcCallStub.resetHistory()

        const result = await EtherscanHelper.getTokenMetrics('0xToken', network)

        expect(result).to.equal('500000000000000000000')
        expect(rpcCallStub.calledOnce).to.be.true
        expect(rpcCallStub.firstCall.args[1]).to.equal(network)
      }
    })
  })
})
