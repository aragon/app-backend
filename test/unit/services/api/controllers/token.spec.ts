import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import TokenController from '@services/api/controllers/token'
import {ErrorKeyEnum, ITokenType, NetworksEnum} from '@types'
import CovalentHelper from '@helpers/covalent'
import { Models } from '@dbModels'
import dayjs from '@helpers/dayjs'

describe('Controller: Token', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getTokenByAddressAndNetwork', async () => {
    it('getTokenByAddressAndNetwork new token', async () => {
      const fakeRes = {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        network: NetworksEnum.mainnet,
        logo: 'https://logos.covalenthq.com/tokens/1/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png',
        name: 'Wrapped Ether',
        symbol: 'WETH',
        type: ITokenType.ERC20,
        decimals: 18,
        priceUsd: '4086.604',
        holders: 0,
        totalSupply: 0,
        priceChangeOnDayUsd: 22.262699999999768,
        lastUpdatedAt: dayjs().toISOString(),
      }

      const stubHelper = sandbox.stub(CovalentHelper, 'getToken').resolves(fakeRes as any)
      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const token = await TokenController.getTokenByAddressAndNetwork({
        address,
        network: NetworksEnum.mainnet,
      })

      expect(token.address).to.eq(address)
      expect(stubHelper.calledOnce).to.be.true
      expect(stubHelper.calledWith(address, NetworksEnum.mainnet)).to.be.true

      const dbToken = await Models.Token.findByTokenAddressAndNetwork(address, NetworksEnum.mainnet)
      expect(dbToken.address).to.eq(address)
      expect(dbToken.network).to.eq(NetworksEnum.mainnet)
      expect(dbToken.logo).to.eq(fakeRes.logo)
      expect(dbToken.name).to.eq(fakeRes.name)
      expect(dbToken.type).to.eq(fakeRes.type)
      expect(dbToken.symbol).to.eq(fakeRes.symbol)
      expect(dbToken.decimals).to.eq(fakeRes.decimals)
      expect(dbToken.priceUsd).to.eq(fakeRes.priceUsd)
      expect(dbToken.holders).to.eq(fakeRes.holders)
      expect(dbToken.totalSupply).to.eq(fakeRes.totalSupply)
      expect(dbToken.priceChangeOnDayUsd).to.eq(fakeRes.priceChangeOnDayUsd)
      expect(dayjs(dbToken.lastUpdatedAt).format('YYYY-MM-DDTHH:mm:ss')).to.eq(
        dayjs(fakeRes.lastUpdatedAt).format('YYYY-MM-DDTHH:mm:ss'),
      )
    })

    it('getTokenByAddressAndNetwork existing token', async () => {
      const rawToken = {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        network: NetworksEnum.mainnet,
        logo: 'https://logos.covalenthq.com/tokens/1/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png',
        name: 'Wrapped Ether',
        symbol: 'WETH',
        type: ITokenType.ERC20,
        decimals: 18,
        priceUsd: '4086.604',
        holders: 0,
        totalSupply: 0,
        priceChangeOnDayUsd: 22.262699999999768,
        lastUpdatedAt: '2024-03-12T00:28:29.991Z',
      }

      await Models.Token.create(rawToken)

      const stubHelper = sandbox.stub(CovalentHelper, 'getToken')
      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const dbToken = await TokenController.getTokenByAddressAndNetwork({
        address,
        network: NetworksEnum.mainnet,
      })

      expect(stubHelper.notCalled).to.be.true
      expect(dbToken.address).to.eq(address)
      expect(dbToken.network).to.eq(NetworksEnum.mainnet)
      expect(dbToken.logo).to.eq(rawToken.logo)
      expect(dbToken.name).to.eq(rawToken.name)
      expect(dbToken.symbol).to.eq(rawToken.symbol)
      expect(dbToken.decimals).to.eq(rawToken.decimals)
      expect(dbToken.priceUsd).to.eq(rawToken.priceUsd)
      expect(dbToken.holders).to.eq(rawToken.holders)
      expect(dbToken.totalSupply).to.eq(rawToken.totalSupply)
      expect(dbToken.priceChangeOnDayUsd).to.eq(rawToken.priceChangeOnDayUsd)
      expect(dayjs(dbToken.lastUpdatedAt).format('YYYY-MM-DDTHH:mm:ss')).to.eq(
        dayjs(rawToken.lastUpdatedAt).format('YYYY-MM-DDTHH:mm:ss'),
      )
    })

    it('getTokenByAddressAndNetwork not found', async () => {
      const stubHelper = sandbox.stub(CovalentHelper, 'getToken').resolves(undefined)
      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      await expect(
        TokenController.getTokenByAddressAndNetwork({
          address,
          network: NetworksEnum.mainnet,
        }),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)
      expect(stubHelper.calledOnce).to.be.true
    })
  })
})
