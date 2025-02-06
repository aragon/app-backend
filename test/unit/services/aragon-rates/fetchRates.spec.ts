import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { FetchRates } from '@services/aragon-rates/fetchRates'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { RateModule } from '@modules/rates'
import { ITokenType, NetworksEnum } from '@types'
import { ProxyToken } from '@modules/proxyToken'
import BlockScoutHelper from '@helpers/blockScout'

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
      const stubFetchRates = sandbox.stub(FetchRates, 'onDocument')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onDocument(true)
      })

      await FetchRates.start()

      expect(stubLogger.calledWith('End FetchRates' as any)).to.be.true
      expect(stubFetchRates.calledOnceWith(true as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the FetchRates', async () => {
      const stubLoggerError = sandbox.stub(logger, 'error')
      const stubLogger = sandbox.stub(logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await FetchRates.start()

      expect(stubLogger.calledWith('End FetchRates' as any)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  describe('onDocument', () => {
    it('should handle onDocument', async () => {
      const fakeRate = { priceUsd: 1, priceChangeOnDayUsd: 1 }
      const stubFetchRates = sandbox.stub(RateModule, 'fetchRate').resolves(fakeRate as any)
      const stubLogger = sandbox.stub(logger, 'verbose')

      sandbox.stub(ProxyToken, 'shouldSkipFetch').returns(true)

      const tokenDb = await Models.Token.create({
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
      })

      await FetchRates.onDocument(tokenDb)

      expect(stubFetchRates.calledOnceWith(tokenDb.address, tokenDb.network)).to.be.true
      expect(stubLogger.calledOnceWith('Token rate updated' as any)).to.be.true

      const updatedToken = await Models.Token.findByTokenAddressAndNetwork(tokenDb.address, tokenDb.network)
      expect(updatedToken.priceUsd).to.be.equal('1')
      expect(updatedToken.priceChangeOnDayUsd).to.be.equal('1')
      expect(updatedToken.lastUpdatedAt).to.exist
      expect(updatedToken.skipFetchRate).to.be.true
    })

    it('should return when handling fetch rates when the both providers are down', async () => {
      const tokenDb = await Models.Token.create({
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
      })

      const stubFetchRates = sandbox.stub(RateModule, 'fetchRate').resolves({
        decimals: null,
      } as any)

      const stubBlockScoutHelper = sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves(null)

      const shouldSkipFetchStub = sandbox.stub(ProxyToken, 'shouldSkipFetch').returns(true)

      await FetchRates.onDocument(tokenDb)

      expect(stubFetchRates.calledOnceWith(tokenDb.address, tokenDb.network)).to.be.true
      expect(stubBlockScoutHelper.calledOnceWith(tokenDb.address, tokenDb.network)).to.be.true
      expect(shouldSkipFetchStub.notCalled).to.be.true
    })

    it('should handle when fetch rates is down and blockscout is up', async () => {
      const tokenDb = await Models.Token.create({
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
      })

      const stubFetchRates = sandbox.stub(RateModule, 'fetchRate').resolves({
        decimals: null,
      } as any)

      const stubBlockScoutHelper = sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves({
        decimals: 18,
        type: ITokenType.ERC20,
        name: 'WETH',
        symbol: 'WETH',
        totalSupply: '100',
        holders: 10,
        logo: 'fake-logo',
        priceUsd: '1',
      })

      const shouldSkipFetchStub = sandbox.stub(ProxyToken, 'shouldSkipFetch').returns(false)

      const verboseStub = sandbox.stub(logger, 'verbose')
      await FetchRates.onDocument(tokenDb)

      expect(stubFetchRates.calledOnceWith(tokenDb.address, tokenDb.network)).to.be.true
      expect(stubBlockScoutHelper.calledOnceWith(tokenDb.address, tokenDb.network)).to.be.true
      expect(shouldSkipFetchStub.calledOnce).to.be.true
      expect(verboseStub.calledOnce).to.be.true
    })
  })
})
