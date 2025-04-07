import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { FetchRates } from '@services/aragon-rates/fetchRates'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { EnumQueueName, ITokenType, NetworksEnum } from '@types'
import { ProxyToken } from '@modules/proxyToken'
import BlockScoutHelper from '@helpers/blockScout'
import TokenUtils from '@helpers/tokenUtils'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { FakeAsset } from '@test/mock/fakeAsset'

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
    })

    it('should return early if fetchTokenUpdate returns null', async () => {
      // Stub fetchTokenUpdate to return null.
      sandbox.stub(TokenUtils, 'fetchTokenUpdate').resolves(null)

      const skipFetchStub = sandbox.stub(ProxyToken, 'shouldSkipFetch')
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      await FetchRates.onMainnetDocument(tokenDb)

      expect(skipFetchStub.notCalled).to.be.true
      expect(loggerVerboseStub.notCalled).to.be.true
    })

    it('should return early if token data is identical to fetched update', async () => {
      const fakeTokenUpdates = {
        priceUsd: '1.1',
        holders: 1,
        totalSupply: '1',
      }

      sandbox.stub(TokenUtils, 'fetchTokenUpdate').resolves(fakeTokenUpdates)
      const updateStub = sandbox.stub(tokenDb, 'update')
      await FetchRates.onMainnetDocument(tokenDb)
      expect(updateStub.notCalled).to.be.true
    })

    it('should update token with skipFetchRate if shouldSkipFetch returns true', async () => {
      const fakeTokenUpdates = {
        priceUsd: '1.2',
        holders: 2,
        totalSupply: '2',
      }

      sandbox.stub(TokenUtils, 'fetchTokenUpdate').resolves(fakeTokenUpdates)
      sandbox.stub(ProxyToken, 'shouldSkipFetch').returns(true)
      await FetchRates.onMainnetDocument(tokenDb)
      const reloadedToken = await Models.Token.findOne({ address: tokenDb.address })
      expect(reloadedToken.skipFetchRate).to.be.true
      expect(reloadedToken.holders).to.be.equal(2)
      expect(reloadedToken.totalSupply).to.be.equal('2')
      expect(reloadedToken.priceUsd).to.be.equal('1.2')
    })

    it('should update token with fetched data', async () => {
      const fakeTokenUpdates = {
        priceUsd: '1.2',
        holders: 2,
        totalSupply: '2',
      }

      sandbox.stub(TokenUtils, 'fetchTokenUpdate').resolves(fakeTokenUpdates)
      sandbox.stub(ProxyToken, 'shouldSkipFetch').returns(false)

      await FetchRates.onMainnetDocument(tokenDb)
      const reloadedToken = await Models.Token.findOne({ address: tokenDb.address })

      expect(reloadedToken.skipFetchRate).to.be.false
      expect(reloadedToken.holders).to.be.equal(2)
      expect(reloadedToken.totalSupply).to.be.equal('2')
      expect(reloadedToken.priceUsd).to.be.equal('1.2')
    })

    it('should throw error', async () => {
      const tokenDb = await Models.Token.create({
        id: 'token-123',
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
      sandbox.stub(TokenUtils, 'fetchTokenUpdate').rejects(new Error('error'))
      const stubError = sandbox.stub(logger, 'error')
      await FetchRates.onMainnetDocument(tokenDb)

      expect(stubError.calledOnceWith('Error FetchRates' as any)).to.be.true
    })
  })

  describe('onTestnetDocument', () => {
    it('should return early if blockscout info is null', async () => {
      const tokenDb = await Models.Token.create({
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
      const stubTokenFullDetails = sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves(null)
      const stubUpdate = sandbox.stub(tokenDb, 'update')
      await FetchRates.onTestnetDocument(tokenDb)
      expect(stubTokenFullDetails.calledOnce).to.be.true
      expect(stubUpdate.notCalled).to.be.true
    })

    it('should return early if blockScoutInfo is missing holders or totalSupply', async () => {
      const tokenDb = await Models.Token.create({
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
      const blockScoutInfo = {
        holders: 0,
        totalSupply: '0',
      }
      const stubTokenFullDetails = sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves(blockScoutInfo as any)
      const stubUpdate = sandbox.stub(tokenDb, 'update')
      await FetchRates.onTestnetDocument(tokenDb)
      expect(stubTokenFullDetails.calledOnce).to.be.true
      expect(stubUpdate.notCalled).to.be.true
    })

    it('should return early if token data is identical to fetched update', async () => {
      const tokenDb = await Models.Token.create({
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
      const blockScoutInfo = {
        holders: 1,
        totalSupply: '1',
      }
      const stubTokenFullDetails = sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves(blockScoutInfo as any)
      const stubUpdate = sandbox.stub(tokenDb, 'update')
      await FetchRates.onTestnetDocument(tokenDb)
      expect(stubTokenFullDetails.calledOnce).to.be.true
      expect(stubUpdate.notCalled).to.be.true
    })

    it('should update token with fetched data', async () => {
      const tokenDb = await Models.Token.create({
        id: 'token-123',
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
      const blockScoutInfo = {
        holders: 2,
        totalSupply: '2',
      }
      const stubTokenFullDetails = sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves(blockScoutInfo as any)
      await FetchRates.onTestnetDocument(tokenDb)
      expect(stubTokenFullDetails.calledOnce).to.be.true
      const tokenReloaded = await Models.Token.findOne({
        id: 'token-123',
      })
      expect(tokenReloaded.holders).to.be.equal(2)
      expect(tokenReloaded.totalSupply).to.be.equal('2')
    })

    it('should throw error', async () => {
      const tokenDb = await Models.Token.create({
        id: 'token-123',
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
      sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').rejects(new Error('error'))
      const stubError = sandbox.stub(logger, 'error')
      await FetchRates.onTestnetDocument(tokenDb)

      expect(stubError.calledOnceWith('Error FetchRates on testnet' as any)).to.be.true
    })
  })

  describe('updateDaoMetrics after rates', () => {
    it('should update dao metrics', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubOnDaoDocument = sandbox.stub(FetchRates, 'onDaoDocument')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onDocument(true)
      })

      await FetchRates.updateDaoMetrics()

      expect(stubLogger.calledWith('End Dao Metrics Update' as any)).to.be.true
      expect(stubOnDaoDocument.calledOnceWith(true as any)).to.be.true
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
        stubSendMessage.calledWithMatch(EnumQueueName.daoMetrics as any, {
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
      expect(stubSendMessage.calledWithMatch(EnumQueueName.daoMetrics as any, { id: '0xdao1' })).to.be.true
      expect(stubSendMessage.calledWithMatch(EnumQueueName.daoMetrics as any, { id: '0xdao2' })).to.be.true
    })
  })
})
