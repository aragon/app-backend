import { expect } from 'chai'
import sinon from 'sinon'
import { NetworksEnum, ITransactionCategory, ITransactionType, ITokenType } from '@types'
import logger from '@logger'
import { ethers } from 'ethers'
import { ProxyToken } from '@modules/proxyToken'
import utils from '@helpers/utils'
import TokenUtils from '@helpers/tokenUtils'
import ChilizProvider from '@modules/proxyProvider/chilizProvider'
import ProxyUtils from '@modules/proxyProvider/utils'
import Web3Helper from '@helpers/web3'
import RouteScanHelper from '@helpers/routeScanHelper'

describe('ChilizProvider', () => {
  let sandbox: any
  let loggerStub: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerStub = sandbox.stub(logger, 'error')
    sandbox.stub(logger, 'warn')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getTokenBalances', () => {
    it('should return properly formatted token balances', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const mockResponse = {
        message: 'OK',
        result: [
          {
            contractAddress: '0x5f1680d0c2c5e9d3615a036fbdc7432e7bf246fb',
            balance: '1000000000000000000',
            decimals: '18',
          },
          {
            contractAddress: '0x5f1680d0c2c5e9d3615a036fbdc7432e7bf246fd',
            balance: '2000000000000000000',
            decimals: '18',
          },
        ],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockResponse)
      const formatUnitsStub = sandbox.stub(ethers, 'formatUnits')
      formatUnitsStub.withArgs('1000000000000000000', 18).returns('1')
      formatUnitsStub.withArgs('2000000000000000000', 18).returns('2')

      // Act
      const result = await ChilizProvider.getTokenBalances({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.equal('api')
      expect(rpcCallStub.firstCall.args[1]).to.deep.equal({
        module: 'account',
        action: 'tokenlist',
        address,
      })
      expect(rpcCallStub.firstCall.args[2]).to.equal(network)

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

    it('should return empty array when API call fails', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').rejects(new Error('API Error'))

      // Act
      const result = await ChilizProvider.getTokenBalances({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })

    it('should return empty array when response message is not OK', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const mockResponse = { message: 'NOTOK', result: [] }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockResponse)

      // Act
      const result = await ChilizProvider.getTokenBalances({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })
  })

  describe('fetchContractCreation', () => {
    it('should return default values', async () => {
      // Arrange
      const address = '0xcontract'

      // Act
      const result = await ChilizProvider.fetchContractCreation({ address, network: NetworksEnum.chilizMainnet })

      // Assert
      expect(result).to.deep.equal({
        blockNumber: 0,
        transactionHash: null,
        address,
      })
    })
  })

  describe('fetchContractSourceCode', () => {
    it('should return contract source code when available', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet
      const mockResponse = {
        message: 'OK',
        result: [
          {
            SourceCode: 'contract source code',
            ContractName: 'TestContract',
            ABI: '[]',
          },
        ],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockResponse)

      // Act
      const result = await ChilizProvider.fetchContractSourceCode({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.equal('api')
      expect(rpcCallStub.firstCall.args[1]).to.deep.equal({
        module: 'contract',
        action: 'getsourcecode',
        address,
      })

      expect(result).to.have.lengthOf(1)
      expect(result[0]).to.deep.equal({
        SourceCode: 'contract source code',
        ContractName: 'TestContract',
        ABI: '"[]"',
      })
    })

    it('should return null when source code is not available', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet
      const mockResponse = {
        message: 'OK',
        result: [{ SourceCode: '', ContractName: '', ABI: '' }],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockResponse)

      // Act
      const result = await ChilizProvider.fetchContractSourceCode({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true

      expect(result).to.be.null
    })

    it('should return null when API call fails', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').rejects(new Error('API Error'))

      // Act
      const result = await ChilizProvider.fetchContractSourceCode({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.be.null
    })
  })

  describe('fetchBasicTokenInfo', () => {
    it('should fetch native token info for zero address', async () => {
      // Arrange
      const address = utils.zeroAddress
      const network = NetworksEnum.chilizMainnet
      const mockPriceResponse = {
        message: 'OK',
        result: { coin_usd: '0.15' },
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockPriceResponse)

      // Act
      const result = await ChilizProvider.fetchBasicTokenInfo({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[1]).to.deep.equal({
        module: 'stats',
        action: 'coinprice',
      })

      expect(result).to.include({
        address,
        name: 'Chiliz',
        symbol: 'CHZ',
        decimals: 18,
        type: ITokenType.native,
        priceUsd: '0.15',
      })
    })

    it('should handle price fetch failure for native token', async () => {
      // Arrange
      const address = utils.zeroAddress
      const network = NetworksEnum.chilizMainnet

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').rejects(new Error('Price API Error'))

      // Act
      const result = await ChilizProvider.fetchBasicTokenInfo({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.include({
        address,
        name: 'Chiliz',
        symbol: 'CHZ',
        decimals: 18,
        type: ITokenType.native,
        priceUsd: '0',
      })
    })

    it('should fetch token details for non-zero address', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet
      const mockTokenResponse = {
        message: 'OK',
        result: {
          name: 'Test Token',
          symbol: 'TEST',
          decimals: 18,
          type: 'ERC-20',
          totalSupply: '1000000',
        },
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockTokenResponse)

      // Act
      const result = await ChilizProvider.fetchBasicTokenInfo({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[1]).to.deep.equal({
        module: 'token',
        action: 'getToken',
        contractaddress: address,
      })

      expect(result).to.include({
        address,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
        totalSupply: '1000000',
      })
    })

    it('should handle API failure for token info', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').rejects(new Error('API Error'))

      // Act
      const result = await ChilizProvider.fetchBasicTokenInfo({ address, network })
      expect(rpcCallStub.calledOnce).to.be.true

      // Assert
      expect(result).to.include({
        address,
        name: null,
        symbol: null,
        decimals: 0,
        type: ITokenType.unknown,
      })
    })
  })

  describe('fetchTokenHolderAndSupply', () => {
    it('should extract and return holder and supply data from token info', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet

      const fetchBasicTokenInfoStub = sandbox.stub(ChilizProvider, 'fetchBasicTokenInfo').resolves({
        totalHolders: '123',
        totalSupply: '1000000000000000000000',
      } as any)

      // Act
      const result = await ChilizProvider.fetchTokenHolderAndSupply({ address, network })

      // Assert
      expect(fetchBasicTokenInfoStub.calledOnce).to.be.true
      expect(fetchBasicTokenInfoStub.firstCall.args[0]).to.deep.equal({ address, network })

      expect(result).to.deep.equal({
        totalHolders: '123',
        totalSupply: '1000000000000000000000',
      })
    })
  })

  describe('fetchAddressTxns', () => {
    it('should process and filter valid transactions with block filtering', async () => {
      const address = '0x7287715c632e32b415b172A978B18f4bFba7997c'
      const network = NetworksEnum.chilizMainnet

      const mockERC20Transfers = [
        {
          from: '0xcd3352Bf093328A4aC7A54710c23c6342eaC4A39',
          to: address,
          value: '1000000000000000000',
          blockNumber: '100',
          timeStamp: '1622345678',
          hash: '0xtx1',
          contractAddress: '0xtoken1',
          logIndex: '0',
          transactionIndex: '1',
        },
      ]

      const mockExternalTxs = [
        {
          from: address,
          to: '0x53175D75A0b0937268f9a0EfD2217e6a99a4E5A7',
          value: '1500000000000000000',
          blockNumber: '102',
          timeStamp: '1622345720',
          hash: '0xtx3',
          contractAddress: null,
          category: 'external',
          transactionIndex: '1',
        },
      ]

      const mockInternalTxs = [
        {
          from: address,
          to: '0x53175D75A0b0937268f9a0EfD2217e6a99a4E5A7',
          value: '2000000000000000000',
          blockNumber: '101',
          timeStamp: '1622345700',
          hash: '0xtx2',
          index: '0',
          contractAddress: null,
          category: 'internal',
        },
      ]

      const token1 = {
        address: '0xtoken1',
        decimals: 18,
        name: 'Token 1',
        symbol: 'TK1',
        priceUsd: '1.5',
        type: ITokenType.ERC20,
      }

      const nativeToken = {
        address: utils.zeroAddress,
        decimals: 18,
        name: 'Chiliz',
        symbol: 'CHZ',
        priceUsd: '0.15',
        type: ITokenType.native,
      }

      const getProgressStub = sandbox.stub(ProxyUtils, 'getProgressFromConfigIndexer').resolves({ lastSync: 50 })
      const updateProgressStub = sandbox.stub(ProxyUtils, 'updateProgressInConfigIndexer').resolves()
      const getBlockNumberStub = sandbox.stub(Web3Helper, 'getBlockNumber').resolves(150)

      const fetchERC20TransfersStub = sandbox.stub(ChilizProvider, '_fetchERC20Transfers').resolves(mockERC20Transfers)
      const fetchTxListStub = sandbox.stub(ChilizProvider, '_fetchTxList').resolves(mockExternalTxs)
      const fetchInternalTxsStub = sandbox.stub(ChilizProvider, '_fetchInternalTxs').resolves(mockInternalTxs)

      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      saveAndGetTokenStub.withArgs('0xtoken1', network).resolves(token1)
      saveAndGetTokenStub.withArgs(utils.zeroAddress, network).resolves(nativeToken)

      sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(false)

      const formatUnitsStub = sandbox.stub(ethers, 'formatUnits')
      formatUnitsStub.withArgs('1000000000000000000', 18).returns('1.0')
      formatUnitsStub.withArgs('1500000000000000000', 18).returns('1.5')
      formatUnitsStub.withArgs('2000000000000000000', 18).returns('2.0')

      const result = await ChilizProvider.fetchAddressTxns({ address, network })

      expect(getProgressStub.calledOnce).to.be.true
      expect(getBlockNumberStub.calledOnce).to.be.true
      expect(fetchERC20TransfersStub.calledOnce).to.be.true
      expect(fetchTxListStub.calledOnce).to.be.true
      expect(fetchInternalTxsStub.notCalled).to.be.true

      // Verify block filter arguments
      const expectedBlockFilter = { startBlock: 51, endBlock: 150 }
      expect(fetchERC20TransfersStub.firstCall.args[2]).to.deep.equal(expectedBlockFilter)
      expect(fetchTxListStub.firstCall.args[2]).to.deep.equal(expectedBlockFilter)

      expect(result).to.have.lengthOf(2)

      expect(result[0]).to.include({
        from: '0xcd3352Bf093328A4aC7A54710c23c6342eaC4A39',
        to: '0x7287715c632e32b415b172A978B18f4bFba7997c',
        blockNum: 100,
        value: '1.0',
        hash: '0xtx1',
        type: ITransactionType.deposit,
        category: ITransactionCategory.ERC20,
        uniqueId: '0xtx1-undefined-1-0',
      })

      expect(result[1]).to.include({
        from: '0x7287715c632e32b415b172A978B18f4bFba7997c',
        to: '0x53175D75A0b0937268f9a0EfD2217e6a99a4E5A7',
        blockNum: 102,
        value: '1.5',
        type: ITransactionType.withdraw,
        category: ITransactionCategory.External,
        uniqueId: '0xtx3-external-1',
      })

      expect(updateProgressStub.calledOnce).to.be.true
    })

    it('should handle case when no sync progress exists', async () => {
      const address = '0xaddress'
      const network = NetworksEnum.chilizMainnet

      const getProgressStub = sandbox.stub(ProxyUtils, 'getProgressFromConfigIndexer').resolves(null)
      const getBlockNumberStub = sandbox.stub(Web3Helper, 'getBlockNumber').resolves(100)
      const updateProgressStub = sandbox.stub(ProxyUtils, 'updateProgressInConfigIndexer').resolves()

      sandbox.stub(ChilizProvider, '_fetchERC20Transfers').resolves([])
      sandbox.stub(ChilizProvider, '_fetchTxList').resolves([])
      sandbox.stub(ChilizProvider, '_fetchInternalTxs').resolves([])

      await ChilizProvider.fetchAddressTxns({ address, network })

      expect(getProgressStub.calledOnce).to.be.true
      expect(getBlockNumberStub.calledOnce).to.be.true
      expect(updateProgressStub.calledOnce).to.be.true
    })
  })

  describe('_fetchTxList', () => {
    it('should fetch external transactions with pagination and filter valid ones', async () => {
      const address = '0x7287715c632e32b415b172A978B18f4bFba7997c'
      const network = NetworksEnum.chilizMainnet
      const blockFilter = { startBlock: 100, endBlock: 200 }

      const page1Response = {
        message: 'OK',
        result: [
          {
            from: address,
            to: '0xrecipient1',
            value: '1000000000000000000',
            blockNumber: '150',
            timeStamp: '1622345678',
            hash: '0xtx1',
          },
          {
            from: address,
            to: '0xrecipient2',
            value: '0',
            blockNumber: '151',
            timeStamp: '1622345700',
            hash: '0xtx2',
          },
          {
            from: address,
            to: '0xrecipient3',
            value: '2000000000000000000',
            blockNumber: '152',
            timeStamp: '1622345720',
            hash: '0xtx3',
          },
        ],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall')
      rpcCallStub.onCall(0).resolves(page1Response)

      const result = await ChilizProvider._fetchTxList(address, network, blockFilter)

      expect(rpcCallStub.callCount).to.equal(1)

      expect(rpcCallStub.firstCall.args[1]).to.deep.equal({
        module: 'account',
        action: 'txlist',
        address,
        page: 1,
        offset: 100,
        startblock: 100,
        endblock: 200,
      })

      // Should filter out zero value transaction and add contractAddress: null and category: 'external'
      expect(result).to.have.lengthOf(2)
      expect(result[0]).to.deep.equal({
        from: address,
        to: '0xrecipient1',
        value: '1000000000000000000',
        blockNumber: '150',
        timeStamp: '1622345678',
        hash: '0xtx1',
        contractAddress: null,
        category: 'external',
      })
      expect(result[1]).to.deep.equal({
        from: address,
        to: '0xrecipient3',
        value: '2000000000000000000',
        blockNumber: '152',
        timeStamp: '1622345720',
        hash: '0xtx3',
        contractAddress: null,
        category: 'external',
      })
    })

    it('should handle API errors gracefully', async () => {
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const blockFilter = { startBlock: 0, endBlock: 100 }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').rejects(new Error('API Error'))

      const result = await ChilizProvider._fetchTxList(address, network, blockFilter)

      expect(rpcCallStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })

    it('should stop pagination when response is not OK', async () => {
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const blockFilter = { startBlock: 0, endBlock: 100 }

      const errorResponse = {
        message: 'NOTOK',
        result: [],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(errorResponse)

      const result = await ChilizProvider._fetchTxList(address, network, blockFilter)

      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })
  })

  describe('_fetchERC20Transfers', () => {
    it('should fetch ERC20 transfers with pagination and block filtering', async () => {
      const address = '0x7287715c632e32b415b172A978B18f4bFba7997c'
      const network = NetworksEnum.chilizMainnet
      const blockFilter = { startBlock: 100, endBlock: 200 }

      const page1Response = {
        message: 'OK',
        result: Array.from({ length: 100 }, (_, i) => ({
          from: '0xsender1',
          to: address,
          value: '1000000000000000000',
          blockNumber: `${100 + i}`,
          timeStamp: '1622345678',
          hash: `0xtx${i}`,
          contractAddress: '0xtoken1',
          category: ITransactionCategory.ERC20,
          logIndex: `${i}`,
          transactionIndex: `${i}`,
        })),
      }

      const page2Response = {
        message: 'OK',
        result: [
          {
            from: address,
            to: '0xrecipient1',
            value: '500000000000000000',
            blockNumber: '101',
            category: ITransactionCategory.ERC20,
            timeStamp: '1622345700',
            hash: '0xtx2',
            contractAddress: '0xtoken2',
            logIndex: '1',
            transactionIndex: '2',
          },
        ],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall')
      rpcCallStub.onCall(0).resolves(page1Response)
      rpcCallStub.onCall(1).resolves(page2Response)

      const result = await ChilizProvider._fetchERC20Transfers(address, network, blockFilter)

      expect(rpcCallStub.callCount).to.equal(2)

      expect(rpcCallStub.firstCall.args[1]).to.deep.equal({
        module: 'account',
        action: 'tokentx',
        address,
        page: 1,
        offset: 100,
        startblock: 100,
        endblock: 200,
      })

      expect(rpcCallStub.secondCall.args[1]).to.deep.equal({
        module: 'account',
        action: 'tokentx',
        address,
        page: 2,
        offset: 100,
        startblock: 100,
        endblock: 200,
      })

      expect(result).to.have.lengthOf(101)
      expect(result[0]).to.deep.equal(page1Response.result[0])
      expect(result[100]).to.deep.equal(page2Response.result[0])
    })

    it('should stop pagination when response is not OK', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const blockFilter = { startBlock: 0, endBlock: 100 }

      const errorResponse = {
        message: 'NOTOK',
        result: [],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(errorResponse)

      // Act
      const result = await ChilizProvider._fetchERC20Transfers(address, network, blockFilter)

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })

    it('should stop pagination when result is empty', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const blockFilter = { startBlock: 0, endBlock: 100 }

      const emptyResponse = {
        message: 'OK',
        result: [],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(emptyResponse)

      // Act
      const result = await ChilizProvider._fetchERC20Transfers(address, network, blockFilter)

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })

    it('should stop pagination when result length is less than offset', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const blockFilter = { startBlock: 0, endBlock: 100 }

      const partialResponse = {
        message: 'OK',
        result: [
          {
            from: '0xsender',
            to: address,
            value: '1000000000000000000',
            blockNumber: '100',
            timeStamp: '1622345678',
            hash: '0xtx1',
            category: ITransactionCategory.ERC20,
            contractAddress: '0xtoken1',
            logIndex: '0',
            transactionIndex: '1',
          },
        ],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(partialResponse)

      // Act
      const result = await ChilizProvider._fetchERC20Transfers(address, network, blockFilter)

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.have.lengthOf(1)
      expect(result[0]).to.deep.equal(partialResponse.result[0])
    })

    it('should handle API errors gracefully', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const blockFilter = { startBlock: 0, endBlock: 100 }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').rejects(new Error('API Error'))

      // Act
      const result = await ChilizProvider._fetchERC20Transfers(address, network, blockFilter)

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })

    it('should handle missing result property', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const blockFilter = { startBlock: 0, endBlock: 100 }

      const invalidResponse = {
        message: 'OK',
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(invalidResponse)

      // Act
      const result = await ChilizProvider._fetchERC20Transfers(address, network, blockFilter)

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })
  })

  describe('_fetchInternalTxs', () => {
    it('should fetch internal transactions with pagination and filter valid ones', async () => {
      const address = '0x7287715c632e32b415b172A978B18f4bFba7997c'
      const network = NetworksEnum.chilizMainnet
      const blockFilter = { startBlock: 100, endBlock: 200 }

      const page1Response = {
        message: 'OK',
        result: [
          {
            from: address,
            to: '0xrecipient1',
            value: '1000000000000000000',
            blockNumber: '150',
            timeStamp: '1622345678',
            transactionHash: '0xtx1',
            index: '0',
            type: 'call',
          },
          {
            from: address,
            to: '0xrecipient2',
            value: '0',
            blockNumber: '151',
            timeStamp: '1622345700',
            transactionHash: '0xtx2',
            index: '1',
            type: 'call',
          },
          {
            from: address,
            to: '0xrecipient3',
            value: '2000000000000000000',
            blockNumber: '152',
            timeStamp: '1622345720',
            transactionHash: '0xtx3',
            index: '2',
            type: 'delegatecall',
          },
          {
            from: address,
            to: '0xrecipient4',
            value: '3000000000000000000',
            blockNumber: '153',
            timeStamp: '1622345740',
            transactionHash: '0xtx4',
            index: '3',
            type: 'call',
          },
        ],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall')
      rpcCallStub.onCall(0).resolves(page1Response)

      const result = await ChilizProvider._fetchInternalTxs(address, network, blockFilter)

      expect(rpcCallStub.callCount).to.equal(1)

      expect(rpcCallStub.firstCall.args[1]).to.deep.equal({
        module: 'account',
        action: 'txlistinternal',
        address,
        page: 1,
        offset: 100,
        startblock: 100,
        endblock: 200,
      })

      // Should filter out zero value transaction, non-call type, and add contractAddress: null and category: 'internal'
      expect(result).to.have.lengthOf(2)
      expect(result[0]).to.deep.equal({
        from: address,
        to: '0xrecipient1',
        value: '1000000000000000000',
        blockNumber: '150',
        timeStamp: '1622345678',
        transactionHash: '0xtx1',
        index: '0',
        type: 'call',
        contractAddress: null,
        category: 'internal',
        hash: '0xtx1',
      })
      expect(result[1]).to.deep.equal({
        from: address,
        to: '0xrecipient4',
        value: '3000000000000000000',
        blockNumber: '153',
        timeStamp: '1622345740',
        transactionHash: '0xtx4',
        index: '3',
        type: 'call',
        contractAddress: null,
        category: 'internal',
        hash: '0xtx4',
      })
    })

    it('should properly test pagination with 3 calls when needed', async () => {
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const blockFilter = { startBlock: 0, endBlock: 100 }

      const page1Response = {
        message: 'OK',
        result: Array.from({ length: 100 }, (_, i) => ({
          from: address,
          to: `0xrecipient${i}`,
          value: '1000000000000000000',
          blockNumber: `${100 + i}`,
          timeStamp: `${1622345678 + i}`,
          transactionHash: `0xtx${i}`,
          index: `${i}`,
          type: 'call',
        })),
      }

      // Page 2: Full 100 results
      const page2Response = {
        message: 'OK',
        result: Array.from({ length: 100 }, (_, i) => ({
          from: address,
          to: `0xrecipient${i + 100}`,
          value: '2000000000000000000',
          blockNumber: `${200 + i}`,
          timeStamp: `${1622345778 + i}`,
          transactionHash: `0xtx${i + 100}`,
          index: `${i}`,
          type: 'call',
        })),
      }

      // Page 3: Empty results (stops pagination)
      const page3Response = {
        message: 'OK',
        result: [],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall')
      rpcCallStub.onCall(0).resolves(page1Response)
      rpcCallStub.onCall(1).resolves(page2Response)
      rpcCallStub.onCall(2).resolves(page3Response)

      // Act
      const result = await ChilizProvider._fetchInternalTxs(address, network, blockFilter)

      // Assert
      expect(rpcCallStub.callCount).to.equal(3)
      expect(result).to.have.lengthOf(200)

      // Verify all transactions have contractAddress set to null
      result.forEach(tx => {
        expect(tx.contractAddress).to.be.null
      })
    })

    it('should stop pagination when response is not OK', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const blockFilter = { startBlock: 0, endBlock: 100 }

      const errorResponse = {
        message: 'NOTOK',
        result: [],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(errorResponse)

      // Act
      const result = await ChilizProvider._fetchInternalTxs(address, network, blockFilter)

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })

    it('should stop pagination when result length is less than offset', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const blockFilter = { startBlock: 0, endBlock: 100 }

      const partialResponse = {
        message: 'OK',
        result: [
          {
            from: address,
            to: '0xrecipient1',
            value: '1000000000000000000',
            blockNumber: '100',
            timeStamp: '1622345678',
            transactionHash: '0xtx1',
            index: '0',
            type: 'call',
          },
        ],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(partialResponse)

      // Act
      const result = await ChilizProvider._fetchInternalTxs(address, network, blockFilter)

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.have.lengthOf(1)
      expect(result[0]).to.deep.equal({
        ...partialResponse.result[0],
        contractAddress: null,
        category: 'internal',
        hash: '0xtx1',
      })
    })

    it('should handle API errors gracefully', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const blockFilter = { startBlock: 0, endBlock: 100 }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').rejects(new Error('API Error'))

      // Act
      const result = await ChilizProvider._fetchInternalTxs(address, network, blockFilter)

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })

    it('should handle missing result property', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const blockFilter = { startBlock: 0, endBlock: 100 }

      const invalidResponse = {
        message: 'OK',
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(invalidResponse)

      // Act
      const result = await ChilizProvider._fetchInternalTxs(address, network, blockFilter)

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })

    it('should continue pagination until no more data', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const blockFilter = { startBlock: 0, endBlock: 100 }

      // Create 100 valid transactions for first page (full page)
      const fullPageTransactions = Array.from({ length: 100 }, (_, i) => ({
        from: address,
        to: `0xrecipient${i}`,
        value: '1000000000000000000',
        blockNumber: `${100 + i}`,
        timeStamp: `${1622345678 + i}`,
        transactionHash: `0xtx${i}`,
        index: `${i}`,
        type: 'call',
      }))

      const page1Response = {
        message: 'OK',
        result: fullPageTransactions,
      }

      const page2Response = {
        message: 'OK',
        result: [],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall')
      rpcCallStub.onCall(0).resolves(page1Response)
      rpcCallStub.onCall(1).resolves(page2Response)

      // Act
      const result = await ChilizProvider._fetchInternalTxs(address, network, blockFilter)

      // Assert
      expect(rpcCallStub.callCount).to.equal(2)
      expect(result).to.have.lengthOf(100)

      // Verify all transactions have contractAddress set to null
      result.forEach(tx => {
        expect(tx.contractAddress).to.be.null
      })
    })
  })

  describe('fetchTokenPrice', () => {
    it('should fetch native token price for zero address', async () => {
      // Arrange
      const address = utils.zeroAddress
      const network = NetworksEnum.chilizMainnet
      const mockResponse = {
        message: 'OK',
        result: { coin_usd: '0.15' },
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockResponse)

      // Act
      const result = await ChilizProvider.fetchTokenPrice({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        priceUsd: '0.15',
      })
    })

    it('should return default price when native price fetch fails', async () => {
      // Arrange
      const address = utils.zeroAddress
      const network = NetworksEnum.chilizMainnet

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').rejects(new Error('API Error'))

      // Act
      const result = await ChilizProvider.fetchTokenPrice({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        priceUsd: '0',
      })
    })

    it('should return default price for non-zero address', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet

      // Act
      const result = await ChilizProvider.fetchTokenPrice({ address, network })

      // Assert
      expect(result).to.deep.equal({
        priceUsd: '0',
      })
    })
  })

  describe('searchDetailsOfContract', () => {
    it('should return token details when token type is known', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet
      const tokenInfo = {
        name: 'Test Token',
        type: ITokenType.ERC20,
      }

      const fetchBasicTokenInfoStub = sandbox.stub(ChilizProvider, 'fetchBasicTokenInfo').resolves(tokenInfo as any)

      // Act
      const result = await ChilizProvider.searchDetailsOfContract({ address, network })

      // Assert
      expect(fetchBasicTokenInfoStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        type: 'token',
        name: 'Test Token',
      })
    })

    it('should fallback to contract source code when token type is unknown', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet
      const tokenInfo = { type: ITokenType.unknown }
      const contractInfo = [{ ContractName: 'TestContract' }]

      const fetchBasicTokenInfoStub = sandbox.stub(ChilizProvider, 'fetchBasicTokenInfo').resolves(tokenInfo as any)
      const fetchContractSourceCodeStub = sandbox
        .stub(ChilizProvider, 'fetchContractSourceCode')
        .resolves(contractInfo as any)

      // Act
      const result = await ChilizProvider.searchDetailsOfContract({ address, network })

      // Assert
      expect(fetchBasicTokenInfoStub.calledOnce).to.be.true
      expect(fetchContractSourceCodeStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        type: 'address',
        name: 'TestContract',
      })
    })

    it('should handle case when contract source code is not available', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet
      const tokenInfo = { type: ITokenType.unknown }

      sandbox.stub(ChilizProvider, 'fetchBasicTokenInfo').resolves(tokenInfo as any)
      sandbox.stub(ChilizProvider, 'fetchContractSourceCode').resolves(null)

      // Act
      const result = await ChilizProvider.searchDetailsOfContract({ address, network })

      // Assert
      expect(result).to.deep.equal({
        type: 'address',
        name: null,
      })
    })
  })

  describe('getAllTokenHolders', () => {
    it('should fetch all token holders with callback and sync tracking', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet
      const syncKey = 'test-sync-key'
      const mockCallback = sinon.stub()

      const mockHolders = [
        { address: '0xholder1', value: '100' },
        { address: '0xholder2', value: '200' },
      ]

      const mockResponse = {
        holders: mockHolders,
        total: mockHolders.length,
        hasMore: false,
        lastPage: 1,
      }

      const getProgressStub = sandbox.stub(ProxyUtils, 'getProgressFromConfigIndexer').resolves(null)
      const updateProgressStub = sandbox.stub(ProxyUtils, 'updateProgressInConfigIndexer').resolves()

      let capturedCallback: Function | undefined
      const getAllTokenHoldersStub = sandbox
        .stub(ChilizProvider, '_getAllTokenHolders')
        .callsFake(async (_tokenAddr: any, _net: any, _opts: any, callback: any) => {
          capturedCallback = callback

          if (callback && typeof callback === 'function') {
            await callback(mockHolders, {
              currentPage: 1,
              isLastPage: true,
              total: mockHolders.length,
            })
          }

          return mockResponse
        })

      // Act
      const result = await ChilizProvider.getAllTokenHolders({
        address,
        network,
        callback: mockCallback,
        syncKey,
      })

      // Assert
      expect(getProgressStub.calledOnceWith(network, syncKey)).to.be.true
      expect(getAllTokenHoldersStub.calledOnce).to.be.true
      expect(capturedCallback).to.be.a('function')
      expect(mockCallback.callCount).to.be.eq(2)
      expect(result).to.deep.equal(mockResponse)
      expect(updateProgressStub.calledOnce).to.be.true
    })

    it('should return early when sync is already completed', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet
      const syncKey = 'test-sync-key'
      const syncProgress = { lastSync: 5, end: true }

      const getProgressStub = sandbox.stub(ProxyUtils, 'getProgressFromConfigIndexer').resolves(syncProgress)
      const getAllTokenHoldersStub = sandbox.stub(ChilizProvider, '_getAllTokenHolders')

      // Act
      await ChilizProvider.getAllTokenHolders({
        address,
        network,
        callback: () => {},
        syncKey,
      })

      // Assert
      expect(getProgressStub.calledOnceWith(network, syncKey)).to.be.true
      expect(getAllTokenHoldersStub.called).to.be.false
    })

    it('should handle errors gracefully', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet
      const syncKey = 'test-sync-key'
      const error = new Error('API error')

      const getProgressStub = sandbox.stub(ProxyUtils, 'getProgressFromConfigIndexer').resolves(null)
      const getAllTokenHoldersStub = sandbox.stub(ChilizProvider, '_getAllTokenHolders').rejects(error)

      // Act
      await ChilizProvider.getAllTokenHolders({
        address,
        network,
        callback: () => {},
        syncKey,
      })

      // Assert
      expect(getProgressStub.calledOnceWith(network, syncKey)).to.be.true
      expect(getAllTokenHoldersStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
    })
  })

  describe('getTokenCounters', () => {
    it('should return token counters using routescan', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet

      const routeScanStub = sandbox.stub(RouteScanHelper, 'fetchTokenHoldersCount').resolves(10)

      // Act
      const result = await ChilizProvider.getTokenCounters({ address, network })

      // Assert
      expect(routeScanStub.calledOnce).to.be.true
      expect(routeScanStub.firstCall.args[0]).to.deep.eq({
        network,
        address,
      })

      expect(result).to.deep.equal({
        transfers: 0,
        holders: 10,
      })
    })
  })

  describe('getTokenHoldersPage', () => {
    it('should fetch token holders for a specific page', async () => {
      // Arrange
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.chilizMainnet
      const page = 1
      const pageSize = 100

      const mockResponse = {
        message: 'OK',
        result: [
          { address: '0xe02f37d18a73736837f818476d48ef8db1188611', value: '1000000000000000000' },
          { address: '0xe02f37d18a73736837f818476d48ef8db1188612', value: '2000000000000000000' },
          { address: '0xe02f37d18a73736837f818476d48ef8db1188613', value: '3000000000000000000' },
        ],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockResponse)

      // Act
      const result = await ChilizProvider.getTokenHoldersPage(tokenAddress, network, page, pageSize)

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.equal('api')
      expect(rpcCallStub.firstCall.args[1]).to.deep.equal({
        module: 'token',
        action: 'getTokenHolders',
        contractaddress: tokenAddress,
        page,
        offset: pageSize,
      })
      expect(rpcCallStub.firstCall.args[2]).to.equal(network)

      expect(result).to.deep.equal({
        holders: [
          { address: ethers.getAddress('0xe02f37d18a73736837f818476d48ef8db1188611'), value: '1000000000000000000' },
          { address: ethers.getAddress('0xe02f37d18a73736837f818476d48ef8db1188612'), value: '2000000000000000000' },
          { address: ethers.getAddress('0xe02f37d18a73736837f818476d48ef8db1188613'), value: '3000000000000000000' },
        ],
        total: 3,
      })
    })

    it('should use default page and pageSize when not provided', async () => {
      // Arrange
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.chilizMainnet

      const mockResponse = {
        message: 'OK',
        result: [{ address: '0xholder1', value: '1000000000000000000' }],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockResponse)

      // Act
      await ChilizProvider.getTokenHoldersPage(tokenAddress, network)

      // Assert
      expect(rpcCallStub.firstCall.args[1]).to.deep.equal({
        module: 'token',
        action: 'getTokenHolders',
        contractaddress: tokenAddress,
        page: 1,
        offset: 100,
      })
    })

    it('should return empty holders when response is not OK', async () => {
      // Arrange
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.chilizMainnet

      const mockResponse = {
        message: 'NOTOK',
        result: [],
      }

      sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockResponse)

      const result = await ChilizProvider.getTokenHoldersPage(tokenAddress, network)

      // Assert
      expect(result).to.deep.equal({
        holders: [],
        total: 0,
      })
    })

    it('should return empty holders when result is not an array', async () => {
      // Arrange
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.chilizMainnet

      const mockResponse = {
        message: 'OK',
        result: null,
      }

      sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockResponse)

      const result = await ChilizProvider.getTokenHoldersPage(tokenAddress, network)

      // Assert
      expect(result).to.deep.equal({
        holders: [],
        total: 0,
      })
    })

    it('should handle API errors gracefully', async () => {
      // Arrange
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.chilizMainnet

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').rejects(new Error('API Error'))

      // Act
      const result = await ChilizProvider.getTokenHoldersPage(tokenAddress, network)

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        holders: [],
        total: 0,
      })
    })
  })

  describe('_getAllTokenHolders', () => {
    it('should fetch all token holders with pagination and callback', async () => {
      // Arrange
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.chilizMainnet
      const mockCallback = sandbox.stub()

      const page1Holders = Array.from({ length: 100 }, (_, i) => ({
        address: `0xholder${i}`,
        value: `${(i + 1) * 1000000000000000000}`,
      }))

      const page2Holders = [
        { address: '0xholder100', value: '101000000000000000000' },
        { address: '0xholder101', value: '102000000000000000000' },
      ]

      const getTokenHoldersPageStub = sandbox.stub(ChilizProvider, 'getTokenHoldersPage')
      getTokenHoldersPageStub.onCall(0).resolves({ holders: page1Holders, total: 100 })
      getTokenHoldersPageStub.onCall(1).resolves({ holders: page2Holders, total: 2 })

      const waitStub = sandbox.stub(utils, 'wait').resolves()

      // Act
      const result = await ChilizProvider._getAllTokenHolders(
        tokenAddress,
        network,
        { pageSize: 100, delayMs: 500, startPage: 1 },
        mockCallback,
      )

      // Assert
      expect(getTokenHoldersPageStub.callCount).to.equal(2)
      expect(getTokenHoldersPageStub.firstCall.args).to.deep.equal([tokenAddress, network, 1, 100])
      expect(getTokenHoldersPageStub.secondCall.args).to.deep.equal([tokenAddress, network, 2, 100])

      expect(mockCallback.callCount).to.equal(2)
      expect(mockCallback.firstCall.args).to.deep.equal([
        page1Holders,
        { currentPage: 1, isLastPage: false, total: 100 },
      ])
      expect(mockCallback.secondCall.args).to.deep.equal([page2Holders, { currentPage: 2, isLastPage: true, total: 2 }])

      expect(waitStub.calledOnce).to.be.true
      expect(waitStub.firstCall.args[0]).to.equal(500)

      expect(result).to.deep.equal({
        holders: [...page1Holders, ...page2Holders],
        total: 102,
        hasMore: false,
        lastPage: 2,
      })
    })

    it('should work without callback', async () => {
      // Arrange
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.chilizMainnet

      const holders = [
        { address: '0xholder1', value: '1000000000000000000' },
        { address: '0xholder2', value: '2000000000000000000' },
      ]

      const getTokenHoldersPageStub = sandbox.stub(ChilizProvider, 'getTokenHoldersPage').resolves({
        holders,
        total: 2,
      })

      // Act
      const result = await ChilizProvider._getAllTokenHolders(tokenAddress, network)

      // Assert
      expect(getTokenHoldersPageStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        holders,
        total: 2,
        hasMore: false,
        lastPage: 1,
      })
    })

    it('should stop when no more holders are found', async () => {
      // Arrange
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.chilizMainnet

      const getTokenHoldersPageStub = sandbox.stub(ChilizProvider, 'getTokenHoldersPage').resolves({
        holders: [],
        total: 0,
      })

      // Act
      const result = await ChilizProvider._getAllTokenHolders(tokenAddress, network)

      // Assert
      expect(getTokenHoldersPageStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        holders: [],
        total: 0,
        hasMore: false,
        lastPage: 1,
      })
    })

    it('should handle custom start page', async () => {
      // Arrange
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.chilizMainnet
      const startPage = 5

      const holders = [{ address: '0xholder1', value: '1000000000000000000' }]

      const getTokenHoldersPageStub = sandbox.stub(ChilizProvider, 'getTokenHoldersPage').resolves({
        holders,
        total: 1,
      })

      // Act
      const result = await ChilizProvider._getAllTokenHolders(tokenAddress, network, {
        pageSize: 100,
        delayMs: 500,
        startPage,
      })

      // Assert
      expect(getTokenHoldersPageStub.firstCall.args[2]).to.equal(startPage)
      expect(result.lastPage).to.equal(startPage)
    })

    it('should handle errors gracefully', async () => {
      // Arrange
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.chilizMainnet

      const getTokenHoldersPageStub = sandbox
        .stub(ChilizProvider, 'getTokenHoldersPage')
        .rejects(new Error('API Error'))

      // Act
      const result = await ChilizProvider._getAllTokenHolders(tokenAddress, network)

      // Assert
      expect(getTokenHoldersPageStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        holders: [],
        total: 0,
        hasMore: false,
        lastPage: 1,
      })
    })
  })

  describe('_rpcCall', () => {
    let axiosStub: any
    let bottleneckStub: any
    let retryRequestStub: any

    beforeEach(() => {
      axiosStub = sandbox.stub()
      bottleneckStub = {
        schedule: sandbox.stub().callsFake(async (fn: Function) => fn()),
      }
      retryRequestStub = sandbox.stub().callsFake(async (fn: Function) => fn())

      // Mock the modules
      sandbox.stub(require('axios'), 'get').callsFake(axiosStub)
      sandbox.stub(require('@helpers/retryRequest'), 'retryRequest').callsFake(retryRequestStub)
      sandbox.stub(require('@modules/bottleneck'), 'default').value({
        getChilizLimiter: sandbox.stub().returns(bottleneckStub),
      })
    })

    it('should make successful API call', async () => {
      // Arrange
      const path = 'api'
      const params = { module: 'account', action: 'balance', address: '0x123' }
      const network = NetworksEnum.chilizMainnet
      const mockResponseData = { message: 'OK', result: '1000000000000000000' }

      axiosStub.resolves({ data: mockResponseData })

      // Act
      const result = await ChilizProvider._rpcCall(path, params, network)

      // Assert
      expect(retryRequestStub.calledOnce).to.be.true
      expect(bottleneckStub.schedule.calledOnce).to.be.true
      expect(axiosStub.calledOnce).to.be.true
      expect(axiosStub.firstCall.args[0]).to.equal('https://scan.chiliz.com/api')
      expect(axiosStub.firstCall.args[1]).to.deep.equal({ params })
      expect(result).to.deep.equal(mockResponseData)
    })

    it('should handle axios errors', async () => {
      // Arrange
      const path = 'api'
      const params = { module: 'account', action: 'balance' }
      const network = NetworksEnum.chilizMainnet
      const error = new Error('Network Error')

      axiosStub.rejects(error)

      // Act & Assert
      try {
        await ChilizProvider._rpcCall(path, params, network)
        expect.fail('Should have thrown an error')
      } catch (thrownError) {
        expect(thrownError).to.equal(error)
      }
    })

    it('should construct correct URL for different paths', async () => {
      // Arrange
      const path = 'token-counters'
      const params = { id: '0xtoken' }
      const network = NetworksEnum.chilizMainnet
      const mockResponseData = { token_holder_count: 100 }

      axiosStub.resolves({ data: mockResponseData })

      // Act
      await ChilizProvider._rpcCall(path, params, network)

      // Assert
      expect(axiosStub.firstCall.args[0]).to.equal('https://scan.chiliz.com/token-counters')
    })

    it('should handle bottleneck rate limiting', async () => {
      // Arrange
      const path = 'api'
      const params = { module: 'stats', action: 'coinprice' }
      const network = NetworksEnum.chilizMainnet
      const mockResponseData = { message: 'OK', result: { coin_usd: '0.15' } }

      let scheduledFunction: Function
      bottleneckStub.schedule.callsFake((fn: Function) => {
        scheduledFunction = fn
        return fn()
      })

      axiosStub.resolves({ data: mockResponseData })

      // Act
      const result = await ChilizProvider._rpcCall(path, params, network)

      // Assert
      expect(bottleneckStub.schedule.calledOnce).to.be.true
      expect(typeof scheduledFunction!).to.equal('function')
      expect(result).to.deep.equal(mockResponseData)
    })

    it('should handle retry mechanism', async () => {
      // Arrange
      const path = 'api'
      const params = { module: 'account', action: 'tokenlist' }
      const network = NetworksEnum.chilizMainnet
      const mockResponseData = { message: 'OK', result: [] }

      let retryFunction: Function
      retryRequestStub.callsFake((fn: Function) => {
        retryFunction = fn
        return fn()
      })

      axiosStub.resolves({ data: mockResponseData })

      // Act
      const result = await ChilizProvider._rpcCall(path, params, network)

      // Assert
      expect(retryRequestStub.calledOnce).to.be.true
      expect(typeof retryFunction!).to.equal('function')
      expect(result).to.deep.equal(mockResponseData)
    })
  })
})
