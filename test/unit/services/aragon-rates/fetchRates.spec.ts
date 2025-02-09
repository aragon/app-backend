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
import CovalentHelper from '@helpers/covalent'

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

    it.only('should query and update the token', async () => {
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
            priceChangeOnDayUsd: '1',
            priceUsd: '1.1',
            lastUpdatedAt: new Date(Date.now() - 1000 * 60 * 60 * 7),
          })
        }),
      )

      sandbox.stub(logger, 'verbose')
      const onDocStub = sandbox.stub(FetchRates, 'onDocument')
      await FetchRates.start()
      expect(onDocStub.callCount).to.be.equal(3)
    })
  })

  describe('onDocument', () => {
    it('should handle onDocument when the normal data flow', async () => {
      const fakeRate = { priceUsd: '1', priceChangeOnDayUsd: '1' }
      const stubFetchRates = sandbox.stub(RateModule, 'fetchRate').resolves(fakeRate as any)
      const stubLogger = sandbox.stub(logger, 'verbose')
      sandbox.stub(ProxyToken, 'shouldSkipFetch').returns(true)
      sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves({
        holders: 10,
        totalSupply: '100',
        priceUsd: '1',
      } as any)

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
        priceChangeOnDayUsd: '1',
        priceUsd: '1.1',
      })

      await FetchRates.onDocument(tokenDb)

      expect(stubFetchRates.calledOnceWith(tokenDb.address, tokenDb.network)).to.be.true
      expect(stubLogger.calledOnceWith('Token rate updated' as any)).to.be.true

      const updatedToken = await tokenDb.reload()
      expect(updatedToken.priceUsd).to.be.equal('1')
      expect(updatedToken.holders).to.be.equal(10)
      expect(updatedToken.totalSupply).to.be.equal('100')
    })

    it('should return if the both info is not avaialble', async () => {
      sandbox.stub(RateModule, 'fetchRate').resolves({
        decimals: null,
      } as any)

      sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves(false as any)

      const skipFetchStub = sandbox.stub(ProxyToken, 'shouldSkipFetch').returns(false)

      const tokenDb = await Models.Token.create({
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        logo: 'fake-logo',
        name: 'WETH-Token',
        symbol: 'WETH',
        decimals: 18,
        holders: 10,
        totalSupply: '100',
        priceChangeOnDayUsd: '1',
        priceUsd: '0.9',
      })

      await FetchRates.onDocument(tokenDb)
      expect(skipFetchStub.notCalled).to.be.true
    })

    it('should handle when the token rate is not avaialble and the blockscout info is available', async () => {
      sandbox.stub(RateModule, 'fetchRate').resolves({
        decimals: null,
      } as any)

      sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves({
        holders: 10,
        totalSupply: '100',
        priceUsd: '1',
      } as any)

      sandbox.stub(logger, 'verbose')

      const skipFetchStub = sandbox.stub(ProxyToken, 'shouldSkipFetch').returns(false)

      const tokenDb = await Models.Token.create({
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        logo: 'fake-logo',
        name: 'WETH-Token',
        symbol: 'WETH',
        decimals: 18,
        holders: 5,
        totalSupply: '10',
        priceChangeOnDayUsd: '1',
        priceUsd: '0.9',
      })

      await FetchRates.onDocument(tokenDb)
      expect(skipFetchStub.calledOnce).to.be.true
      const token = await tokenDb.reload()
      expect(token.priceUsd).to.be.equal('1')
      expect(token.holders).to.be.equal(10)
      expect(token.totalSupply).to.be.equal('100')
    })

    it('should handle if the rate is available but the blockscout info is not available', async () => {
      sandbox.stub(RateModule, 'fetchRate').resolves({
        priceUsd: '1',
        priceChangeOnDayUsd: '1',
      } as any)

      sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves(false as any)

      const covalentStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves({
        totalSupply: '100',
        totalHolders: 10,
      })

      sandbox.stub(logger, 'verbose')

      const skipFetchStub = sandbox.stub(ProxyToken, 'shouldSkipFetch').returns(false)

      const tokenDb = await Models.Token.create({
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.GovernanceERC20,
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        logo: 'fake-logo',
        name: 'WETH-Token',
        symbol: 'WETH',
        decimals: 18,
        holders: 5,
        totalSupply: '10',
        priceChangeOnDayUsd: '1',
        priceUsd: '0.9',
      })

      await FetchRates.onDocument(tokenDb)
      expect(skipFetchStub.calledOnce).to.be.true
      const token = await tokenDb.reload()
      expect(token.priceUsd).to.be.equal('1')
      expect(token.holders).to.be.equal(10)
      expect(token.totalSupply).to.be.equal('100')
      expect(covalentStub.calledOnce).to.be.true
      expect(covalentStub.calledWith(tokenDb.address, tokenDb.network)).to.be.true
    })

    it('should handle if the blockscout info is available but the rate price is 0', async () => {
      sandbox.stub(RateModule, 'fetchRate').resolves({
        priceUsd: '0',
        decimals: 18,
        priceChangeOnDayUsd: '0',
      } as any)

      sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves(null)

      sandbox.stub(logger, 'verbose')

      const skipFetchStub = sandbox.stub(ProxyToken, 'shouldSkipFetch').returns(false)

      const tokenDb = await Models.Token.create({
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.ERC20,
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        logo: 'fake-logo',
        name: 'WETH-Token',
        symbol: 'WETH',
        decimals: 18,
        holders: 5,
        totalSupply: '10',
        priceChangeOnDayUsd: '1',
        priceUsd: '0.9',
      })

      await FetchRates.onDocument(tokenDb)
      expect(skipFetchStub.notCalled).to.be.true
    })

    it('should handle if some error occurs', async () => {
      sandbox.stub(RateModule, 'fetchRate').rejects(new Error('Sync indexes error'))

      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(logger, 'verbose')

      const tokenDb = await Models.Token.create({
        network: NetworksEnum.ethereumMainnet,
        type: ITokenType.native,
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        logo: 'fake-logo',
        name: 'WETH-Token',
        symbol: 'WETH',
        decimals: 18,
        holders: 5,
        totalSupply: '10',
        priceChangeOnDayUsd: '1',
        priceUsd: '0.9',
      })

      await FetchRates.onDocument(tokenDb)
      expect(errorStub.calledOnce).to.be.true
    })
  })
})
