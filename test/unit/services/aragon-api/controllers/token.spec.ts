import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import TokenController from '@services/aragon-api/controllers/token'
import { ErrorKeyEnum, ITokenType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import dayjs from '@helpers/dayjs'
import Token from '@models/schema/token'
import { ProxyToken } from '@modules/proxyToken'

describe('Controller: Token', () => {
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

  describe('getTokensWithPagination', () => {
    it('should get proposals with pagination - all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        network: rawToken.network,
        type: rawToken.type,
      }

      const spyReq = sandbox.spy(Models.Token, 'findWithPagination')

      const response = await TokenController.getTokensWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].network).to.eq(rawToken.network)
      expect(response.data[0].address).to.eq(rawToken.address)
      expect(response.data[0].symbol).to.eq(rawToken.symbol)
      expect(response.data[0].decimals).to.eq(rawToken.decimals)
      expect(response.data[0].logo).to.eq(rawToken.logo)
      expect(response.data[0].name).to.eq(rawToken.name)
      expect(response.data[0].id).to.eq(rawToken.id)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get proposals no params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}

      const spyReq = sandbox.spy(Models.Token, 'findWithPagination')

      const response = await TokenController.getTokensWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].network).to.eq(rawToken.network)
      expect(response.data[0].address).to.eq(rawToken.address)
      expect(response.data[0].symbol).to.eq(rawToken.symbol)
      expect(response.data[0].decimals).to.eq(rawToken.decimals)
      expect(response.data[0].logo).to.eq(rawToken.logo)
      expect(response.data[0].name).to.eq(rawToken.name)
      expect(response.data[0].id).to.eq(rawToken.id)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })
  })

  describe('getTokenByAddress', async () => {
    it('getTokenByAddress new token', async () => {
      const fakeRes = {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc0',
        network: NetworksEnum.ethereumMainnet,
        logo: 'https://logos.covalenthq.com/tokens/1/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc0.png',
        name: 'Wrapped Ether',
        symbol: 'WETH',
        type: ITokenType.ERC20,
        decimals: 18,
        priceUsd: '4086.604',
        holders: 0,
        totalSupply: '0',
        priceChangeOnDayUsd: '22.262699999999768',
        lastUpdatedAt: dayjs().toISOString(),
      } as any

      fakeRes.filterKeys = sandbox.stub().returns(fakeRes)

      const stubHelper = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(fakeRes as any)
      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc0'
      const token = await TokenController.getTokenByAddress({
        address,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(token.address).to.eq(address)
      expect(stubHelper.calledOnce).to.be.true
      expect(stubHelper.calledWith(address, NetworksEnum.ethereumMainnet)).to.be.true
    })

    it('getTokenByAddress existing token', async () => {
      const rawToken = {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc0',
        network: NetworksEnum.ethereumMainnet,
        logo: 'https://logos.covalenthq.com/tokens/1/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png',
        name: 'Wrapped Ether',
        symbol: 'WETH',
        type: ITokenType.ERC20,
        decimals: 18,
        priceUsd: '4086.604',
        holders: 0,
        totalSupply: '0',
        priceChangeOnDayUsd: '22.262699999999768',
        lastUpdatedAt: '2024-03-12T00:28:29.991Z',
      }

      await Models.Token.create(rawToken)

      const stubHelper = sandbox.stub(ProxyToken, 'saveAndGetToken')
      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc0'
      const dbToken = await TokenController.getTokenByAddress({
        address,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(stubHelper.notCalled).to.be.true
      expect(dbToken.address).to.eq(address)
      expect(dbToken.network).to.eq(NetworksEnum.ethereumMainnet)
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

    it('getTokenByAddress not found', async () => {
      const stubHelper = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(undefined)
      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc1'
      await expect(
        TokenController.getTokenByAddress({
          address,
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)
      expect(stubHelper.calledOnce).to.be.true
    })
  })
})
