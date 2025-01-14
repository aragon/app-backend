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
      name: 'ethereum',
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
    it('should create a new token if not found', async () => {
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

      sandbox.stub(TokenDetector, 'detectTokenType').resolves({
        type: ITokenType.GovernanceERC20,
        implementationAddress: null,
      } as any)
      sandbox.stub(RateModule, 'fetchRate').resolves({
        priceUsd: '1',
        priceChangeOnDayUsd: '1',
      } as any)
      sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves({
        totalHolders: 1,
        totalSupply: '1',
      } as any)
      sandbox.stub(ProxyToken, 'getContractCreationInfo').resolves({
        blockNumber: 100,
        transactionHash: '0x000',
        address: tokenAddress,
      } as any)
      sandbox.stub(ProxyToken, 'checkPluginMintAuthorizationIsDao').resolves(false)

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
    })
  })

  describe('updateTokenMetrics', () => {
    it('should update token metrics if necessary', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet
      const token = await Models.Token.create({ network, address: tokenAddress, type: ITokenType.GovernanceERC20 })

      sandbox.stub(RateModule, 'fetchRate').resolves({ priceUsd: '1', priceChangeOnDayUsd: '0.1' } as any)
      sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves({
        totalHolders: 20,
        totalSupply: '1000',
      } as any)

      const result = await ProxyToken.updateTokenMetrics(token, tokenAddress, network, false)

      expect(result.priceUsd).to.equal('1')
      expect(result.totalSupply).to.equal('1000')
    })
  })

  describe('createNewToken', () => {
    it('should create a new token and save it to the database', async () => {
      const tokenAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(TokenDetector, 'detectTokenType').resolves({
        type: ITokenType.GovernanceERC20,
        implementationAddress: null,
      } as any)
      sandbox.stub(RateModule, 'fetchRate').resolves({
        priceUsd: '1',
        priceChangeOnDayUsd: '1',
      } as any)
      sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves({
        totalHolders: 1,
        totalSupply: '1',
      } as any)
      sandbox.stub(ProxyToken, 'getContractCreationInfo').resolves({
        blockNumber: 100,
        transactionHash: '0x000',
        address: tokenAddress,
      } as any)

      const checkPluginMintAuthorizationIsDaoStub = sandbox
        .stub(ProxyToken, 'checkPluginMintAuthorizationIsDao')
        .resolves(false)

      const result = await ProxyToken.createNewToken(tokenAddress, network, {
        commitTransaction: sandbox.stub(),
      } as any)

      expect(checkPluginMintAuthorizationIsDaoStub.calledOnce).to.be.true
      expect(checkPluginMintAuthorizationIsDaoStub.calledWith(tokenAddress, network)).to.be.true
      expect(result.holders).to.equal(1)
      expect(result.totalSupply).to.equal('1')
      expect(result.priceChangeOnDayUsd).to.equal('1')
      expect(result.priceUsd).to.equal('1')
      expect(result.transactionHash).to.equal('0x000')
      expect(result.blockNumber).to.equal(100)
      expect(result.address).to.equal(tokenAddress)
      expect(result.type).to.equal(ITokenType.GovernanceERC20)
      expect(result.mintableByDao).to.be.false
    })
  })

  describe('checkPluginMintAuthorizationIsDao', () => {
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
      const token = { type: ITokenType.GovernanceERC20 }
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
  })
})
