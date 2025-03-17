import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { ITokenType, NetworksEnum } from '@types'
import TokenDetector from '@helpers/tokenDetector'
import { RateModule } from '@modules/rates'
import dayjs from '@helpers/dayjs'
import Token from '@models/schema/token'
import { ProxyToken } from '@modules/proxyToken'
import CovalentHelper from '@helpers/covalent'
import Web3Helper from '@helpers/web3'
import EtherscanHelper from '@helpers/etherscan'
import { ethers } from 'ethers'
import { IPermission } from '@src/types/permission'
import dbTx from '@modules/dbTx'
import logger from '@logger'
import RabbitMQHelper from '@helpers/rabbitMQ'
import BlockScout from '@helpers/blockScout'

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
      priceChangeOnDayUsd: '1',
      priceUsd: '1',
      lastUpdatedAt: dayjs.utc().toDate() as any,
    }

    await Models.Token.create(rawToken)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('fetchTokenDetails', () => {
    let tokenRate: any
    beforeEach(() => {
      tokenRate = {
        priceUsd: '1',
        priceChangeOnDayUsd: '1',
        address: '0x123',
        isGovernance: false,
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
      }
    })

    it('should fetch token details when token is native', async () => {
      tokenRate.type = ITokenType.native
      tokenRate.isGovernance = false

      const ratesStub = sandbox.stub(RateModule, 'fetchRate').resolves(tokenRate)

      const result = await ProxyToken._fetchTokenDetails(
        tokenRate.type,
        tokenRate.isGovernance,
        tokenRate.address,
        tokenRate.network,
      )

      expect(ratesStub.calledOnce).to.be.true
      expect(result.tokenRate.priceUsd).to.equal('1')
      expect(result.tokenMetrics.totalHolders).to.equal(0)
      expect(result.tokenMetrics.totalSupply).to.equal('0')
    })

    it('should fetch token details when token is not native', async () => {
      const ratesStub = sandbox.stub(RateModule, 'fetchRate').resolves(tokenRate)
      const tokenFullDetails = {
        name: 'test',
        symbol: 'TST',
        decimals: 18,
        logo: 'fake-logo',
        isGovernance: true,
        type: ITokenType.ERC20,
        holders: 10,
        totalSupply: '100',
        priceUsd: '1',
      }

      const tokenFullDetailsStub = sandbox.stub(BlockScout, 'getTokenFullDetails').resolves(tokenFullDetails as any)

      const result = await ProxyToken._fetchTokenDetails(
        tokenRate.type,
        tokenRate.isGovernance,
        tokenRate.address,
        tokenRate.network,
      )

      expect(ratesStub.calledOnce).to.be.true
      expect(tokenFullDetailsStub.calledOnce).to.be.true
      expect(result.tokenRate.priceUsd).to.equal('1')
      expect(result.tokenRate.name).to.equal('test')
      expect(result.tokenRate.symbol).to.equal('TST')
      expect(result.tokenRate.decimals).to.equal(18)
      expect(result.tokenRate.logo).to.equal('fake-logo')
      expect(result.tokenMetrics.totalHolders).to.equal(10)
      expect(result.tokenMetrics.totalSupply).to.equal('100')
    })

    it('should fetch token details when token is not native and tokenFullDetails is null', async () => {
      tokenRate.type = ITokenType.ERC20
      tokenRate.isGovernance = true

      const ratesStub = sandbox.stub(RateModule, 'fetchRate').resolves(tokenRate)
      const tokenFullDetailsStub = sandbox.stub(BlockScout, 'getTokenFullDetails').resolves(null as any)
      const covalentMetrics = {
        totalHolders: 10,
        totalSupply: '100',
      }
      const covalentMetricsStub = sandbox
        .stub(CovalentHelper, 'getTokenSupplyAndHolders')
        .resolves(covalentMetrics as any)

      const result = await ProxyToken._fetchTokenDetails(
        tokenRate.type,
        tokenRate.isGovernance,
        tokenRate.address,
        tokenRate.network,
      )

      expect(ratesStub.calledOnce).to.be.true
      expect(tokenFullDetailsStub.calledOnce).to.be.true
      expect(covalentMetricsStub.calledOnce).to.be.true
      expect(result.tokenRate.priceUsd).to.equal('1')
      expect(result.tokenMetrics.totalHolders).to.equal(10)
      expect(result.tokenMetrics.totalSupply).to.equal('100')
    })

    it('should not fetch details when token is not erc20 and it is nft with no decimals', async () => {
      tokenRate.isGovernance = true
      tokenRate.type = ITokenType.ERC721
      tokenRate.name = 'Test'
      tokenRate.symbol = 'TST'
      tokenRate.decimals = 0
      tokenRate.priceUsd = '0'

      const ratesStub = sandbox.stub(RateModule, 'fetchRate').resolves(tokenRate)

      const tokenFullDetailsStub = sandbox.stub(BlockScout, 'getTokenFullDetails').resolves(null)

      const covalentTokenMetricsStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves({
        totalHolders: 10,
        totalSupply: '100',
      })

      const onChainTokenInfoStub = sandbox.stub(Web3Helper, 'getTokenInfo')

      const result = await ProxyToken._fetchTokenDetails(
        tokenRate.type,
        tokenRate.isGovernance,
        tokenRate.address,
        tokenRate.network,
      )

      expect(ratesStub.calledOnce).to.be.true
      expect(tokenFullDetailsStub.calledOnce).to.be.true
      expect(onChainTokenInfoStub.calledOnce).to.be.false
      expect(covalentTokenMetricsStub.calledOnce).to.be.true
      expect(result.tokenRate.priceUsd).to.equal('0')
      expect(result.tokenRate.name).to.equal('Test')
      expect(result.tokenRate.symbol).to.equal('TST')
      expect(result.tokenRate.decimals).to.equal(0)
      expect(result.tokenMetrics.totalHolders).to.equal(10)
      expect(result.tokenMetrics.totalSupply).to.equal('100')
    })

    it('should fetch token details when token rate is missing name, symbol, or decimals', async () => {
      tokenRate.isGovernance = true
      tokenRate.type = ITokenType.ERC20
      tokenRate.name = null
      tokenRate.symbol = null
      tokenRate.decimals = null
      tokenRate.priceUsd = '0'

      const ratesStub = sandbox.stub(RateModule, 'fetchRate').resolves(tokenRate)

      const tokenFullDetailsStub = sandbox.stub(BlockScout, 'getTokenFullDetails').resolves(null)

      const covalentTokenMetricsStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves({
        totalHolders: 10,
        totalSupply: '100',
      })

      const onChainTokenInfo = {
        name: 'test',
        symbol: 'TST',
        decimals: 18,
        logo: 'fake-logo',
      }
      const onChainTokenInfoStub = sandbox.stub(Web3Helper, 'getTokenInfo').resolves(onChainTokenInfo as any)

      const result = await ProxyToken._fetchTokenDetails(
        tokenRate.type,
        tokenRate.isGovernance,
        tokenRate.address,
        tokenRate.network,
      )

      expect(ratesStub.calledOnce).to.be.true
      expect(tokenFullDetailsStub.calledOnce).to.be.true
      expect(onChainTokenInfoStub.calledOnce).to.be.true
      expect(covalentTokenMetricsStub.calledOnce).to.be.true
      expect(result.tokenRate.priceUsd).to.equal('0')
      expect(result.tokenRate.name).to.equal('test')
      expect(result.tokenRate.symbol).to.equal('TST')
      expect(result.tokenRate.decimals).to.equal(18)
      expect(result.tokenRate.logo).to.equal('fake-logo')
      expect(result.tokenMetrics.totalHolders).to.equal(10)
      expect(result.tokenMetrics.totalSupply).to.equal('100')
    })

    it('should fetch token details when token is GovernanceERC20 and tokenMetrics are missing', async () => {
      tokenRate.type = ITokenType.ERC20
      tokenRate.isGovernance = true
      tokenRate.priceUsd = '0'
      tokenRate.name = null
      tokenRate.decimals = null

      const ratesStub = sandbox.stub(RateModule, 'fetchRate').resolves(tokenRate)

      const tokenFullDetailsStub = sandbox.stub(BlockScout, 'getTokenFullDetails').resolves(null)

      const covalentTokenMetricsStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves({
        totalHolders: 0,
        totalSupply: '0',
      })

      const onChainTokenInfo = {
        name: 'test',
        symbol: 'TST',
        decimals: 18,
        logo: 'fake-logo',
      }
      const onChainTokenInfoStub = sandbox.stub(Web3Helper, 'getTokenInfo').resolves(onChainTokenInfo as any)

      const web3TokenTotalSupplyStub = sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(10n)

      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      const result = await ProxyToken._fetchTokenDetails(
        tokenRate.type,
        tokenRate.isGovernance,
        tokenRate.address,
        tokenRate.network,
      )

      expect(ratesStub.calledOnce).to.be.true
      expect(tokenFullDetailsStub.calledOnce).to.be.true
      expect(onChainTokenInfoStub.calledOnce).to.be.true
      expect(covalentTokenMetricsStub.calledOnce).to.be.true
      expect(result.tokenRate.priceUsd).to.equal('0')
      expect(result.tokenRate.name).to.equal('test')
      expect(result.tokenRate.symbol).to.equal('TST')
      expect(result.tokenRate.decimals).to.equal(18)
      expect(result.tokenRate.logo).to.equal('fake-logo')
      expect(result.tokenMetrics.totalHolders).to.equal(0)
      expect(result.tokenMetrics.totalSupply).to.equal('10')
      expect(rabbitMQStub.calledOnce).to.be.true
      expect(web3TokenTotalSupplyStub.calledOnce).to.be.true
    })

    it('should fetch token details when token is in whitelisted', async () => {
      tokenRate.priceUsd = '0'
      tokenRate.name = 'test'
      tokenRate.symbol = 'TST'
      tokenRate.decimals = 0
      tokenRate.type = ITokenType.ERC721

      const ratesStub = sandbox.stub(RateModule, 'fetchRate').resolves(tokenRate)

      const tokenFullDetailsStub = sandbox.stub(BlockScout, 'getTokenFullDetails').resolves(null)

      const covalentTokenMetricsStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves({
        totalHolders: 0,
        totalSupply: '0',
      })

      const isWhiteListedTokenStub = sandbox.stub(Web3Helper, 'isWhitelistedToken').resolves(true)

      const onChainTokenInfoStub = sandbox.stub(Web3Helper, 'getTokenInfo')

      const web3TokenTotalSupplyStub = sandbox.stub(Web3Helper, 'getTokenTotalSupply').resolves(10n)

      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      const result = await ProxyToken._fetchTokenDetails(
        tokenRate.type,
        tokenRate.isGovernance,
        tokenRate.address,
        tokenRate.network,
      )

      expect(ratesStub.calledOnce).to.be.true
      expect(tokenFullDetailsStub.calledOnce).to.be.true
      expect(onChainTokenInfoStub.calledOnce).to.be.false
      expect(covalentTokenMetricsStub.calledOnce).to.be.true
      expect(result.tokenRate.priceUsd).to.equal('0')
      expect(result.tokenRate.name).to.equal('test')
      expect(result.tokenRate.symbol).to.equal('TST')
      expect(result.tokenRate.decimals).to.equal(0)
      expect(result.tokenMetrics.totalHolders).to.equal(0)
      expect(result.tokenMetrics.totalSupply).to.equal('10')
      expect(rabbitMQStub.calledOnce).to.be.true
      expect(web3TokenTotalSupplyStub.calledOnce).to.be.true
      expect(isWhiteListedTokenStub.called).to.be.true
    })
  })

  describe('saveAndGetToken', () => {
    it('should save and get token', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(Web3Helper, 'parseAddress').returns(tokenAddress)
      sandbox.stub(Models.Token, 'findExistingLog').resolves(null)
      const stubCreate = sandbox.stub(ProxyToken, 'createNewToken').resolves({ address: tokenAddress } as any)

      const result = await ProxyToken.saveAndGetToken(tokenAddress, network)

      expect(result?.address).to.equal(tokenAddress)
      expect(stubCreate?.calledOnce).to.be.true
    })

    it('should update existing token metrics', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const existingToken = { address: tokenAddress } as Token

      sandbox.stub(Web3Helper, 'parseAddress').returns(tokenAddress)
      sandbox.stub(Models.Token, 'findExistingLog').resolves(existingToken)
      const stubUpdate = sandbox.stub(ProxyToken, 'updateTokenMetrics').resolves(existingToken)

      const result = await ProxyToken.saveAndGetToken(tokenAddress, network)

      expect(result?.address).to.equal(tokenAddress)
      expect(stubUpdate?.calledOnce).to.be.true
    })

    it('should handle parallel requests and create the token only once', async () => {
      const tokenAddress = '0xD8981e488Dc62bc0f7aE6ce4bec09db0786aC2Db'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(ProxyToken, '_fetchTokenDetails').resolves({
        tokenRate: { priceUsd: '1', priceChangeOnDayUsd: '1' } as any,
        tokenMetrics: { totalHolders: 10, totalSupply: '11' },
      })

      sandbox.stub(TokenDetector, 'detectTokenType').resolves({
        type: ITokenType.ERC20,
        isGovernance: true,
        implementationAddress: null,
      } as any)

      sandbox.stub(ProxyToken, 'getContractCreationInfo').resolves({
        blockNumber: 100,
        transactionHash: '0x000',
        address: tokenAddress,
      } as any)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)

      const verboseStub = sandbox.stub(logger, 'verbose')

      const [result1, result2, result3] = await Promise.all([
        ProxyToken.saveAndGetToken(tokenAddress, network),
        ProxyToken.saveAndGetToken(tokenAddress, network),
        ProxyToken.saveAndGetToken(tokenAddress, network),
        ProxyToken.saveAndGetToken(tokenAddress, network),
        ProxyToken.saveAndGetToken(tokenAddress, network),
        ProxyToken.saveAndGetToken(tokenAddress, network),
        ProxyToken.saveAndGetToken(tokenAddress, network),
      ])

      expect(result1?.address).to.eq(tokenAddress)
      expect(result2?.address).to.eq(tokenAddress)
      expect(result3?.address).to.eq(tokenAddress)

      const tokensInDb = await Models.Token.find({ address: tokenAddress, network })

      expect(tokensInDb.length).to.equal(1)
      expect(result1?.address).to.equal(tokenAddress)
      expect(result2?.address).to.equal(tokenAddress)
      expect(result3?.address).to.equal(tokenAddress)
      expect(result1?.id).to.equal(tokensInDb[0].id)
      expect(result2?.id).to.equal(tokensInDb[0].id)
      expect(result3?.id).to.equal(tokensInDb[0].id)

      expect(verboseStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('New Token Created' as any)).to.be.true
    })
  })

  describe('updateTokenMetrics', () => {
    it('should update token metrics if necessary', async () => {
      const tOpts = await dbTx.transactionOptions()
      tOpts.startTransaction()

      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet
      const token = await Models.Token.create({
        skipFetchRate: false,
        network,
        address: tokenAddress,
        type: ITokenType.ERC20,
        isGovernance: true,
      })

      const proxyTokenFetchDetailsStub = sandbox.stub(ProxyToken, '_fetchTokenDetails').resolves({
        tokenRate: { priceUsd: '1', priceChangeOnDayUsd: '0.1' } as any,
        tokenMetrics: { totalHolders: 20, totalSupply: '1000' },
      })

      const result = await ProxyToken.updateTokenMetrics(token, tokenAddress, network, false, tOpts)

      expect(proxyTokenFetchDetailsStub.calledOnce).to.be.true
      expect(result.priceUsd).to.equal('1')
      expect(result.totalSupply).to.equal('1000')
    })
  })

  describe('createNewToken', () => {
    it('should create new token', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tOpts = await dbTx.transactionOptions()
      tOpts.startTransaction()

      const proxyTokenFetchDetailsStub = sandbox.stub(ProxyToken, '_fetchTokenDetails').resolves({
        tokenRate: { priceUsd: '1', priceChangeOnDayUsd: '0.1' } as any,
        tokenMetrics: { totalHolders: 20, totalSupply: '1000' },
      })

      const tokenDetectorStub = sandbox.stub(TokenDetector, 'detectTokenType').resolves({
        type: ITokenType.ERC20,
        isGovernance: true,
        implementationAddress: null,
      } as any)

      const getContractCreationInfoStub = sandbox.stub(ProxyToken, 'getContractCreationInfo').resolves({
        blockNumber: 100,
        transactionHash: '0x000',
        address: tokenAddress,
      })

      const checkPluginMintAuthorizationIsDaoStub = sandbox
        .stub(ProxyToken, 'checkPluginMintAuthorizationIsDao')
        .resolves(false)
      const result = await ProxyToken.createNewToken(tokenAddress, network, tOpts)

      expect(proxyTokenFetchDetailsStub.calledOnce).to.be.true
      expect(tokenDetectorStub.calledOnce).to.be.true
      expect(getContractCreationInfoStub.calledOnce).to.be.true
      expect(checkPluginMintAuthorizationIsDaoStub.calledOnce).to.be.true
      expect(result.priceUsd).to.equal('1')
      expect(result.totalSupply).to.equal('1000')
      expect(result.transactionHash).to.equal('0x000')
      expect(result.blockNumber).to.equal(100)
    })

    it('should handle when token type is unknown', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      const tOpts = await dbTx.transactionOptions()
      tOpts.startTransaction()

      const proxyTokenFetchDetailsStub = sandbox.stub(ProxyToken, '_fetchTokenDetails').resolves({
        tokenRate: { priceUsd: '1', priceChangeOnDayUsd: '0.1', type: ITokenType.ERC20 } as any,
        tokenMetrics: { totalHolders: 20, totalSupply: '1000' },
      })

      const tokenDetectorStub = sandbox.stub(TokenDetector, 'detectTokenType').resolves({
        type: ITokenType.unknown,
        implementationAddress: null,
      } as any)

      const getContractCreationInfoStub = sandbox.stub(ProxyToken, 'getContractCreationInfo').resolves({
        blockNumber: 100,
        transactionHash: '0x000',
        address: tokenAddress,
      })

      const checkPluginMintAuthorizationIsDaoStub = sandbox
        .stub(ProxyToken, 'checkPluginMintAuthorizationIsDao')
        .resolves(false)

      const result = await ProxyToken.createNewToken(tokenAddress, network, tOpts)
      expect(result.type).to.equal(ITokenType.ERC20)
      expect(proxyTokenFetchDetailsStub.calledOnce).to.be.true
      expect(tokenDetectorStub.calledOnce).to.be.true
      expect(getContractCreationInfoStub.calledOnce).to.be.false
      expect(checkPluginMintAuthorizationIsDaoStub.calledOnce).to.be.true
      expect(result.priceUsd).to.equal('1')
    })
  })

  describe('checkPluginMintAuthorizationIsDao', () => {
    it('should return when plugin is not found', async () => {
      sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves(null)
      const result = await ProxyToken.checkPluginMintAuthorizationIsDao('0xtoken', NetworksEnum.ethereumMainnet)
      expect(result).to.be.false
    })
    it('should return true if token is mintable by DAO', async () => {
      const findByTokenAddressStub = sandbox.stub(Models.Plugin, 'findByTokenAddress').resolves({
        daoAddress: '0x00',
        address: '0xplugin',
        tokenAddress: '0xtoken',
        permissions: [
          {
            who: '0x00',
            permissionId: ethers.id(IPermission.MINT_PERMISSION),
            where: '0xtoken',
          },
        ],
      })

      const result = await ProxyToken.checkPluginMintAuthorizationIsDao('0xtoken', NetworksEnum.ethereumMainnet)
      expect(findByTokenAddressStub.calledOnce).to.be.true
      expect(result).to.be.true
    })
  })

  describe('shouldSkipFetch', () => {
    it('should return true if token is GovernanceERC20 with price 0', () => {
      const token = { type: ITokenType.ERC20, isGovernance: true }
      const tokenRate = { priceUsd: '0' }

      const result = ProxyToken.shouldSkipFetch(token as any, tokenRate as any)

      expect(result).to.be.true
    })

    it('should return false if token price is non-zero', () => {
      const token = { type: ITokenType.ERC20 }
      const tokenRate = { priceUsd: '1' }

      const result = ProxyToken.shouldSkipFetch(token as any, tokenRate as any)

      expect(result).to.be.false
    })
  })

  describe('getContractCreationInfo', () => {
    it('should return contract creation info', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(EtherscanHelper, 'fetchContractCreation').resolves([{ txHash: '0xabc', address: tokenAddress }])
      sandbox.stub(Web3Helper, 'getTransaction').resolves({ blockNumber: 123 })

      const result = await ProxyToken.getContractCreationInfo(tokenAddress, network)

      expect(result.transactionHash).to.equal('0xabc')
      expect(result.blockNumber).to.equal(123)
    })

    it('should return contract creation info', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(EtherscanHelper, 'fetchContractCreation').resolves(null as any)
      const stubGetTx = sandbox.stub(Web3Helper, 'getTransaction')

      const result = await ProxyToken.getContractCreationInfo(tokenAddress, network)

      expect(result.blockNumber).to.equal(0)
      expect(result.transactionHash).to.equal(null)
      expect(result.address).to.equal(tokenAddress)
      expect(stubGetTx.notCalled).to.be.true
    })

    it('should check if token is scam or not', async () => {
      const name = 'CLAIM REWARDS ON DEBRIDGETHER.COM'
      const symbol = 'BRIDGE'

      const result = ProxyToken.analyzeIfScamToken(name, symbol)
      expect(result).to.be.true
    })
  })
})
