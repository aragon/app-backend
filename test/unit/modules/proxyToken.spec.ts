import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { ITokenType, NetworksEnum } from '@types'
import TokenDetector from '@helpers/tokenDetector'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import dayjs from '@helpers/dayjs'
import Token from '@models/schema/token'
import { ProxyToken } from '@modules/proxyToken'
import CovalentHelper from '@helpers/covalent'
import { ethers } from 'ethers'
import { IPermission } from '@src/types/permission'
import logger from '@logger'
import TokenUtils from '@helpers/tokenUtils'
import ProxyWeb3Provider from '@modules/proxyProvider'

describe('Modules: ProxyToken', () => {
  let sandbox: SinonSandbox
  let rawToken: Partial<Token>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawToken = {
      network: NetworksEnum.ethereumMainnet,
      type: ITokenType.ERC20,
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      logo: 'fake-logo',
      name: NetworksEnum.ethereumMainnet,
      symbol: 'WETH',
      decimals: 18,
      holders: 10,
      totalSupply: '100',
      priceUsd: '1',
      lastUpdatedAt: dayjs.utc().toDate() as any,
    }

    await Models.Token.create(rawToken)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('saveAndGetToken', () => {
    it('should return existing token and update if needed', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet
      const existingToken = {
        id: 'token-123',
        address: tokenAddress,
        network,
        lastUpdatedAt: dayjs().subtract(8, 'hours').toDate(),
        skipFetchRate: false,
      } as unknown as Token

      sandbox.stub(Web3Utils, 'parseAddress').returns(tokenAddress)
      sandbox.stub(Models.Token, 'findExistingLog').resolves(existingToken)
      const updateTokenMetricsStub = sandbox.stub(ProxyToken, 'updateTokenMetrics').resolves(existingToken)

      const result = await ProxyToken.saveAndGetToken(tokenAddress, network)

      expect(updateTokenMetricsStub.calledWith(existingToken, tokenAddress, network, false)).to.be.true
      expect(result).to.equal(existingToken)
    })

    it('should create new token when no existing token is found', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet
      const newToken = {
        id: 'new-token-123',
        address: tokenAddress,
        network,
      } as unknown as Token

      sandbox.stub(Web3Utils, 'parseAddress').returns(tokenAddress)
      sandbox.stub(Models.Token, 'findExistingLog').resolves(null)
      const createNewTokenStub = sandbox.stub(ProxyToken, 'createNewToken').resolves(newToken)

      const result = await ProxyToken.saveAndGetToken(tokenAddress, network)

      expect(createNewTokenStub.calledWith(tokenAddress, network)).to.be.true
      expect(result).to.equal(newToken)
    })

    it('should handle errors and return null', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(Web3Utils, 'parseAddress').throws(new Error('Invalid address'))
      const loggerErrorStub = sandbox.stub(logger, 'error')

      const result = await ProxyToken.saveAndGetToken(tokenAddress, network)

      expect(loggerErrorStub.calledWith('Error saveAndGetToken' as any)).to.be.true
      expect(result).to.be.null
    })

    it('should pass forceUpdate parameter correctly', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet
      const existingToken = {
        id: 'token-123',
        address: tokenAddress,
        network,
      } as unknown as Token

      sandbox.stub(Web3Utils, 'parseAddress').returns(tokenAddress)
      sandbox.stub(Models.Token, 'findExistingLog').resolves(existingToken)
      const updateTokenMetricsStub = sandbox.stub(ProxyToken, 'updateTokenMetrics').resolves(existingToken)

      const result = await ProxyToken.saveAndGetToken(tokenAddress, network, true)

      expect(updateTokenMetricsStub.calledWith(existingToken, tokenAddress, network, true)).to.be.true
      expect(result).to.equal(existingToken)
    })

    it('should use tokenAddress when parseAddress returns null', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet
      const existingToken = {
        id: 'token-123',
        address: tokenAddress,
        network,
      } as unknown as Token

      sandbox.stub(Web3Utils, 'parseAddress').returns(null)
      const findExistingLogStub = sandbox.stub(Models.Token, 'findExistingLog').resolves(existingToken)
      sandbox.stub(ProxyToken, 'updateTokenMetrics').resolves(existingToken)

      await ProxyToken.saveAndGetToken(tokenAddress, network)

      expect(findExistingLogStub.calledWith({ address: tokenAddress, network })).to.be.true
    })
  })

  describe('updateTokenMetrics', () => {
    it('should not update if token was recently updated and forceUpdate is false', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const token = {
        id: 'token-123',
        address: tokenAddress,
        network,
        skipFetchRate: false,
        lastUpdatedAt: dayjs().subtract(1, 'hour').toDate(),
        update: sandbox.stub(),
      } as any

      const fetchBasicTokenInfoStub = sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo')

      const result = await ProxyToken.updateTokenMetrics(token, tokenAddress, network, false)

      expect(fetchBasicTokenInfoStub.called).to.be.false
      expect(token.update.called).to.be.false
      expect(result).to.equal(token)
    })

    it('should update if token was not recently updated', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const token = {
        id: 'token-123',
        address: tokenAddress,
        network,
        skipFetchRate: false,
        lastUpdatedAt: dayjs().subtract(10, 'hour').toDate(),
        update: sandbox.stub(),
        hasDelegate: true,
      } as any

      const tokenDetails = { priceUsd: '1234.56' }
      const tokenMetrics = { totalHolders: 1000, totalSupply: '1000000000000000000000' }

      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves(tokenMetrics)

      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      const result = await ProxyToken.updateTokenMetrics(token, tokenAddress, network, false)

      expect(token.update.calledOnce).to.be.true
      expect(token.update.firstCall.args[0]).to.deep.include({
        priceUsd: '1234.56',
        holders: 1000,
        totalSupply: '1000000000000000000000',
      })
      expect(loggerVerboseStub.calledWith('Updated Token Metrics' as any)).to.be.true
      expect(result).to.equal(token)
    })

    it('should update if forceUpdate is true even if token was recently updated', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const token = {
        id: 'token-123',
        address: tokenAddress,
        network,
        skipFetchRate: false,
        lastUpdatedAt: dayjs().subtract(1, 'hour').toDate(),
        update: sandbox.stub(),
      } as any

      const tokenDetails = { priceUsd: '1234.56' }
      const tokenMetrics = { totalHolders: 1000, totalSupply: '1000000000000000000000' }

      sandbox.stub(logger, 'verbose')
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves(tokenMetrics)

      const result = await ProxyToken.updateTokenMetrics(token, tokenAddress, network, true)

      expect(token.update.calledOnce).to.be.true
      expect(result).to.equal(token)
    })

    it('should not update if token.skipFetchRate is true and forceUpdate is false', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const token = {
        id: 'token-123',
        address: tokenAddress,
        network,
        skipFetchRate: true,
        lastUpdatedAt: dayjs().subtract(10, 'hour').toDate(),
        update: sandbox.stub(),
      } as any

      const fetchBasicTokenInfoStub = sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo')

      const result = await ProxyToken.updateTokenMetrics(token, tokenAddress, network, false)

      expect(fetchBasicTokenInfoStub.called).to.be.false
      expect(token.update.called).to.be.false
      expect(result).to.equal(token)
    })

    it('should update native token with only price information', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const token = {
        id: 'token-123',
        address: tokenAddress,
        network,
        type: ITokenType.native,
        skipFetchRate: false,
        lastUpdatedAt: dayjs().subtract(10, 'hour').toDate(),
        update: sandbox.stub(),
      } as any

      const tokenPrice = '1500.50'
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({
        priceUsd: tokenPrice,
      })

      // These should not be called for native tokens
      const fetchBasicTokenInfoStub = sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo')
      const fetchTokenHolderAndSupplyStub = sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply')

      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      const result = await ProxyToken.updateTokenMetrics(token, tokenAddress, network, false)

      expect(fetchBasicTokenInfoStub.called).to.be.false
      expect(fetchTokenHolderAndSupplyStub.called).to.be.false
      expect(token.update.calledOnce).to.be.true
      expect(token.update.firstCall.args[0]).to.deep.include({
        priceUsd: tokenPrice,
      })
      expect(token.update.firstCall.args[0]).to.not.have.property('holders')
      expect(token.update.firstCall.args[0]).to.not.have.property('totalSupply')
      expect(loggerVerboseStub.calledWith('Updated Token Metrics' as any)).to.be.true
      expect(result).to.equal(token)
    })

    it('should handle when session is undefined', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const token = {
        id: 'token-123',
        address: tokenAddress,
        network,
        type: ITokenType.native,
        skipFetchRate: false,
        lastUpdatedAt: dayjs().subtract(10, 'hour').toDate(),
        update: sandbox.stub(),
      } as any

      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1500' })
      sandbox.stub(logger, 'verbose')

      const result = await ProxyToken.updateTokenMetrics(token, tokenAddress, network, false)

      expect(token.update.calledOnce).to.be.true
      expect(result).to.equal(token)
    })
  })

  describe('wrapTokenDetails', () => {
    it('should fetch basic token info for non-escrowAdapter tokens', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet
      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const expectedTokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
        totalHolders: 100,
        totalSupply: '1000000',
      }

      const fetchBasicTokenInfoStub = sandbox
        .stub(ProxyWeb3Provider, 'fetchBasicTokenInfo')
        .resolves(expectedTokenDetails)

      const result = await ProxyToken.wrapTokenDetails(tokenTypeInfo as any, tokenAddress, network)

      expect(fetchBasicTokenInfoStub.calledWith({ address: tokenAddress, network })).to.be.true
      expect(result).to.deep.equal(expectedTokenDetails)
    })

    it('should handle escrowAdapter tokens by fetching underlying token', async () => {
      const tokenAddress = '0x123456789abcdef'
      const underlyingTokenAddress = '0xunderlyingtoken'
      const network = NetworksEnum.ethereumMainnet
      const tokenTypeInfo = {
        type: ITokenType.escrowAdapter,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const plugin = {
        votingEscrow: {
          underlying: underlyingTokenAddress,
        },
      }

      const basicTokenDetails = {
        name: 'Underlying Token',
        symbol: 'UNDER',
        decimals: 18,
        type: ITokenType.ERC20,
        totalHolders: 500,
        totalSupply: '5000000',
      }

      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(plugin)
      const fetchBasicTokenInfoStub = sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(basicTokenDetails)

      const result = await ProxyToken.wrapTokenDetails(tokenTypeInfo as any, tokenAddress, network)

      expect(fetchBasicTokenInfoStub.calledWith({ address: underlyingTokenAddress, network })).to.be.true
      expect(result).to.deep.equal({
        ...basicTokenDetails,
        type: ITokenType.escrowAdapter,
        underlying: underlyingTokenAddress,
      })
    })

    it('should handle escrowAdapter tokens when plugin is not found', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet
      const tokenTypeInfo = {
        type: ITokenType.escrowAdapter,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const basicTokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
        totalHolders: 100,
        totalSupply: '1000000',
      }

      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(null)
      const fetchBasicTokenInfoStub = sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(basicTokenDetails)

      const result = await ProxyToken.wrapTokenDetails(tokenTypeInfo as any, tokenAddress, network)

      expect(fetchBasicTokenInfoStub.calledWith({ address: tokenAddress, network })).to.be.true
      expect(result).to.deep.equal({
        ...basicTokenDetails,
        type: ITokenType.escrowAdapter,
        underlying: tokenAddress,
      })
    })

    it('should handle escrowAdapter tokens when plugin has no votingEscrow', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet
      const tokenTypeInfo = {
        type: ITokenType.escrowAdapter,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const plugin = {
        // No votingEscrow property
      }

      const basicTokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
        totalHolders: 100,
        totalSupply: '1000000',
      }

      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(plugin)
      const fetchBasicTokenInfoStub = sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(basicTokenDetails)

      const result = await ProxyToken.wrapTokenDetails(tokenTypeInfo as any, tokenAddress, network)

      expect(fetchBasicTokenInfoStub.calledWith({ address: tokenAddress, network })).to.be.true
      expect(result).to.deep.equal({
        ...basicTokenDetails,
        type: ITokenType.escrowAdapter,
        underlying: tokenAddress,
      })
    })

    it('should handle when fetchBasicTokenInfo returns null', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet
      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(null)

      const result = await ProxyToken.wrapTokenDetails(tokenTypeInfo as any, tokenAddress, network)

      expect(result).to.be.null
    })

    it('should not modify non-escrowAdapter token when basicToken is null', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet
      const tokenTypeInfo = {
        type: ITokenType.escrowAdapter,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(null)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(null)

      const result = await ProxyToken.wrapTokenDetails(tokenTypeInfo as any, tokenAddress, network)

      expect(result).to.be.null
    })
  })

  describe('createNewToken', () => {
    it('should create a new token with all fields populated', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: true,
        hasDelegate: true,
        hasBalanceOfERC20: true,
        hasBalanceOfERC777: false,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
        hasUnderlying: true,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        logo: 'test-logo',
        type: ITokenType.ERC20,
        totalHolders: 5000,
        totalSupply: '5000000000000000000000',
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo)
      sandbox.stub(ProxyToken, 'wrapTokenDetails').resolves(tokenDetails)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(true)
      sandbox.stub(Web3Helper, 'getUnderlying').resolves('0xunderlying')
      sandbox.stub(Web3Utils, 'isWhitelistedToken').returns(true)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
        blockNumber: 123456,
        transactionHash: '0xtransactionhash',
        address: tokenAddress,
      })
      sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves({
        totalHolders: 5000,
        totalSupply: '5000000000000000000000',
      })
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({
        priceUsd: '2.5',
      })
      sandbox.stub(TokenUtils, 'firstValid').returns('2.5')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)

      const savedToken = {
        id: 'new-token-123',
        address: tokenAddress,
        network,
      }
      const createStub = sandbox.stub(Models.Token, 'create').resolves(savedToken)

      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(createStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('New Token Created' as any)).to.be.true

      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.network).to.equal(network)
      expect(createArgs.address).to.equal(tokenAddress)
      expect(createArgs.name).to.equal('Test Token')
      expect(createArgs.symbol).to.equal('TEST')
      expect(createArgs.decimals).to.equal(18)
      expect(createArgs.logo).to.equal('test-logo')
      expect(createArgs.type).to.equal(ITokenType.ERC20)
      expect(createArgs.isGovernance).to.equal(true)
      expect(createArgs.mintableByDao).to.equal(true)
      expect(createArgs.underlying).to.equal('0xunderlying')
      expect(createArgs.blockNumber).to.equal(123456)
      expect(createArgs.transactionHash).to.equal('0xtransactionhash')
      expect(createArgs.priceUsd).to.equal('2.5')
      expect(createArgs.skipFetchRate).to.equal(false)
    })

    it('should handle tokens with unknown type', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.unknown,
        isGovernance: false,
        hasDelegate: false,
        hasBalanceOfERC20: true,
        hasBalanceOfERC777: false,
        hasName: false,
        hasSymbol: false,
        hasDecimals: false,
        hasTotalSupply: false, // Changed to false to avoid Web3Helper.getTokenTotalSupply call
        proxy: false,
        implementationAddress: null,
        hasUnderlying: false,
      }

      const tokenDetails = {
        name: null,
        symbol: null,
        decimals: null,
        logo: null,
        type: ITokenType.unknown,
        totalHolders: 0,
        totalSupply: '0',
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo)
      sandbox.stub(ProxyToken, 'wrapTokenDetails').resolves(tokenDetails)

      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(Web3Utils, 'isWhitelistedToken').returns(false)
      sandbox.stub(Web3Helper, 'getTokenName').resolves('Token Name')
      sandbox.stub(Web3Helper, 'getTokenSymbol').resolves('TKN')
      sandbox.stub(Web3Helper, 'getTokenDecimals').resolves(18)
      sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(10000n)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({
        priceUsd: '0',
      })
      sandbox.stub(TokenUtils, 'firstValid').returns('0')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(true)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(createStub.calledOnce).to.be.true

      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.network).to.equal(network)
      expect(createArgs.address).to.equal(tokenAddress)
      expect(createArgs.name).to.equal(null)
      expect(createArgs.type).to.be.eq(ITokenType.unknown)
    })

    it('should handle escrowAdapter tokens correctly', async () => {
      const tokenAddress = '0x123456789abcdef'
      const underlyingAddress = '0xunderlyingtoken'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.escrowAdapter,
        isGovernance: false,
        hasDelegate: false,
        hasBalanceOfERC20: true,
        hasBalanceOfERC777: false,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
        hasUnderlying: false,
      }

      const tokenDetails = {
        name: 'Escrow Token',
        symbol: 'ESCROW',
        decimals: 18,
        logo: 'escrow-logo',
        type: ITokenType.escrowAdapter,
        totalHolders: 100,
        totalSupply: '1000000000000000000000',
        underlying: underlyingAddress,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo)
      sandbox.stub(ProxyToken, 'wrapTokenDetails').resolves(tokenDetails)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({
        priceUsd: '1.5',
      })
      sandbox.stub(TokenUtils, 'firstValid').returns('1.5')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(createStub.calledOnce).to.be.true

      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.type).to.equal(ITokenType.escrowAdapter)
      expect(createArgs.underlying).to.equal(underlyingAddress)
      expect(createArgs.name).to.equal('Escrow Token')
      expect(createArgs.symbol).to.equal('ESCROW')
    })

    it('should return null if non-escrowAdapter token is not syncable', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyToken, 'wrapTokenDetails').resolves(tokenDetails)

      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(false)

      const result = await ProxyToken.createNewToken(tokenAddress, network)

      expect(result).to.be.null
    })

    it('should not check isTokenSyncable for escrowAdapter tokens', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.escrowAdapter,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: false, // Changed to false to avoid Web3Helper.getTokenTotalSupply call
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Escrow Token',
        symbol: 'ESCROW',
        decimals: 18,
        type: ITokenType.escrowAdapter,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyToken, 'wrapTokenDetails').resolves(tokenDetails)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(Web3Helper, 'getUnderlying').resolves('0xunderlyingtoken')

      const isTokenSyncableStub = sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(false)

      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({
        priceUsd: '1',
      })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(isTokenSyncableStub.called).to.be.false
      expect(createStub.calledOnce).to.be.true
    })

    it('should return null if token is not syncable', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)

      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(false)

      const result = await ProxyToken.createNewToken(tokenAddress, network)

      expect(result).to.be.null
    })

    it('should handle native tokens differently', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.native,
        isGovernance: false,
        hasDelegate: false,
        hasBalanceOfERC20: false,
        hasBalanceOfERC777: false,
        hasName: false,
        hasSymbol: false,
        hasDecimals: false,
        hasTotalSupply: false,
        proxy: false,
        implementationAddress: null,
        hasUnderlying: false,
      }

      const tokenDetails = {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
        logo: 'eth-logo',
        type: ITokenType.native,
        totalHolders: 0,
        totalSupply: '0',
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo)
      sandbox.stub(ProxyToken, 'wrapTokenDetails').resolves(tokenDetails)

      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({
        priceUsd: '1500',
      })
      sandbox.stub(TokenUtils, 'firstValid').returns('1500')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      const getTokenNameStub = sandbox.stub(Web3Helper, 'getTokenName')
      const getTokenSymbolStub = sandbox.stub(Web3Helper, 'getTokenSymbol')
      const getTokenDecimalsStub = sandbox.stub(Web3Helper, 'getTokenDecimals')
      const getTokenTotalSupplyStub = sandbox.stub(Web3Helper, 'getTokenTotalSupply')

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(createStub.calledOnce).to.be.true

      // For native tokens, Web3Helper methods should not be called
      expect(getTokenNameStub.called).to.be.false
      expect(getTokenSymbolStub.called).to.be.false
      expect(getTokenDecimalsStub.called).to.be.false
      expect(getTokenTotalSupplyStub.called).to.be.false

      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.type).to.equal(ITokenType.native)
    })

    it('should update type when tokenDetails.type is unknown but tokenTypeInfo.type is not', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: false, // Changed to false to avoid Web3Helper.getTokenTotalSupply call
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.unknown, // Details say unknown
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyToken, 'wrapTokenDetails').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.type).to.equal(ITokenType.ERC20) // Should use tokenTypeInfo.type
    })

    it('should update type when rawToken.type is unknown but tokenTypeInfo.type is not', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: false, // Changed to false to avoid Web3Helper.getTokenTotalSupply call
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.unknown, // Details say unknown
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.type).to.equal(ITokenType.ERC20) // Should use tokenTypeInfo.type
    })

    it('should fetch name when not provided but hasName is true', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: false, // Changed to false to avoid Web3Helper.getTokenTotalSupply call
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: null, // No name provided
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      const getTokenNameStub = sandbox.stub(Web3Helper, 'getTokenName').resolves('Fetched Token Name')
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(getTokenNameStub.calledOnce).to.be.true
      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.name).to.equal('Fetched Token Name')
    })

    it('should fetch symbol when not provided but hasSymbol is true', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: false, // Changed to false to avoid Web3Helper.getTokenTotalSupply call
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: null, // No symbol provided
        decimals: 18,
        type: ITokenType.ERC20,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      const getTokenSymbolStub = sandbox.stub(Web3Helper, 'getTokenSymbol').resolves('FETCHED')
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(getTokenSymbolStub.calledOnce).to.be.true
      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.symbol).to.equal('FETCHED')
    })

    it('should fetch decimals when not provided but hasDecimals is true', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: false, // Changed to false to avoid Web3Helper.getTokenTotalSupply call
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: null, // No decimals provided
        type: ITokenType.ERC20,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      const getTokenDecimalsStub = sandbox.stub(Web3Helper, 'getTokenDecimals').resolves(6)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(getTokenDecimalsStub.calledOnce).to.be.true
      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.decimals).to.equal(6)
    })

    it('should fetch totalSupply when not provided but hasTotalSupply is true', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        totalSupply: null, // No totalSupply provided
        type: ITokenType.ERC20,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      const getTokenTotalSupplyStub = sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(999999999999999999999n)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(getTokenTotalSupplyStub.calledOnce).to.be.true
      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.totalSupply).to.equal('999999999999999999999')
    })

    it('should fetch underlying when hasUnderlying is true', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        hasUnderlying: true,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      const getUnderlyingStub = sandbox.stub(Web3Helper, 'getUnderlying').resolves('0xunderlyingtoken')
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)
      sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(1000000n)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(getUnderlyingStub.calledOnce).to.be.true
      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.underlying).to.equal('0xunderlyingtoken')
    })

    it('should fetch contract creation info for governance tokens', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: true, // Governance token
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(1000000n)
      const fetchContractCreationStub = sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
        blockNumber: 999999,
        transactionHash: '0xgovtxhash',
        address: tokenAddress,
      })
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(fetchContractCreationStub.calledOnce).to.be.true
      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.blockNumber).to.equal(999999)
      expect(createArgs.transactionHash).to.equal('0xgovtxhash')
    })

    it('should not fetch contract creation info for non-governance and non-whitelisted tokens', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false, // Not governance
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: false,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(Web3Utils, 'isWhitelistedToken').returns(false)

      // This should NOT be called
      const fetchContractCreationStub = sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation')

      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(fetchContractCreationStub.called).to.be.false
      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.blockNumber).to.be.undefined
      expect(createArgs.transactionHash).to.be.undefined
    })

    it('should fetch contract creation info for whitelisted tokens', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false, // Not governance
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: false,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(Web3Utils, 'isWhitelistedToken').returns(true)
      const fetchContractCreationStub = sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
        blockNumber: 888888,
        transactionHash: '0xwhitelistedtxhash',
        address: tokenAddress,
      })
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(fetchContractCreationStub.calledOnce).to.be.true
      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.blockNumber).to.equal(888888)
      expect(createArgs.transactionHash).to.equal('0xwhitelistedtxhash')
    })

    it('should fetch metrics when type is not unknown and holders is 0', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
        totalHolders: 0, // Changed from holders to totalHolders
        totalSupply: null, // Make sure totalSupply is null to trigger the fetch
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)

      // Stub getTokenTotalSupply since totalSupply is null and hasTotalSupply is true
      sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(5000000000000000000000n)

      const fetchTokenHolderAndSupplyStub = sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves({
        totalHolders: 1234,
        totalSupply: '9876543210',
      })
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(fetchTokenHolderAndSupplyStub.calledOnce).to.be.true
      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.holders).to.equal(1234)
      expect(createArgs.totalSupply).to.equal('9876543210')
    })

    it('should set refetch flag when totalSupply is 0 and token is governance', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: true, // Governance token
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
        totalHolders: 0, // Changed from holders to totalHolders
        totalSupply: null, // Make sure totalSupply is null to trigger the fetch
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)

      // Stub getTokenTotalSupply since totalSupply is null and hasTotalSupply is true
      sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(5000000000000000000000n)

      sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves({
        totalHolders: 100,
        totalSupply: '0', // Zero supply
      })
      sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
        blockNumber: 123456,
        transactionHash: '0xtxhash',
        address: tokenAddress,
      })
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.refetch).to.equal(true)
    })

    it('should not fetch metrics when holders is undefined', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: false,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
        // totalHolders is not set, so rawToken.holders will be undefined
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)

      // This should NOT be called because holders is undefined, not 0
      const fetchTokenHolderAndSupplyStub = sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply')

      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(fetchTokenHolderAndSupplyStub.called).to.be.false
      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.holders).to.be.undefined
    })

    it('should handle token price for skipTestNetworks', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumSepolia // A test network

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: false,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
        priceUsd: '999', // Details have a price
      }

      sandbox.stub(CovalentHelper, 'skipTestNetworks').returns([NetworksEnum.ethereumSepolia])
      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      const fetchTokenPriceStub = sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice')
      sandbox.stub(TokenUtils, 'firstValid').returns('0') // Should use 0 for test networks
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(true)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(fetchTokenPriceStub.called).to.be.false // Should not fetch price for test networks
      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.priceUsd).to.equal('0')
    })

    it('should handle token price for governance tokens', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: true, // Governance token
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
        priceUsd: '999', // Details have a price
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(1000000n)

      sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
        blockNumber: 123456,
        transactionHash: '0xtxhash',
        address: tokenAddress,
      })
      const fetchTokenPriceStub = sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '0' })
      sandbox.stub(TokenUtils, 'firstValid').returns('0') // Should use 0 for governance tokens
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(true)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(fetchTokenPriceStub.notCalled).to.be.true
      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.priceUsd).to.equal('0')
    })
    it('should not fetch metrics when type is unknown', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.unknown, // Unknown type
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.unknown,
        totalHolders: 0,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(1000000n)

      const fetchTokenHolderAndSupplyStub = sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply')

      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(fetchTokenHolderAndSupplyStub.called).to.be.false
    })

    it('should not set refetch flag when totalSupply is not 0', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: true, // Governance token
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
        totalHolders: 0,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves({
        totalHolders: 100,
        totalSupply: '1000000', // Non-zero supply
      })
      sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
        blockNumber: 123456,
        transactionHash: '0xtxhash',
        address: tokenAddress,
      })
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)
      sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(1000000n)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.refetch).to.be.undefined // refetch should not be set
    })

    it('should not set refetch flag when token is not governance even if totalSupply is 0', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false, // Not governance
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
        totalHolders: 0,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves({
        totalHolders: 100,
        totalSupply: '0', // Zero supply
      })
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(1000000n)

      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.refetch).to.be.undefined // refetch should not be set because not governance
    })

    it('should handle when session is undefined in createNewToken', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: false,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      // Call without session
      await ProxyToken.createNewToken(tokenAddress, network)

      expect(createStub.calledOnce).to.be.true
      // Verify create was called with session undefined in options
      expect(createStub.firstCall.args[1]).to.deep.equal({ session: undefined })
    })

    it('should pass session parameter correctly in checkPluginMintAuthorizationIsDao', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(1n)

      const checkPluginMintAuthStub = sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)

      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)
      sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(checkPluginMintAuthStub.calledWith(tokenAddress, network)).to.be.true
    })

    it('should handle when fetchTokenPrice returns null priceUsd', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
        priceUsd: null,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: null })
      sandbox.stub(TokenUtils, 'firstValid').returns(null) // Returns null when both are null
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(true)
      sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(1000000n)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.priceUsd).to.equal('0') // Should default to '0' when null
    })

    it('should handle when holders is null but totalSupply needs fetching', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: false,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
        totalHolders: null, // null instead of 0
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(123n)

      // This should NOT be called because holders is null, not 0
      const fetchTokenHolderAndSupplyStub = sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply')

      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({ priceUsd: '1' })
      sandbox.stub(TokenUtils, 'firstValid').returns('1')
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      expect(fetchTokenHolderAndSupplyStub.called).to.be.false
      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.holders).to.be.null
    })
  })

  describe('checkPluginMintAuthorizationIsDao', () => {
    it('should return false if no plugin is found', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(null)

      const result = await ProxyToken.checkPluginMintAuthorizationIsDao(tokenAddress, network)

      expect(result).to.be.false
    })

    it('should return false if plugin has no MINT permission for the DAO', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet
      const daoAddress = '0xdaoaddress'

      const plugin = {
        daoAddress,
        tokenAddress,
        permissions: [
          {
            permissionId: 'not-mint-permission',
            where: tokenAddress,
            who: daoAddress,
          },
        ],
      }

      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(plugin)

      const result = await ProxyToken.checkPluginMintAuthorizationIsDao(tokenAddress, network)

      expect(result).to.be.false
    })

    it('should return true if plugin has MINT permission for the DAO', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet
      const daoAddress = '0xdaoaddress'

      const mintPermissionId = ethers.id(IPermission.MINT_PERMISSION)

      const plugin = {
        daoAddress,
        tokenAddress,
        permissions: [
          {
            permissionId: mintPermissionId,
            where: tokenAddress,
            who: daoAddress,
          },
        ],
      }

      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(plugin)

      const result = await ProxyToken.checkPluginMintAuthorizationIsDao(tokenAddress, network)

      expect(result).to.be.true
    })

    it('should return false if permission is for a different token', async () => {
      const tokenAddress = '0x123456789abcdef'
      const differentTokenAddress = '0xdifferenttoken'
      const network = NetworksEnum.ethereumMainnet
      const daoAddress = '0xdaoaddress'

      const mintPermissionId = ethers.id(IPermission.MINT_PERMISSION)

      const plugin = {
        daoAddress,
        tokenAddress,
        permissions: [
          {
            permissionId: mintPermissionId,
            where: differentTokenAddress,
            who: daoAddress,
          },
        ],
      }

      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(plugin)

      const result = await ProxyToken.checkPluginMintAuthorizationIsDao(tokenAddress, network)

      expect(result).to.be.false
    })

    it('should return false if permission is for a different entity', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet
      const daoAddress = '0xdaoaddress'
      const differentEntity = '0xdifferententity'

      const mintPermissionId = ethers.id(IPermission.MINT_PERMISSION)

      const plugin = {
        daoAddress,
        tokenAddress,
        permissions: [
          {
            permissionId: mintPermissionId,
            where: tokenAddress,
            who: differentEntity,
          },
        ],
      }

      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(plugin)

      const result = await ProxyToken.checkPluginMintAuthorizationIsDao(tokenAddress, network)

      expect(result).to.be.false
    })

    it('should pass session parameter to findByTokenAddress', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const findByTokenAddressStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(null)

      await ProxyToken.checkPluginMintAuthorizationIsDao(tokenAddress, network)

      expect(findByTokenAddressStub.calledWith(tokenAddress, network)).to.be.true
    })
  })
})
