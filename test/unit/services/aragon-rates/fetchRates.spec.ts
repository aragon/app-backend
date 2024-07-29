import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { FetchRates } from '@services/aragon-rates/fetchRates'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { RateModule } from '@modules/rates'
import { ITokenType, NetworksEnum } from '@types'
import { UtilsIndexer } from '@indexer/utils/indexer'
import CovalentHelper from '@helpers/covalent'

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
    sandbox.stub(CovalentHelper, 'getTokenTotalHolders').resolves(10)
    sandbox.stub(UtilsIndexer, 'skipFetchToken').returns(true)

    const tokenDb = await Models.Token.create({
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
    })

    await FetchRates.onDocument(tokenDb)

    expect(stubFetchRates.calledOnceWith(tokenDb.address, tokenDb.network)).to.be.true
    expect(stubLogger.calledOnceWith('Token rate updated' as any)).to.be.true

    const updatedToken = await Models.Token.findByTokenAddressAndNetwork(tokenDb.address, tokenDb.network)
    expect(updatedToken.priceUsd).to.be.equal('1')
    expect(updatedToken.priceChangeOnDayUsd).to.be.equal('1')
    expect(updatedToken.lastUpdatedAt).to.exist
    expect(updatedToken.skipFetchRate).to.be.true
    expect(updatedToken.holders).to.be.equal(10)
  })
})
