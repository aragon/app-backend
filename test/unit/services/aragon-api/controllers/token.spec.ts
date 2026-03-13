import config from '@config'
import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import dayjs from '@helpers/dayjs'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Token from '@models/schema/token'
import TokenController from '@services/aragon-api/controllers/token'
import { TotalSupplyRefresh } from '@services/aragon-api/helpers/totalSupplyRefresh'
import { EnumQueueName, ErrorKeyEnum, ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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

    it('should trigger refresh for stale tokens in results', async () => {
      const refreshStub = sandbox.stub(TotalSupplyRefresh, 'triggerRefreshForStaleTokens')

      await TokenController.getTokensWithPagination(
        { pageSize: 10, page: 1, order: 'asc', sort: 'createdAt' },
        { network: rawToken.network },
      )

      expect(refreshStub.calledOnce).to.be.true
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
      const fakeToken = {
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

      const stubRabbitMQ = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const stubDbFind = sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork')
      stubDbFind.onFirstCall().resolves(null)
      stubDbFind.onSecondCall().resolves(fakeToken as any)

      const address = fakeToken.address
      const token = await TokenController.getTokenByAddress({
        address,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(token.address).to.eq(address)
      expect(token.network).to.eq(NetworksEnum.ethereumMainnet)
      expect(token.logo).to.eq(fakeToken.logo)
      expect(token.name).to.eq(fakeToken.name)
      expect(token.type).to.eq(fakeToken.type)
      expect(token.symbol).to.eq(fakeToken.symbol)
      expect(token.decimals).to.eq(fakeToken.decimals)
      expect(token.priceUsd).to.eq(fakeToken.priceUsd)
      expect(token.holders).to.eq(fakeToken.holders)
      expect(token.totalSupply).to.eq(fakeToken.totalSupply)

      expect(stubRabbitMQ.calledOnce).to.be.true
      expect(stubRabbitMQ.firstCall.args[0]).to.eq(EnumQueueName.tokenInfo)
      expect(stubRabbitMQ.firstCall.args[1].params).to.deep.equal({ address, network: NetworksEnum.ethereumMainnet })
      expect(stubRabbitMQ.firstCall.args[2]).to.deep.equal({ waitResponse: true, timeout: config.RABBITMQ.TIMEOUT })
      expect(stubDbFind.calledTwice).to.be.true
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

      const stubHelper = sandbox.stub(CoinGeckoHelper, 'getToken')
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
      const stubRabbitMQ = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const stubDbFind = sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(null)

      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc1'
      await expect(
        TokenController.getTokenByAddress({
          address,
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.rejectedWith(Error, ErrorKeyEnum.notFound)

      expect(stubRabbitMQ.calledOnce).to.be.true
      expect(stubDbFind.calledTwice).to.be.true
    })
  })

  describe('getGovernanceRewards', () => {
    const PLUGIN_ADDRESS = '0x1652FDd272fEf49B53bd102550DE775519e60b8E'

    it('Should send RabbitMQ message and return result', async () => {
      const mockRewards = [
        { address: '0xAlice', amount: '600' },
        { address: '0xBob', amount: '400' },
      ]

      const sendStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(mockRewards)

      const params = {
        pluginAddress: PLUGIN_ADDRESS,
        network: NetworksEnum.ethereumSepolia,
        lookbackDate: '2025-09-14T00:00:00.000Z',
        rewardTotalAmount: '1000000000000000000000',
      }

      const result = await TokenController.getGovernanceRewards(params as any)

      expect(result).to.deep.eq(mockRewards)
      expect(sendStub.calledOnce).to.be.true
      expect(sendStub.args[0][0]).to.eq(EnumQueueName.governanceRewardDistribution)
      expect(sendStub.args[0][1]).to.deep.include({ params })
      expect(sendStub.args[0][2]).to.deep.eq({ waitResponse: true, timeout: config.RABBITMQ.TIMEOUT })
    })

    it('Should throw when lookbackDate is in the future', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString()

      let error: any
      try {
        await TokenController.getGovernanceRewards({
          pluginAddress: PLUGIN_ADDRESS,
          network: NetworksEnum.ethereumSepolia,
          lookbackDate: futureDate,
          rewardTotalAmount: '1000',
        } as any)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
    })

    it('Should throw when RabbitMQ returns null', async () => {
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(null)

      let error: any
      try {
        await TokenController.getGovernanceRewards({
          pluginAddress: PLUGIN_ADDRESS,
          network: NetworksEnum.ethereumSepolia,
          lookbackDate: '2025-09-14T00:00:00.000Z',
          rewardTotalAmount: '1000',
        } as any)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('notFound')
    })

    it('Should throw when RabbitMQ returns error object', async () => {
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves({ error: 'Failed to resolve escrow address' })

      let error: any
      try {
        await TokenController.getGovernanceRewards({
          pluginAddress: PLUGIN_ADDRESS,
          network: NetworksEnum.ethereumSepolia,
          lookbackDate: '2025-09-14T00:00:00.000Z',
          rewardTotalAmount: '1000',
        } as any)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('notFound')
    })
  })
})
