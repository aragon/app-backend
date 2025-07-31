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
      countDocuments: sandbox.stub().resolves(10),
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

  it('processes documents', async () => {
    const onDocumentStub = sandbox.stub().resolves()
    onDocumentStub.onCall(9).rejects(new Error('Failure on the last call'))

    const simulatedDocuments = new Array(10).fill(null).map((_, index) => ({ _id: index.toString() }))
    mockModel.exec = sandbox.stub().onFirstCall().resolves(simulatedDocuments).onSecondCall().resolves([])

    const crawler = new DBCrawler({
      model: mockModel,
      onDocument: onDocumentStub,
      batchSize: 2,
      concurrency: 1,
    })

    const crawlResult = await crawler.crawl()

    expect(onDocumentStub.callCount).to.equal(10)
    expect(crawlResult.nbError).to.equal(1)
    expect(crawlResult.nbTotal).to.equal(10)
  })

  it('processes all documents across multiple batches', async () => {
    const processedDocs: any[] = []
    const onDocumentStub = sandbox.stub().callsFake(doc => {
      processedDocs.push(doc)
      return Promise.resolve()
    })

    const totalDocuments = 6137
    const batchSize = 2000

    // Create simulated documents with unique IDs
    const allDocuments: any[] = []
    for (let i = 0; i < totalDocuments; i++) {
      allDocuments.push({ _id: `doc-${i}`, index: i })
    }

    // Split into batches
    const batch1 = allDocuments.slice(0, 2000)
    const batch2 = allDocuments.slice(2000, 4000)
    const batch3 = allDocuments.slice(4000, 6137)

    // Mock the countDocuments to return total
    mockModel.countDocuments = sandbox.stub().resolves(totalDocuments)

    // Mock exec to return batches in sequence
    let execCallCount = 0
    mockModel.exec = sandbox.stub().callsFake(() => {
      execCallCount++
      if (execCallCount === 1) return Promise.resolve(batch1)
      if (execCallCount === 2) return Promise.resolve(batch2)
      if (execCallCount === 3) return Promise.resolve(batch3)
      return Promise.resolve([]) // Empty array to signal no more documents
    })

    const crawler = new DBCrawler({
      model: mockModel,
      onDocument: onDocumentStub,
      batchSize: batchSize,
      concurrency: 200, // High concurrency like in the migration
      skip: 0,
    })

    const crawlResult = await crawler.crawl()

    // Verify all documents were processed
    expect(processedDocs.length).to.equal(totalDocuments)
    expect(onDocumentStub.callCount).to.equal(totalDocuments)
    expect(crawlResult.nbSuccess).to.equal(totalDocuments)
    expect(crawlResult.nbError).to.equal(0)
    expect(crawlResult.nbTotal).to.equal(totalDocuments)

    // Verify all batches were fetched
    expect(execCallCount).to.equal(4) // 3 batches + 1 empty

    // Verify documents were processed in order
    for (let i = 0; i < totalDocuments; i++) {
      expect(processedDocs[i].index).to.equal(i)
    }
  })

  it('handles partial last batch correctly', async () => {
    const processedDocs: any[] = []
    const onDocumentStub = sandbox.stub().callsFake(doc => {
      processedDocs.push(doc)
      return Promise.resolve()
    })

    const totalDocuments = 137
    const batchSize = 50

    // Create all documents
    const allDocuments: any[] = []
    for (let i = 0; i < totalDocuments; i++) {
      allDocuments.push({ _id: `doc-${i}`, index: i })
    }

    mockModel.countDocuments = sandbox.stub().resolves(totalDocuments)

    let execCallCount = 0
    mockModel.exec = sandbox.stub().callsFake(() => {
      execCallCount++
      const start = (execCallCount - 1) * batchSize
      const end = Math.min(start + batchSize, totalDocuments)

      if (start >= totalDocuments) {
        return Promise.resolve([])
      }

      return Promise.resolve(allDocuments.slice(start, end))
    })

    const crawler = new DBCrawler({
      model: mockModel,
      onDocument: onDocumentStub,
      batchSize: batchSize,
      concurrency: 10,
      skip: 0,
    })

    const crawlResult = await crawler.crawl()

    expect(processedDocs.length).to.equal(totalDocuments)
    expect(crawlResult.nbSuccess).to.equal(totalDocuments)
    expect(crawlResult.nbTotal).to.equal(totalDocuments)

    // Verify correct number of batches: 50 + 50 + 37 + empty
    expect(execCallCount).to.equal(4)
  })

  it('continues processing all batches even with errors when stopOnError is false', async () => {
    const processedDocs: any[] = []
    const failedDocs: any[] = []

    const onDocumentStub = sandbox.stub().callsFake(doc => {
      if (doc.shouldFail) {
        failedDocs.push(doc)
        return Promise.reject(new Error(`Error for doc ${doc._id}`))
      }
      processedDocs.push(doc)
      return Promise.resolve()
    })

    const totalDocuments = 100
    const batchSize = 30

    // Create documents with some that will fail
    const allDocuments: any[] = []
    for (let i = 0; i < totalDocuments; i++) {
      allDocuments.push({
        _id: `doc-${i}`,
        index: i,
        shouldFail: i === 15 || i === 45 || i === 75,
      })
    }

    mockModel.countDocuments = sandbox.stub().resolves(totalDocuments)

    let execCallCount = 0
    mockModel.exec = sandbox.stub().callsFake(() => {
      execCallCount++
      const start = (execCallCount - 1) * batchSize
      const end = Math.min(start + batchSize, totalDocuments)

      if (start >= totalDocuments) {
        return Promise.resolve([])
      }

      return Promise.resolve(allDocuments.slice(start, end))
    })

    const crawler = new DBCrawler({
      model: mockModel,
      onDocument: onDocumentStub,
      batchSize: batchSize,
      concurrency: 5,
      stopOnError: false, // Continue processing despite errors
      skip: 0,
    })

    const crawlResult = await crawler.crawl()

    // All documents should be attempted
    expect(onDocumentStub.callCount).to.equal(totalDocuments)
    expect(processedDocs.length).to.equal(97) // 100 - 3 errors
    expect(failedDocs.length).to.equal(3)
    expect(crawlResult.nbSuccess).to.equal(97)
    expect(crawlResult.nbError).to.equal(3)
    expect(crawlResult.nbTotal).to.equal(totalDocuments)

    // Verify all batches were fetched: 30 + 30 + 30 + 10 + empty
    expect(execCallCount).to.equal(5)
  })

  it('rejects the promise if _fetchNext encounters an error', async () => {
    const mockError = new Error('Fetch error')
    mockModel.exec = sandbox.stub().rejects(mockError)

    const crawler = new DBCrawler({
      model: mockModel,
      onDocument: sandbox.stub().resolves(),
      batchSize: 10,
      concurrency: 1,
    })

    try {
      await crawler.crawl()
      expect.fail('Expected crawl to throw an error')
    } catch (error) {
      expect(error).to.equal(mockError)
    }
  })

  it('throws an error if required options are missing', () => {
    expect(() => new DBCrawler({})).to.throw('Need onDocument method')
    expect(() => new DBCrawler({ onDocument: () => {} })).to.throw('Need model to crawl')
  })

  it('resolves with crawlResult when an error occurs and stopOnError is true', async () => {
    const onDocumentStub = sandbox.stub()
    onDocumentStub.resolves()
    onDocumentStub.onCall(5).rejects(new Error('Simulated error'))

    const crawler = new DBCrawler({
      model: mockModel,
      onDocument: onDocumentStub,
      stopOnError: true,
      batchSize: 2,
      concurrency: 1,
    })

    const simulatedDocuments = new Array(10).fill(null).map((_, index) => ({ _id: index.toString() }))
    mockModel.exec = sandbox.stub().resolves(simulatedDocuments)

    const crawlResult = await crawler.crawl()

    expect(crawlResult.nbError).to.equal(1)
    expect(crawlResult.nbSuccess).to.equal(9)
    expect(crawlResult.nbTotal).to.equal(10)
  })

  it('correctly handles useAggregate = true', async () => {
    const crawler = new DBCrawler({
      model: mockModel,
      onDocument: () => {},
      useAggregate: true,
      aggregate: (skip: number, limit: number) => {
        return [...DBCrawler.aggregatePagination(skip, limit)]
      },
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
      aggregate: () => [],
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
