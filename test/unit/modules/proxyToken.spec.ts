import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import dayjs from '@helpers/dayjs'
import TokenDetector from '@helpers/tokenDetector'
import TokenUtils from '@helpers/tokenUtils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import Token from '@models/schema/token'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { ProxyToken } from '@modules/proxyToken'
import { IPermission } from '@src/types/permission'
import { IClockMode, ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { ethers } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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

      const result = await ProxyToken.saveAndGetToken(tokenAddress, network, true)

      expect(updateTokenMetricsStub.calledWith(existingToken, tokenAddress, network, true)).to.be.true
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

      const getTokenInfoStub = sandbox.stub(Web3Helper, 'getTokenInfo')

      const result = await ProxyToken.updateTokenMetrics(token, tokenAddress, network, false)

      expect(getTokenInfoStub.called).to.be.false
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
        priceUsd: '0',
        logo: '',
        update: sandbox.stub(),
        hasDelegate: true,
        hasTotalSupply: true,
        type: ITokenType.ERC20,
      } as any

      sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(1000000000000000000000n)
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      sandbox.stub(CoinGeckoHelper, 'getToken').resolves({ priceUsd: '1234.56', logo: 'test-logo' } as any)

      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      const result = await ProxyToken.updateTokenMetrics(token, tokenAddress, network, false)

      expect(token.update.calledOnce).to.be.true
      expect(token.update.firstCall.args[0]).to.deep.include({
        totalSupply: '1000000000000000000000',
        priceUsd: '1234.56',
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
        priceUsd: '0',
        logo: '',
        update: sandbox.stub(),
      } as any

      sandbox.stub(logger, 'verbose')
      sandbox.stub(Web3Helper, 'getTokenInfo').resolves({
        address: tokenAddress,
        name: 'Test',
        symbol: 'TST',
        decimals: 18,
        totalSupply: '1000000000000000000000',
      })
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      sandbox.stub(CoinGeckoHelper, 'getToken').resolves({ priceUsd: '1234.56', logo: 'test-logo' } as any)

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

      const getTokenInfoStub = sandbox.stub(Web3Helper, 'getTokenInfo')

      const result = await ProxyToken.updateTokenMetrics(token, tokenAddress, network, false)

      expect(getTokenInfoStub.called).to.be.false
      expect(token.update.called).to.be.false
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
        priceUsd: '0',
        logo: '',
        update: sandbox.stub(),
      } as any

      sandbox
        .stub(Web3Helper, 'getTokenInfo')
        .resolves({ address: tokenAddress, name: 'Test', symbol: 'TST', decimals: 18, totalSupply: '0' })
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      sandbox.stub(CoinGeckoHelper, 'getToken').resolves({ priceUsd: '1500', logo: '' } as any)
      sandbox.stub(logger, 'verbose')

      const result = await ProxyToken.updateTokenMetrics(token, tokenAddress, network, false)

      expect(token.update.calledOnce).to.be.true
      expect(result).to.equal(token)
    })
  })

  describe('wrapTokenDetails', () => {
    it('should fetch token info for non-escrowAdapter tokens', async () => {
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

      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      sandbox.stub(CoinGeckoHelper, 'getToken').resolves({
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        totalSupply: '1000000',
        logo: 'test-logo',
        priceUsd: '1.5',
      } as any)

      const result = await ProxyToken.wrapTokenDetails(tokenTypeInfo as any, tokenAddress, network)

      expect(result).to.deep.include({
        address: tokenAddress,
        network,
        type: ITokenType.ERC20,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        totalSupply: '1000000',
        logo: 'test-logo',
        priceUsd: '1.5',
      })
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

      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(plugin)
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      sandbox.stub(CoinGeckoHelper, 'getToken').resolves({
        name: 'Underlying Token',
        symbol: 'UNDER',
        decimals: 18,
        totalSupply: '5000000',
        logo: 'under-logo',
        priceUsd: '2.0',
      } as any)

      const result = await ProxyToken.wrapTokenDetails(tokenTypeInfo as any, tokenAddress, network)

      expect(result).to.deep.include({
        address: underlyingTokenAddress,
        network,
        type: ITokenType.escrowAdapter,
        name: 'Underlying Token',
        symbol: 'UNDER',
        decimals: 18,
        totalSupply: '5000000',
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

      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(null)
      sandbox.stub(Web3Helper, 'getTokenInfo').resolves({
        address: tokenAddress,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        totalSupply: '1000000',
      })
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      sandbox.stub(CoinGeckoHelper, 'getToken').resolves({ logo: 'test-logo', priceUsd: '1.5' } as any)

      const result = await ProxyToken.wrapTokenDetails(tokenTypeInfo as any, tokenAddress, network)

      expect(result).to.deep.include({
        address: tokenAddress,
        network,
        type: ITokenType.escrowAdapter,
        underlying: tokenAddress,
      })
    })

    it('should handle testnet by not calling CoinGecko', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumSepolia
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

      sandbox.stub(Web3Helper, 'getTokenInfo').resolves({
        address: tokenAddress,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        totalSupply: '1000000',
      })
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(true)
      const getTokenStub = sandbox.stub(CoinGeckoHelper, 'getToken')

      const result = await ProxyToken.wrapTokenDetails(tokenTypeInfo as any, tokenAddress, network)

      expect(getTokenStub.called).to.be.false
      expect(result).to.deep.include({
        logo: '',
        priceUsd: '0',
      })
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
        hasClockMode: true,
      }

      const tokenDetails = {
        address: tokenAddress,
        network,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        logo: 'test-logo',
        type: ITokenType.ERC20,
        totalSupply: '5000000000000000000000',
        priceUsd: '2.5',
        underlying: undefined,
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
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(require('@helpers/governanceErc20').default, 'getClockMode').resolves(IClockMode.BlockNumber)

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
      expect(createArgs.clockMode).to.equal(IClockMode.BlockNumber)
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

    it('should handle escrowAdapter token with existing underlying', async () => {
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
        hasClockMode: false,
      }

      const tokenDetails = {
        address: tokenAddress,
        network,
        name: 'Escrow Token',
        symbol: 'ESCROW',
        decimals: 18,
        logo: 'escrow-logo',
        type: ITokenType.escrowAdapter,
        totalSupply: '1000000000000000000000',
        priceUsd: '1.5',
        underlying: underlyingAddress,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo)
      sandbox.stub(ProxyToken, 'wrapTokenDetails').resolves(tokenDetails)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)

      sandbox.stub(require('@helpers/governanceVe').default, 'getUnderlyingTokenNameAndSymbol').resolves({
        name: 'Underlying Token Name',
        symbol: 'UNDERLYING',
      })

      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
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
      expect(createArgs.name).to.equal('Underlying Token Name')
      expect(createArgs.symbol).to.equal('UNDERLYING')
    })

    it('should return null if token is marked as spam', async () => {
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
        address: tokenAddress,
        network,
        name: 'Free Airdrop https://scam.com',
        symbol: 'SPAM',
        decimals: 18,
        type: ITokenType.ERC20,
        totalSupply: '1000000',
        logo: '',
        priceUsd: '0',
        underlying: undefined,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyToken, 'wrapTokenDetails').resolves(tokenDetails)

      const result = await ProxyToken.createNewToken(tokenAddress, network)

      expect(result).to.be.null
    })

    it('should handle token price for test networks', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumSepolia

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
        address: tokenAddress,
        network,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
        totalSupply: '1000000',
        logo: '',
        priceUsd: '0',
        underlying: undefined,
      }

      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(true)
      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyToken, 'wrapTokenDetails').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(true)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      const createArgs = createStub.firstCall.args[0]
      expect(createArgs.priceUsd).to.equal('0')
    })

    it('should handle token price for governance tokens', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tokenTypeInfo = {
        type: ITokenType.ERC20,
        isGovernance: true,
        hasBalanceOfERC20: true,
        hasName: true,
        hasSymbol: true,
        hasDecimals: true,
        hasTotalSupply: true,
        proxy: false,
        implementationAddress: null,
      }

      const tokenDetails = {
        address: tokenAddress,
        network,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
        totalSupply: '1000000',
        logo: '',
        priceUsd: '2.5',
        underlying: undefined,
      }

      sandbox.stub(TokenDetector, 'detectTokenType').resolves(tokenTypeInfo as any)
      sandbox.stub(ProxyToken, 'wrapTokenDetails').resolves(tokenDetails)
      sandbox.stub(TokenUtils, 'isTokenSyncable').resolves(true)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)
      sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(1000000n)

      sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
        blockNumber: 123456,
        transactionHash: '0xtxhash',
        address: tokenAddress,
      })
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(false)
      sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(true)

      const createStub = sandbox.stub(Models.Token, 'create').resolves({
        id: 'new-token-123',
        address: tokenAddress,
        network,
      })

      await ProxyToken.createNewToken(tokenAddress, network)

      const createArgs = createStub.firstCall.args[0]
      // Price comes from wrapTokenDetails now (on-chain + CoinGecko)
      expect(createArgs.priceUsd).to.equal('2.5')
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
