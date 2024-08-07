import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { ITokenType, NetworksEnum } from '@types'
import TokenDetector from '@helpers/tokenDetector'
import Web3Helper from '@helpers/web3'
import { RateModule } from '@modules/rates'
import dayjs from '@helpers/dayjs'
import Token from '@models/schema/token'
import utils from '@helpers/utils'
import { TokenProxy } from '@modules/tokenProxy'

describe('Modules: TokenProxy', () => {
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
        priceUsd: '0',
        priceChangeOnDayUsd: '0.0',
      } as any)
      const stubFind = sandbox.stub(Models.Token, 'findExistingLog').resolves(null)
      const stubDetectTokenType = sandbox
        .stub(TokenDetector, 'detectTokenType')
        .resolves({ type: ITokenType.GovernanceERC20, implementationAddress: '0x456' } as any)
      const stubGetToken = sandbox.stub(Web3Helper, 'getTokenInfo').resolves({
        address: '0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564',
        name: 'TokenName',
        decimals: 18,
        symbol: 'TKN',
        totalSupply: '2000',
      })

      const token = await TokenProxy.saveAndGetToken(
        '0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564',
        NetworksEnum.ethereumMainnet,
      )

      expect(stubRate.calledOnceWith('0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564', NetworksEnum.ethereumMainnet)).to.be
        .true
      expect(stubFind.calledOnce).to.be.true
      expect(stubDetectTokenType.calledOnce).to.be.true
      expect(stubGetToken.calledOnce).to.be.true
      expect(token!.address).to.eq('0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564')
      expect(token!.skipFetchRate).to.eq(true)
      expect(token!.type).to.eq(ITokenType.GovernanceERC20)
      expect(token!.implementationAddress).to.eq('0x456')
      expect(token!.name).to.eq('TokenName')
      expect(token!.decimals).to.eq(18)
      expect(token!.symbol).to.eq('TKN')
      expect(token!.totalSupply).to.eq('2000')
      expect(token!.network).to.eq(NetworksEnum.ethereumMainnet)
      expect(token!.priceUsd).to.eq('0')
      expect(token!.priceChangeOnDayUsd).to.eq('0.0')
    })

    it('should detect token type unknown', async () => {
      const stubRate = sandbox.stub(RateModule, 'fetchRate').resolves({
        priceUsd: '1',
        priceChangeOnDayUsd: '0.1',
      } as any)
      const stubFind = sandbox.stub(Models.Token, 'findExistingLog').resolves(null)
      const stubDetectTokenType = sandbox
        .stub(TokenDetector, 'detectTokenType')
        .resolves({ type: ITokenType.unknown } as any)
      const stubGetToken = sandbox.stub(Web3Helper, 'getTokenInfo').resolves({
        address: '0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564',
        name: 'TokenName',
        decimals: 18,
        symbol: 'TKN',
        totalSupply: '2000',
      })

      const token = await TokenProxy.saveAndGetToken(
        '0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564',
        NetworksEnum.ethereumMainnet,
      )
      await utils.wait(300)
      expect(stubRate.calledOnceWith('0xA109D1DDE2f2F6f385B39cDB91A24cCb83a9b564', NetworksEnum.ethereumMainnet)).to.be
        .true
      expect(stubFind.calledOnce).to.be.true
      expect(stubDetectTokenType.calledOnce).to.be.true
      expect(stubGetToken.calledOnce).to.be.true
      expect(token!.type).to.eq(ITokenType.unknown)
      expect(token!.skipFetchRate).to.eq(false)
    })

    it('should return existing token if found', async () => {
      const stubDetect = sandbox.stub(TokenDetector, 'detectTokenType')

      const result = await TokenProxy.saveAndGetToken(rawToken.address as any, rawToken.network as any)

      expect(stubDetect.notCalled).to.be.true
      expect(result?.address).to.equal(rawToken.address)
    })

    it('token not found', async () => {
      const stubFind = sandbox.stub(Models.Token, 'findExistingLog').resolves(true)
      const token = await TokenProxy.saveAndGetToken(
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

      const result = TokenProxy.skipFetchToken(token as any, tokenRate as any)
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

      const result = TokenProxy.skipFetchToken(token as any, tokenRate as any)
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

      const result = TokenProxy.skipFetchToken(token as any, tokenRate as any)
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

      const result = TokenProxy.skipFetchToken(token as any, tokenRate as any)
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

      const result = TokenProxy.skipFetchToken(token as any, tokenRate as any)
      expect(result).to.be.false
    })
  })
})
