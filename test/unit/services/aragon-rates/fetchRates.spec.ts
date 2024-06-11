import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { FetchRates } from '@services/aragon-rates/fetchRates'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { RateModule } from '@modules/rates'
import { ITokenType, NetworksEnum } from '@types'

describe('Rates: FetchRates', () => {
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

  it('onDocument', async () => {
    const fakeRate = { priceUsd: 1, priceChangeOnDayUsd: 1 }
    const stubFetchRates = sandbox.stub(RateModule, 'fetchRate').resolves(fakeRate as any)
    const stubLogger = sandbox.stub(logger, 'verbose')

    const tokenDb = await Models.Token.create({
      network: NetworksEnum.mainnet,
      type: ITokenType.ERC20,
      address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      logo: 'fake-logo',
      name: 'ethereum',
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
  })
})
