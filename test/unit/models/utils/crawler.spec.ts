import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DBCrawler from '@models/utils/crawler'
import logger from '@logger'

describe('Model/Utils: crawler', () => {
  let sandbox: SinonSandbox
  let mockModel: any = null

  beforeEach(() => {
    sandbox = sinon.createSandbox()

    mockModel = {
      find: sandbox.stub().returnsThis(),
      aggregate: sandbox.stub().returnsThis(),
      countDocuments: sandbox.stub().resolves(100),
      exec: sandbox.stub().resolves([]),
      select: sandbox.stub().returnsThis(),
      populate: sandbox.stub().returnsThis(),
      limit: sandbox.stub().returnsThis(),
      skip: sandbox.stub().returnsThis(),
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().returnsThis(),
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('processes documents successfully', async () => {
    const onDocumentStub = sandbox.stub().resolves()
    const crawler = new DBCrawler({
      model: mockModel,
      onDocument: onDocumentStub,
      batchSize: 2,
      concurrency: 1,
    })

    const simulatedDocuments = new Array(10).fill(null).map((_, index) => ({ _id: index.toString() }))
    mockModel.exec.onFirstCall().resolves(simulatedDocuments)
    mockModel.exec.onSecondCall().resolves([])

    await crawler.crawl()

    expect(onDocumentStub.callCount).to.equal(10)
  })

  it('throws an error if required options are missing', () => {
    expect(() => new DBCrawler({})).to.throw('Need onDocument method')
    expect(() => new DBCrawler({ onDocument: () => {} })).to.throw('Need model to crawl')
  })

  it('correctly handles useAggregate = true', async () => {
    const crawler = new DBCrawler({
      model: mockModel,
      onDocument: () => {},
      useAggregate: true,
      batchSize: 2,
      concurrency: 1,
    })

    const expectedResult = [{ _id: '1' }, { _id: '2' }]
    mockModel.exec.resolves(expectedResult)

    const result = await crawler['_fetchNext'](2, 0)

    expect(result).to.deep.equal(expectedResult)
    expect(mockModel.aggregate.calledOnce).to.be.true
    expect(mockModel.aggregate.firstCall.args[0][0]).to.deep.include({ $skip: 0 })
    expect(mockModel.aggregate.firstCall.args[0][1]).to.deep.include({ $limit: 2 })
  })

  it('correctly handles useAggregate = true with missing lines', async () => {
    const crawler = new DBCrawler({
      model: mockModel,
      onDocument: () => {},
      useAggregate: true,
      batchSize: 2,
      concurrency: 1,
    })

    const result = [{ count: 2 }]

    mockModel.aggregate.returns({ exec: () => sandbox.stub().resolves(result) })

    await crawler.crawl()

    expect(crawler['nbTotal']).to.equal(0)
  })

  it('_worker handles error', async () => {
    const onErrorStub = sandbox.stub()
    const mockError = new Error('Fake error')

    const crawler = new DBCrawler({
      model: mockModel,
      onDocument: async () => {
        throw mockError
      },
      stopOnError: true,
      onError: onErrorStub,
      batchSize: 2,
      concurrency: 1,
    })

    await crawler._worker(mockError as any)

    expect(onErrorStub.calledOnce).to.be.true
    expect(crawler['crawlResult'].nbError).to.eq(1)
    expect(crawler['isOnError']).to.be.true
  })

  it('correctly handles sorting and raw mode', async () => {
    const crawler = new DBCrawler({
      model: mockModel,
      onDocument: () => {},
      sort: { field: 1 },
      raw: true,
      batchSize: 2,
      concurrency: 1,
    })

    const expectedResult = [{ _id: '1' }, { _id: '2' }]
    mockModel.exec.resolves(expectedResult)

    const result = await crawler['_fetchNext'](2, 0)

    expect(result).to.deep.equal(expectedResult)
    expect(mockModel.find.calledOnce).to.be.true
    expect(mockModel.find.firstCall.args[0]).to.deep.include({})
    expect(mockModel.lean.calledOnce).to.be.true
  })

  it('defaultOnError', () => {
    const document = 'fakeDoc'
    const error = 'fakeError'

    const stubLogger = sandbox.stub(logger, 'error')
    DBCrawler.defaultOnError(document as any, error as any)

    expect(stubLogger.calledOnce).to.be.true
    expect(stubLogger.calledWith('error on db crawler' as any)).to.be.true
  })

  it('crawl error', async () => {
    const crawler = new DBCrawler({
      model: mockModel,
      onDocument: () => {},
      batchSize: 2,
      concurrency: 1,
    })

    crawler.crawl()

    try {
      await crawler.crawl()
    } catch (error: any) {
      expect(error.message).to.equal('Already crawling')
    }
  })
})
