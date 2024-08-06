import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { FetchDaoTokenInfo } from '@rates/daoToken'
import CovalentHelper from '@helpers/covalent'
import { NetworksEnum } from '@types'

describe('aggregator:FetchDaoTokenInfo', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the FetchDaoTokenInfo', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubFetchDaoTokenInfo = sandbox.stub(FetchDaoTokenInfo, 'onDocument')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onDocument(true)
      })

      await FetchDaoTokenInfo.start()

      expect(stubLogger.calledWith('End FetchRates' as any)).to.be.true
      expect(stubFetchDaoTokenInfo.calledOnceWith(true as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the FetchDaoTokenInfo', async () => {
      const stubLoggerError = sandbox.stub(logger, 'error')
      const stubLogger = sandbox.stub(logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await FetchDaoTokenInfo.start()

      expect(stubLogger.calledWith('End FetchRates' as any)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  it('it should getAllDaoTokens aggregation query', () => {
    const query = FetchDaoTokenInfo.getAllDaoTokens()
    expect(query).to.be.an('array')
  })

  it('should handle the document', async () => {
    const tokenInfoStub = sandbox.stub(CovalentHelper, 'getTokenInfo').returns({
      totalHolders: 1,
      totalSupply: 1,
    } as any)

    const updateStub = sandbox.stub().returns({ id: 'xxx' })
    const findByEntityIdStub = sandbox.stub(Models.Token, 'findByEntityId').returns({
      update: updateStub,
    })

    await FetchDaoTokenInfo.onDocument({
      tokenAddress: '0x123',
      id: 'xxx',
      address: '0x00',
      network: NetworksEnum.ethereumSepolia,
    } as any)

    expect(tokenInfoStub.calledOnce).to.be.true
    expect(updateStub.calledOnce).to.be.true
    expect(findByEntityIdStub.calledOnce).to.be.true
  })

  it('should return null if tokenInfo is null', async () => {
    const tokenInfoStub = sandbox.stub(CovalentHelper, 'getTokenInfo').returns(null as any)

    const updateStub = sandbox.stub().returns({ id: 'xxx' })
    sandbox.stub(Models.Token, 'findByEntityId').returns({
      update: updateStub,
    })

    await FetchDaoTokenInfo.onDocument({
      tokenAddress: '0x123',
      id: 'xxx',
      address: '0x00',
      network: NetworksEnum.ethereumSepolia,
    } as any)

    expect(tokenInfoStub.calledOnce).to.be.true
    expect(updateStub.calledOnce).to.be.false
  })
})
