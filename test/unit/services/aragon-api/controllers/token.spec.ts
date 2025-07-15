import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import TokenController from '@services/aragon-api/controllers/token'
import { EnumQueueName, ErrorKeyEnum, ITokenType, NetworksEnum } from '@types'
import CovalentHelper from '@helpers/covalent'
import { Models } from '@dbModels'
import dayjs from '@helpers/dayjs'
import Token from '@models/schema/token'
import { ProxyToken } from '@modules/proxyToken'
import RabbitMQHelper from '@helpers/rabbitMQ'

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
        lastUpdatedAt: dayjs().toISOString(),
        filterKeys: function () {
          return this
        },
      }

      const stubSaveAndGetToken = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(fakeRes as any)

      const stubDbFind = sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(null)

      const address = fakeRes.address
      const token = await TokenController.getTokenByAddress({
        address,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(token.address).to.eq(address)
      expect(token.network).to.eq(NetworksEnum.ethereumMainnet)
      expect(token.logo).to.eq(fakeRes.logo)
      expect(token.name).to.eq(fakeRes.name)
      expect(token.type).to.eq(fakeRes.type)
      expect(token.symbol).to.eq(fakeRes.symbol)
      expect(token.decimals).to.eq(fakeRes.decimals)
      expect(token.priceUsd).to.eq(fakeRes.priceUsd)
      expect(token.holders).to.eq(fakeRes.holders)
      expect(token.totalSupply).to.eq(fakeRes.totalSupply)
      expect(dayjs(token.lastUpdatedAt).format('YYYY-MM-DDTHH:mm:ss')).to.eq(
        dayjs(fakeRes.lastUpdatedAt).format('YYYY-MM-DDTHH:mm:ss'),
      )

      expect(stubSaveAndGetToken.calledOnceWith(address, NetworksEnum.ethereumMainnet)).to.be.true
      expect(stubDbFind.calledOnceWith(address, NetworksEnum.ethereumMainnet)).to.be.true
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
        lastUpdatedAt: '2024-03-12T00:28:29.991Z',
      }

      await Models.Token.create(rawToken)

      const stubHelper = sandbox.stub(CovalentHelper, 'getToken')
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
      expect(dayjs(dbToken.lastUpdatedAt).format('YYYY-MM-DDTHH:mm:ss')).to.eq(
        dayjs(rawToken.lastUpdatedAt).format('YYYY-MM-DDTHH:mm:ss'),
      )
    })

    it('getTokenByAddress not found', async () => {
      const stubSaveAndGetToken = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(undefined)
      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc1'
      await expect(
        TokenController.getTokenByAddress({
          address,
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)
      expect(stubSaveAndGetToken.calledOnce).to.be.true
    })
  })

  describe('getTokenStats', async () => {
    it('should successfully retrieve token stats', async () => {
      const tokenAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const network = NetworksEnum.ethereumMainnet
      const mockTokenStats = { holders: 10, transfers: 50 }

      // Stub the token find method to return our token
      const tokenFindStub = sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(rawToken as any)

      // Stub the RabbitMQ sendMessage method
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(mockTokenStats)

      const result = await TokenController.getTokenStats({ address: tokenAddress, network })

      expect(tokenFindStub.calledOnceWith(tokenAddress, network)).to.be.true

      expect(rabbitMQStub.calledOnce).to.be.true
      expect(rabbitMQStub.args[0][0]).to.equal(EnumQueueName.getTokenStats)
      expect(rabbitMQStub.args[0][1]).to.deep.equal({
        id: `getTokenStats-${tokenAddress}-${network}`,
        params: {
          address: tokenAddress,
          network,
        },
      })
      expect(rabbitMQStub.args[0][2]).to.deep.equal({ waitResponse: true, timeout: 10000 })

      expect(result).to.deep.equal(mockTokenStats)
    })

    it('should throw an error when token is not found', async () => {
      const tokenAddress = '0xNonExistentToken'
      const network = NetworksEnum.ethereumMainnet

      // Stub the token find method to return null
      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(null)

      try {
        await TokenController.getTokenStats({ address: tokenAddress, network })
        expect.fail('Expected an error to be thrown')
      } catch (err: any) {
        expect(err.message).to.include(ErrorKeyEnum.notFound)
      }

      // Verify that RabbitMQ.sendMessage was not called
      expect(sandbox.stub(RabbitMQHelper, 'sendMessage').called).to.be.false
    })
  })
})
