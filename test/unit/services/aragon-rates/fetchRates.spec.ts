import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { FetchRates } from '@services/aragon-rates/fetchRates'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { EnumQueueName, ITokenType, NetworksEnum } from '@types'
import TokenUtils from '@helpers/tokenUtils'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { FakeAsset } from '@test/mock/fakeAsset'
import ProxyWeb3Provider from "@modules/proxyProvider"
import dayjs from '@helpers/dayjs'
import DbTx from '@modules/dbTx'

describe('AragonRates: FetchRates', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the FetchRates', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubFetchRates = sandbox.stub(FetchRates, 'onMainnetDocument')
      const stubFetchTestnetRates = sandbox.stub(FetchRates, 'onTestnetDocument')
      const stubDaoMetrics = sandbox.stub(FetchRates, 'updateDaoMetrics')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onDocument(true)
      })

      await FetchRates.start()

      expect(stubLogger.calledWith('End FetchRates and dao metrics' as any)).to.be.true
      expect(stubFetchRates.calledOnceWith(true as any)).to.be.true
      expect(stubFetchTestnetRates.calledOnceWith(true as any)).to.be.true
      expect(crawlerStub.calledTwice).to.be.true
      expect(stubDaoMetrics.calledOnce).to.be.true
    })

    it('should error the FetchRates', async () => {
      const stubLoggerError = sandbox.stub(logger, 'error')
      const stubLogger = sandbox.stub(logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })
      const stubDaoMetrics = sandbox.stub(FetchRates, 'updateDaoMetrics')

      await FetchRates.start()

      expect(stubLogger.calledWith('End FetchRates and dao metrics' as any)).to.be.true
      expect(stubLoggerError.calledTwice).to.be.true
      expect(crawlerStub.calledTwice).to.be.true
      expect(stubDaoMetrics.calledOnce).to.be.true
    })

    it('should query and update the token', async () => {
      const tokens = [
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      ]

      await Promise.all(
        tokens.map(async token => {
          await Models.Token.create({
            network: NetworksEnum.ethereumMainnet,
            type: ITokenType.ERC20,
            address: token,
            logo: 'fake-logo',
            name: NetworksEnum.ethereumMainnet,
            symbol: 'WETH',
            decimals: 18,
            holders: 1,
            totalSupply: '1',
            priceUsd: '1.1',
            lastUpdatedAt: new Date(Date.now() - 1000 * 60 * 60 * 7),
          })
        }),
      )

      const onDocStub = sandbox.stub(FetchRates, 'onMainnetDocument')
      sandbox.stub(FetchRates, 'updateDaoMetrics')
      await FetchRates.start()
      expect(onDocStub.callCount).to.be.equal(3)
    })
  })

  describe('onMainnetDocument', () => {
    let tokenDb: any
    beforeEach(async () => {
      tokenDb = await Models.Token.create({
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        logo: 'fake-logo',
        name: NetworksEnum.ethereumMainnet,
        symbol: 'WETH',
        decimals: 18,
        holders: 1,
        totalSupply: '1',
        priceUsd: '1.1',
      })

      // Setup DbTx stub for all tests in this describe block
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (callback: any) => {
        await callback({
          session: {
            commitTransaction: async () => {},
            endSession: async () => {}
          }
        })
      })
    })

    it('should return early if fetchTokenPrice returns null', async () => {
      const fetchTokenPriceStub = sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves(null)
      const fetchTokenHolderAndSupplyStub = sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves({
        totalHolders: 2,
        totalSupply: '2'
      })

      const skipFetchStub = sandbox.stub(TokenUtils, 'shouldSkipFetch')

      await FetchRates.onMainnetDocument(tokenDb)

      expect(skipFetchStub.notCalled).to.be.true
      expect(fetchTokenPriceStub.calledOnce).to.be.true
      expect(fetchTokenHolderAndSupplyStub.calledOnce).to.be.true
      expect(fetchTokenPriceStub.calledWithMatch({
        address: tokenDb.address,
        network: tokenDb.network,
      })).to.be.true
    })

    it('should return early if fetchTokenHolderAndSupply returns null', async () => {
      const fetchTokenPriceStub = sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves({
        priceUsd: '1.2'
      })
      const fetchTokenHolderAndSupplyStub = sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves(null)

      const skipFetchStub = sandbox.stub(TokenUtils, 'shouldSkipFetch')

      await FetchRates.onMainnetDocument(tokenDb)

      expect(skipFetchStub.notCalled).to.be.true
      expect(fetchTokenPriceStub.calledOnce).to.be.true
      expect(fetchTokenHolderAndSupplyStub.calledOnce).to.be.true
    })

    it('should return early if token data is identical to fetched update', async () => {
      const priceUpdate = {
        priceUsd: '1.1'
      }

      const holdersUpdate = {
        totalHolders: 1,
        totalSupply: '1',
      }

      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves(priceUpdate)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves(holdersUpdate)

      const updateStub = sandbox.stub(tokenDb, 'update')
      await FetchRates.onMainnetDocument(tokenDb)
      expect(updateStub.notCalled).to.be.true
    })

    it('should update token with skipFetchRate if shouldSkipFetch returns true', async () => {
      const priceUpdate = {
        priceUsd: '1.2'
      }

      const holdersUpdate = {
        totalHolders: 2,
        totalSupply: '2',
      }

      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves(priceUpdate)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves(holdersUpdate)

      const skipFetchStub = sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(true)
      const mockDate = new Date('2023-01-01T00:00:00Z')
      sandbox.stub(dayjs, 'utc').returns({ toDate: () => mockDate } as any)

      const updateStub = sandbox.stub(tokenDb, 'update').resolves(tokenDb)
      sandbox.stub(logger, 'verbose')

      await FetchRates.onMainnetDocument(tokenDb)

      expect(skipFetchStub.calledOnce).to.be.true
      expect(updateStub.calledWith({
        holders: 2,
        totalSupply: '2',
        priceUsd: '1.2',
        lastUpdatedAt: mockDate,
        skipFetchRate: true
      })).to.be.true
    })

    it('should update token with fetched data when shouldSkipFetch returns false', async () => {
      const priceUpdate = {
        priceUsd: '1.2'
      }

      const holdersUpdate = {
        totalHolders: 2,
        totalSupply: '2',
      }

      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').resolves(priceUpdate)
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves(holdersUpdate)

      const skipFetchStub = sandbox.stub(TokenUtils, 'shouldSkipFetch').returns(false)
      const mockDate = new Date('2023-01-01T00:00:00Z')
      sandbox.stub(dayjs, 'utc').returns({ toDate: () => mockDate } as any)

      const updateStub = sandbox.stub(tokenDb, 'update').resolves(tokenDb)
      sandbox.stub(logger, 'verbose')

      await FetchRates.onMainnetDocument(tokenDb)

      expect(skipFetchStub.calledOnce).to.be.true
      expect(updateStub.calledWith({
        holders: 2,
        totalSupply: '2',
        priceUsd: '1.2',
        lastUpdatedAt: mockDate
      })).to.be.true
    })

    it('should log error when an exception occurs', async () => {
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenPrice').rejects(new Error('API error'))

      const loggerErrorStub = sandbox.stub(logger, 'error')
      await FetchRates.onMainnetDocument(tokenDb)

      expect(loggerErrorStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledWith('Error FetchRates' as any)).to.be.true
    })
  })

  describe('onTestnetDocument', () => {
    let tokenDb: any
    beforeEach(async () => {
      tokenDb = await Models.Token.create({
        network: NetworksEnum.ethereumSepolia,
        type: ITokenType.ERC20,
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        logo: 'fake-logo',
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        holders: 1,
        totalSupply: '1',
        priceUsd: '1.1',
      })

      // Setup DbTx stub for all tests in this describe block
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (callback: any) => {
        await callback({
          session: {
            commitTransaction: async () => {},
            endSession: async () => {}
          }
        })
      })
    })

    it('should return early if fetchTokenHolderAndSupply returns null', async () => {
      const fetchTokenHolderAndSupplyStub = sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves(null)

      const updateStub = sandbox.stub(tokenDb, 'update')
      await FetchRates.onTestnetDocument(tokenDb)

      expect(fetchTokenHolderAndSupplyStub.calledOnce).to.be.true
      expect(updateStub.notCalled).to.be.true
    })

    it('should return early if totalHolders is missing', async () => {
      const holdersUpdate = {
        totalHolders: 0,
        totalSupply: '2',
      }

      sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves(holdersUpdate)

      const updateStub = sandbox.stub(tokenDb, 'update')
      await FetchRates.onTestnetDocument(tokenDb)

      expect(updateStub.notCalled).to.be.true
    })

    it('should return early if totalSupply is missing', async () => {
      const holdersUpdate = {
        totalHolders: 2,
        totalSupply: '',
      }

      sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves(holdersUpdate)

      const updateStub = sandbox.stub(tokenDb, 'update')
      await FetchRates.onTestnetDocument(tokenDb)

      expect(updateStub.notCalled).to.be.true
    })

    it('should return early if token data is identical to fetched update', async () => {
      const holdersUpdate = {
        totalHolders: 1,
        totalSupply: '1',
      }

      sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves(holdersUpdate)

      const updateStub = sandbox.stub(tokenDb, 'update')
      await FetchRates.onTestnetDocument(tokenDb)

      expect(updateStub.notCalled).to.be.true
    })

    it('should update token with fetched data', async () => {
      const holdersUpdate = {
        totalHolders: 2,
        totalSupply: '2',
      }

      sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').resolves(holdersUpdate)

      const mockDate = new Date('2023-01-01T00:00:00Z')
      sandbox.stub(dayjs, 'utc').returns({ toDate: () => mockDate } as any)

      const updateStub = sandbox.stub(tokenDb, 'update').resolves(tokenDb)
      sandbox.stub(logger, 'verbose')

      await FetchRates.onTestnetDocument(tokenDb)

      expect(updateStub.calledWith({
        holders: 2,
        totalSupply: '2',
        lastUpdatedAt: mockDate
      })).to.be.true
    })

    it('should log error when an exception occurs', async () => {
      sandbox.stub(ProxyWeb3Provider, 'fetchTokenHolderAndSupply').rejects(new Error('API error'))

      const loggerErrorStub = sandbox.stub(logger, 'error')
      await FetchRates.onTestnetDocument(tokenDb)

      expect(loggerErrorStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledWith('Error FetchRates on testnet' as any)).to.be.true
    })
  })

  describe('updateDaoMetrics', () => {
    it('should update dao metrics', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubOnDaoDocument = sandbox.stub(FetchRates, 'onDaoDocument')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onDocument(true)
      })

      await FetchRates.updateDaoMetrics()

      expect(stubLogger.calledWith('End Dao Metrics Update' as any)).to.be.true
      expect(stubOnDaoDocument.calledOnceWith(true)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the dao metrics update', async () => {
      const stubLoggerError = sandbox.stub(logger, 'error')
      const stubLogger = sandbox.stub(logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await FetchRates.updateDaoMetrics()

      expect(stubLogger.calledWith('End Dao Metrics Update' as any)).to.be.true
      expect(stubLoggerError.calledOnceWith('Error Dao Metrics Update' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should handle the aggregation query and handle the crawler', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')

      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.aggregate()
      })

      await FetchRates.updateDaoMetrics()

      expect(stubLogger.calledWithMatch('Start Dao Metrics Update' as any)).to.be.true
      expect(stubLogger.calledWithMatch('End Dao Metrics Update' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should handle the onDaoDocument', async () => {
      const stubSendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage')
      await FetchRates.onDaoDocument({ daoAddress: '0xdao', network: NetworksEnum.ethereumMainnet })
      expect(
        stubSendMessage.calledWithMatch(EnumQueueName.daoMetrics, {
          id: '0xdao',
          params: { address: '0xdao', network: NetworksEnum.ethereumMainnet },
        }),
      ).to.be.true
    })

    it('should replicate the crawler', async () => {
      const assets = [
        {
          ...FakeAsset,
          id: '0xdao1',
          daoAddress: '0xdao1',
          network: NetworksEnum.polygonMainnet,
        },
        {
          ...FakeAsset,
          id: '0xdao2',
          daoAddress: '0xdao2',
          network: NetworksEnum.ethereumMainnet,
        },
      ]

      await Promise.all(
        assets.map(async asset => {
          await Models.Asset.create(asset)
        }),
      )

      sandbox.stub(logger, 'verbose')
      const stubSendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage')

      await FetchRates.updateDaoMetrics()

      expect(stubSendMessage.calledTwice).to.be.true
      expect(stubSendMessage.calledWithMatch(EnumQueueName.daoMetrics, { id: '0xdao1' })).to.be.true
      expect(stubSendMessage.calledWithMatch(EnumQueueName.daoMetrics, { id: '0xdao2' })).to.be.true
    })
  })
})