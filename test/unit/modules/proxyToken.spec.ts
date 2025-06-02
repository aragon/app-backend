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
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves({
        tokenDetails,
        tokenMetrics,
      })

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

    it('should update non-native token with price, holders and total supply', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const token = {
        id: 'token-123',
        address: tokenAddress,
        network,
        type: ITokenType.ERC20,
        skipFetchRate: false,
        lastUpdatedAt: dayjs().subtract(10, 'hour').toDate(),
        update: sandbox.stub(),
      } as any

      const tokenDetails = { priceUsd: '1234.56' }
      const tokenMetrics = { totalHolders: 1000, totalSupply: '1000000000000000000000' }

      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves(tokenMetrics)

      // This should not be called for non-native tokens
      const fetchTokenPriceStub = sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice')

      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      const result = await ProxyToken.updateTokenMetrics(token, tokenAddress, network, false)

      expect(fetchTokenPriceStub.called).to.be.false
      expect(token.update.calledOnce).to.be.true
      expect(token.update.firstCall.args[0]).to.deep.include({
        priceUsd: '1234.56',
        holders: 1000,
        totalSupply: '1000000000000000000000',
      })
      expect(loggerVerboseStub.calledWith('Updated Token Metrics' as any)).to.be.true
      expect(result).to.equal(token)
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
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
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

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

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
        hasTotalSupply: false,
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
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)

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
      sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)

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
  })

  it('should allow escrowAdapter token with governance to be saved even if not syncable', async () => {
    const tokenAddress = '0x123456789abcdef'
    const network = NetworksEnum.ethereumMainnet

    const tokenTypeInfo = {
      type: ITokenType.escrowAdapter,
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
      hasUnderlying: false,
    }

    const tokenDetails = {
      name: 'Escrow Adapter Token',
      symbol: 'ESCROW',
      decimals: 18,
      logo: 'escrow-logo',
      type: ITokenType.escrowAdapter,
      totalHolders: 100,
      totalSupply: '1000000000000000000000',
    }

    sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo)
    sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)
    sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)

    // This is the key part - token is NOT syncable normally
    sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(false)

    // But it should still be saved because it's an escrowAdapter with governance
    sandbox.stub(Web3Helper, 'getTokenName').resolves('Escrow Adapter Token')
    sandbox.stub(Web3Helper, 'getTokenSymbol').resolves('ESCROW')
    sandbox.stub(Web3Helper, 'getTokenDecimals').resolves(18)
    sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(1000000000000000000000n)
    sandbox.stub(Web3Utils, 'isWhitelistedToken').returns(true)
    sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
      blockNumber: 123456,
      transactionHash: '0xtransactionhash',
      address: tokenAddress,
    })
    sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves({
      totalHolders: 100,
      totalSupply: '1000000000000000000000',
    })
    sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({
      priceUsd: '10.5',
    })
    sandbox.stub(TokenUtils, 'firstValid').returns('10.5')
    sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)

    const createStub = sandbox.stub(Models.Token, 'create').resolves({
      id: 'new-escrow-token-123',
      address: tokenAddress,
      network,
      type: ITokenType.escrowAdapter,
      isGovernance: true,
    } as any)

    const loggerVerboseStub = sandbox.stub(logger, 'verbose')

    const result = await ProxyToken.createNewToken(tokenAddress, network)

    // The key assertion - the token should be created despite not being syncable
    expect(result).to.not.be.null
    expect(createStub.calledOnce).to.be.true
    expect(loggerVerboseStub.calledWith('New Token Created' as any)).to.be.true

    const createArgs = createStub.firstCall.args[0]
    expect(createArgs.type).to.equal(ITokenType.escrowAdapter)
    expect(createArgs.isGovernance).to.equal(true)
    expect(createArgs.address).to.equal(tokenAddress)
    expect(createArgs.name).to.equal('Escrow Adapter Token')
    expect(createArgs.symbol).to.equal('ESCROW')
  })

  it('should return null for escrowAdapter token without governance if not syncable', async () => {
    const tokenAddress = '0x123456789abcdef'
    const network = NetworksEnum.ethereumMainnet

    const tokenTypeInfo = {
      type: ITokenType.escrowAdapter,
      isGovernance: false, // Not a governance token
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
      name: 'Escrow Adapter Token',
      symbol: 'ESCROW',
      decimals: 18,
      logo: 'escrow-logo',
      type: ITokenType.escrowAdapter,
      totalHolders: 100,
      totalSupply: '1000000000000000000000',
    }

    sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo)
    sandbox.stub(ProxyWeb3Provider, 'fetchBasicTokenInfo').resolves(tokenDetails)

    // Token is NOT syncable
    sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(false)

    const createStub = sandbox.stub(Models.Token, 'create')

    const result = await ProxyToken.createNewToken(tokenAddress, network)

    // Should return null because it's not a governance escrowAdapter
    expect(result).to.be.null
    expect(createStub.called).to.be.false
  })
})
