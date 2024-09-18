import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { ITokenType, NetworksEnum } from '@types'
import TokenDetector from '@helpers/tokenDetector'
import { RateModule } from '@modules/rates'
import dayjs from '@helpers/dayjs'
import Token from '@models/schema/token'
import utils from '@helpers/utils'
import { ProxyToken } from '@modules/proxyToken'
import logger from '@logger'
import CovalentHelper from '@helpers/covalent'
import Etherscan from '@helpers/etherscan'
import Web3Helper from '@helpers/web3'

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
    it('should detect token type and create new token if not found', async () => {
      const stubRate = sandbox.stub(RateModule, 'fetchRate').resolves({
        address: '0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564',
        name: 'TokenName',
        decimals: 18,
        symbol: 'TKN',
        priceUsd: '0',
        priceChangeOnDayUsd: '0',
        logo: null,
      } as any)

      sandbox.stub(logger, 'verbose')

      const stubTokenMetrics = sandbox.stub(ProxyToken, 'getTokenMetrics').resolves({
        totalHolders: 20,
        totalSupply: '1000',
      } as any)
      const stubFind = sandbox.stub(Models.Token, 'findExistingLog').resolves(null)
      const stubDetectTokenType = sandbox
        .stub(TokenDetector, 'detectTokenType')
        .resolves({ type: ITokenType.GovernanceERC20, implementationAddress: '0x456' } as any)

      const getContractCreationInfoStub = sandbox.stub(ProxyToken, 'getContractCreationInfo').resolves({
        txHash: '0x123',
        blockNumber: 100,
        address: '0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564',
      })

      const token = await ProxyToken.saveAndGetToken(
        '0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564',
        NetworksEnum.ethereumMainnet,
      )

      expect(getContractCreationInfoStub.calledOnce).to.be.true

      expect(stubRate.calledOnceWith('0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564', NetworksEnum.ethereumMainnet)).to.be
        .true
      expect(stubFind.calledOnce).to.be.true
      expect(stubTokenMetrics.calledOnce).to.be.true
      expect(stubDetectTokenType.calledOnce).to.be.true
      expect(token!.address).to.eq('0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564')
      expect(token!.skipFetchRate).to.eq(true)
      expect(token!.type).to.eq(ITokenType.GovernanceERC20)
      expect(token!.implementationAddress).to.eq('0x456')
      expect(token!.name).to.eq('TokenName')
      expect(token!.decimals).to.eq(18)
      expect(token!.symbol).to.eq('TKN')
      expect(token!.holders).to.eq(20)
      expect(token!.totalSupply).to.eq('1000')
      expect(token!.network).to.eq(NetworksEnum.ethereumMainnet)
      expect(token!.priceUsd).to.eq('0')
      expect(token!.priceChangeOnDayUsd).to.eq('0')
    })

    it('should detect token type unknown', async () => {
      const stubRate = sandbox.stub(RateModule, 'fetchRate').resolves({
        address: '0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564',
        name: 'TokenName',
        decimals: 18,
        symbol: 'TKN',
        logo: null,
        type: ITokenType.unknown,
        priceUsd: '1',
        priceChangeOnDayUsd: '0.1',
      } as any)
      sandbox.stub(logger, 'verbose')
      const stubFind = sandbox.stub(Models.Token, 'findExistingLog').resolves(null)
      const stubDetectTokenType = sandbox
        .stub(TokenDetector, 'detectTokenType')
        .resolves({ type: ITokenType.unknown } as any)
      const stubTokenMetrics = sandbox.stub(ProxyToken, 'getTokenMetrics').resolves({
        totalHolders: 20,
        totalSupply: '2000',
      } as any)
      const getContractCreationInfoStub = sandbox.stub(ProxyToken, 'getContractCreationInfo').resolves({
        txHash: '0x123',
        blockNumber: 100,
        address: '0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564',
      })
      const token = await ProxyToken.saveAndGetToken(
        '0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564',
        NetworksEnum.ethereumMainnet,
      )
      await utils.wait(300)
      expect(stubRate.calledOnceWith('0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564', NetworksEnum.ethereumMainnet)).to.be
        .true
      expect(stubFind.calledOnce).to.be.true
      expect(stubDetectTokenType.calledOnce).to.be.true
      expect(stubTokenMetrics.calledOnce).to.be.true
      expect(token!.type).to.eq(ITokenType.unknown)
      expect(token!.skipFetchRate).to.eq(false)
      expect(getContractCreationInfoStub.calledOnce).to.be.true
    })

    it('should return existing token if found', async () => {
      const stubDetect = sandbox.stub(TokenDetector, 'detectTokenType')

      const result = await ProxyToken.saveAndGetToken(rawToken.address as any, rawToken.network as any)

      expect(stubDetect.notCalled).to.be.true
      expect(result?.address).to.equal(rawToken.address)
    })

    it('should return existing token if found and update the token metrics as well', async () => {
      const stubDetect = sandbox.stub(TokenDetector, 'detectTokenType')
      sandbox.stub(Models.Token, 'findExistingLog').resolves({
        ...rawToken,
        holders: 20,
      } as any)

      const updateTokenMetricsStub = sandbox.stub(ProxyToken, 'updateTokenMetrics').resolves(true as any)
      await ProxyToken.saveAndGetToken(rawToken.address as any, rawToken.network as any, true)

      expect(updateTokenMetricsStub.calledOnce).to.be.true
      expect(stubDetect.notCalled).to.be.true
    })

    it('token not found', async () => {
      const stubFind = sandbox.stub(Models.Token, 'findExistingLog').resolves(true)
      const token = await ProxyToken.saveAndGetToken(
        '0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564',
        NetworksEnum.ethereumMainnet,
      )

      expect(token).to.be.true
      expect(stubFind.calledOnce).to.be.true
    })
  })

  describe('skipFetchToken', () => {
    it('should return true if the token is a GovernanceERC20 and price is 0', () => {
      const token = {
        type: ITokenType.GovernanceERC20,
        network: NetworksEnum.ethereumMainnet,
      }
      const tokenRate = {
        priceUsd: '0',
      }

      const result = ProxyToken.skipFetchToken(token as any, tokenRate as any)
      expect(result).to.be.true
    })

    it('should return false if the token is ERC20 and price is not 0', () => {
      const token = {
        type: ITokenType.ERC20,
        network: NetworksEnum.ethereumMainnet,
      }
      const tokenRate = {
        priceUsd: '1',
      }

      const result = ProxyToken.skipFetchToken(token as any, tokenRate as any)
      expect(result).to.be.false
    })

    it('should return true if the token network is in skipTestNetworks and price is 0', () => {
      const token = {
        type: ITokenType.ERC20,
        network: NetworksEnum.zksyncSepolia, // assuming this is in skipTestNetworks
      }
      const tokenRate = {
        priceUsd: '0',
      }

      const result = ProxyToken.skipFetchToken(token as any, tokenRate as any)
      expect(result).to.be.true
    })

    it('should return true for unknown token types with price 0', () => {
      const token = {
        type: ITokenType.unknown,
        network: NetworksEnum.ethereumMainnet,
      }
      const tokenRate = {
        priceUsd: '0',
      }

      const result = ProxyToken.skipFetchToken(token as any, tokenRate as any)
      expect(result).to.be.true
    })

    it('should return false for known token types with non-zero price', () => {
      const token = {
        type: ITokenType.ERC20,
        network: NetworksEnum.ethereumMainnet,
      }
      const tokenRate = {
        priceUsd: '100',
      }

      const result = ProxyToken.skipFetchToken(token as any, tokenRate as any)
      expect(result).to.be.false
    })
  })

  describe('updateTokenMetrics', () => {
    it('should update token metrics', async () => {
      const token = await Models.Token.findByTokenAddressAndNetwork(rawToken.address as any, rawToken.network as any)
      const getTokenMetricsStub = sandbox.stub(ProxyToken, 'getTokenMetrics').resolves({
        totalHolders: 20,
        totalSupply: '1000',
      } as any)

      const verboseStub = sandbox.stub(logger, 'verbose')

      const fetchRateStub = sandbox.stub(RateModule, 'fetchRate').resolves({
        priceUsd: '1',
        priceChangeOnDayUsd: '0.1',
      } as any)

      const result = await ProxyToken.updateTokenMetrics(token, rawToken.address!, rawToken.network!)
      expect(result.holders).to.be.eq(20)
      expect(result.totalSupply).to.be.eq('1000')
      expect(result.priceUsd).to.be.eq('1')
      expect(result.priceChangeOnDayUsd).to.be.eq('0.1')
      expect(getTokenMetricsStub.calledOnce).to.be.true
      expect(fetchRateStub.calledOnce).to.be.true
      expect(verboseStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Updated Token Metrics' as any)).to.be.true
    })

    it('should get the token metrics for native', async () => {
      const tokenType = ITokenType.native

      const result = await ProxyToken.getTokenMetrics(tokenType, rawToken.address as any, rawToken.network as any)

      expect(result).to.be.deep.eq({ totalHolders: 0, totalSupply: '0' })
    })

    it('should get the token metrics for ERC20', async () => {
      const tokenType = ITokenType.ERC20
      const getTokenInfoStub = sandbox.stub(CovalentHelper, 'getTokenInfo').resolves({
        totalHolders: 20,
        totalSupply: '1000',
      } as any)

      const result = await ProxyToken.getTokenMetrics(tokenType, rawToken.address as any, rawToken.network as any)

      expect(result).to.be.deep.eq({ totalHolders: 20, totalSupply: '1000' })
      expect(getTokenInfoStub.calledOnce).to.be.true
    })
  })

  describe('getContractCreationInfo', () => {
    it('should return contract creation info', async () => {
      const etherScanStub = sandbox.stub(Etherscan, 'fetchContractCreation').resolves([
        {
          txHash: '0x123',
          address: rawToken.address!,
        },
      ])
      const web3GetTxStub = sandbox.stub(Web3Helper, 'getTransaction').resolves({
        blockNumber: 123123213,
      } as any)

      const result = await ProxyToken.getContractCreationInfo(rawToken.address as any, rawToken.network as any)

      expect(etherScanStub.calledOnce).to.be.true
      expect(web3GetTxStub.calledOnce).to.be.true
      expect(result.txHash).to.be.eq('0x123')
      expect(result.blockNumber).to.be.eq(123123213)
    })
  })
})
