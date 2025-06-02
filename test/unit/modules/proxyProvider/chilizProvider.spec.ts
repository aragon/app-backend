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
    it('should process and filter valid transactions', async () => {
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

      const mockInternalTxs = [
        {
          from: address,
          to: '0x53175D75A0b0937268f9a0EfD2217e6a99a4E5A7',
          value: '2000000000000000000',
          blockNumber: '101',
          timeStamp: '1622345700',
          transactionHash: '0xtx2',
          index: '0',
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

      const fetchERC20TransfersStub = sandbox.stub(ChilizProvider, '_fetchERC20Transfers').resolves(mockERC20Transfers)
      const fetchInternalTxsStub = sandbox.stub(ChilizProvider, '_fetchInternalTxs').resolves(mockInternalTxs)

      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      saveAndGetTokenStub.withArgs('0xtoken1', network).resolves(token1)
      saveAndGetTokenStub.withArgs(utils.zeroAddress, network).resolves(nativeToken)

      sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(false)

      const formatUnitsStub = sandbox.stub(ethers, 'formatUnits')
      formatUnitsStub.withArgs('1000000000000000000', 18).returns('1.0')
      formatUnitsStub.withArgs('2000000000000000000', 18).returns('2.0')

      const result = await ChilizProvider.fetchAddressTxns({ address, network })

      expect(fetchERC20TransfersStub.calledOnce).to.be.true
      expect(fetchInternalTxsStub.calledOnce).to.be.true

      expect(result).to.have.lengthOf(2)

      expect(result[0]).to.include({
        from: '0xcd3352Bf093328A4aC7A54710c23c6342eaC4A39',
        to: '0x7287715c632e32b415b172A978B18f4bFba7997c',
        blockNum: 100,
        value: '1.0',
        hash: '0xtx1',
        type: ITransactionType.deposit,
        category: ITransactionCategory.ERC20,
      })

      expect(result[1]).to.include({
        from: '0x7287715c632e32b415b172A978B18f4bFba7997c',
        to: '0x53175D75A0b0937268f9a0EfD2217e6a99a4E5A7',
        blockNum: 101,
        value: '2.0',
        type: ITransactionType.withdraw,
        category: ITransactionCategory.External,
      })
    })

    it('should filter out transactions with scam tokens', async () => {
      const address = '0xaddress'
      const network = NetworksEnum.chilizMainnet

      const mockERC20Transfers = [
        {
          from: '0xsender',
          to: address,
          value: '1000000000000000000',
          blockNumber: '100',
          timeStamp: '1622345678',
          hash: '0xtx1',
          contractAddress: '0xscamtoken',
          logIndex: '0',
          transactionIndex: '1',
        },
      ]

      const scamToken = {
        address: '0xscamtoken',
        decimals: 18,
        name: 'SCAM Airdrop',
        symbol: 'SCAM',
        priceUsd: '0.000001',
        type: ITokenType.ERC20,
      }

      const fetchERC20TransfersStub = sandbox.stub(ChilizProvider, '_fetchERC20Transfers').resolves(mockERC20Transfers)
      const fetchInternalTxsStub = sandbox.stub(ChilizProvider, '_fetchInternalTxs').resolves([])
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(scamToken)
      const analyzeIfScamTokenStub = sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(true)

      // Act
      const result = await ChilizProvider.fetchAddressTxns({ address, network })

      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(fetchERC20TransfersStub.calledOnce).to.be.true
      expect(fetchInternalTxsStub.calledOnce).to.be.true
      expect(analyzeIfScamTokenStub.calledOnce).to.be.true

      expect(result).to.be.an('array').that.is.empty
    })

    it('should handle errors gracefully', async () => {
      // Arrange
      const address = '0xaddress'
      const network = NetworksEnum.chilizMainnet

      sandbox.stub(ChilizProvider, '_fetchERC20Transfers').rejects(new Error('API Error'))
      sandbox.stub(ChilizProvider, '_fetchInternalTxs').resolves([])

      // Act
      const result = await ChilizProvider.fetchAddressTxns({ address, network })

      // Assert
      expect(loggerStub.calledOnce).to.be.true
      expect(result).to.be.an('array').that.is.empty
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
    it('should return token counters when API call succeeds', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet
      const mockResponse = {
        token_holder_count: 150,
        token_holders: 75,
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockResponse)

      // Act
      const result = await ChilizProvider.getTokenCounters({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.equal('token-counters')
      expect(rpcCallStub.firstCall.args[1]).to.deep.equal({ id: address })

      expect(result).to.deep.equal({
        transfers: 150,
        holders: 75,
      })
    })

    it('should return default values when API call fails', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet

      sandbox.stub(ChilizProvider, '_rpcCall').rejects(new Error('API Error'))

      // Act
      const result = await ChilizProvider.getTokenCounters({ address, network })

      // Assert
      expect(result).to.deep.equal({
        transfers: 0,
        holders: 0,
      })
    })
  })
})
