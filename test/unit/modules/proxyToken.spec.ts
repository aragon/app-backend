import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { ITokenType, NetworksEnum } from '@types'
import TokenDetector from '@helpers/tokenDetector'
import dayjs from '@helpers/dayjs'
import Token from '@models/schema/token'
import { ProxyToken } from '@modules/proxyToken'
import Web3Helper from '@helpers/web3'
import { ethers } from 'ethers'
import { IPermission } from '@src/types/permission'
import dbTx from '@modules/dbTx'
import logger from '@logger'
import TokenDetailProvider from '@providers/tokenDetailProvider/providerFactory'

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

      sandbox.stub(TokenDetailProvider, 'fetchTokenDetails').resolves({
        tokenDetails: { priceUsd: '1', priceChangeOnDayUsd: '1' } as any,
        tokenMetrics: { totalHolders: 10, totalSupply: '11' },
      })

      sandbox.stub(TokenDetector, 'detectTokenType').resolves({
        type: ITokenType.ERC20,
        isGovernance: true,
        implementationAddress: null,
      } as any)

      sandbox.stub(TokenDetailProvider, 'fetchContractCreation').resolves({
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

      const proxyTokenFetchDetailsStub = sandbox.stub(TokenDetailProvider, 'fetchTokenDetails').resolves({
        tokenDetails: { priceUsd: '1', priceChangeOnDayUsd: '0.1' } as any,
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

      const proxyTokenFetchDetailsStub = sandbox.stub(TokenDetailProvider, 'fetchTokenDetails').resolves({
        tokenDetails: { priceUsd: '1', priceChangeOnDayUsd: '0.1' } as any,
        tokenMetrics: { totalHolders: 20, totalSupply: '1000' },
      })

      const tokenDetectorStub = sandbox.stub(TokenDetector, 'detectTokenType').resolves({
        type: ITokenType.ERC20,
        isGovernance: true,
        implementationAddress: null,
      } as any)

      const getContractCreationInfoStub = sandbox.stub(TokenDetailProvider, 'fetchContractCreation').resolves({
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

      const proxyTokenFetchDetailsStub = sandbox.stub(TokenDetailProvider, 'fetchTokenDetails').resolves({
        tokenDetails: { priceUsd: '1', priceChangeOnDayUsd: '0.1', type: ITokenType.ERC20 } as any,
        tokenMetrics: { totalHolders: 20, totalSupply: '1000' },
      })

      const tokenDetectorStub = sandbox.stub(TokenDetector, 'detectTokenType').resolves({
        type: ITokenType.unknown,
        implementationAddress: null,
      } as any)

      const getContractCreationInfoStub = sandbox.stub(TokenDetailProvider, 'fetchContractCreation').resolves({
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
})
