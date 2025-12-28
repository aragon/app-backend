import logger from '@logger'
import DBCrawler from '@models/utils/crawler'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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
    expect(
      () =>
        new DBCrawler({
          onDocument: () => {},
        }),
    ).to.throw('Need model to crawl')
  })

  it('resolves with crawlResult when an error occurs and stopOnError is true', async () => {
    let processOrder: string[] = []
    let errorCaught = false
    let errorMessage = ''

    const onDocumentStub = sandbox.stub().callsFake(async doc => {
      processOrder.push(`start-${doc._id}`)

      // Add small delay to make processing more predictable
      await new Promise(resolve => setTimeout(resolve, 10))

      // Simulate error on document with _id '1'
      if (doc._id === '1') {
        processOrder.push(`error-${doc._id}`)
        throw new Error('Simulated error')
      }

      processOrder.push(`success-${doc._id}`)
      return Promise.resolve()
    })

    const onErrorStub = sandbox.stub().callsFake((error, doc) => {
      console.log(`onError called for document ${doc._id}: ${error.message}`)
      if (doc._id === '1') {
        errorCaught = true
        errorMessage = error.message
      }
    })

    const crawler = new DBCrawler({
      model: mockModel,
      onDocument: onDocumentStub,
      onError: onErrorStub, // Add custom error handler
      stopOnError: true,
      batchSize: 10, // Large batch to get all documents at once
      concurrency: 1, // Single worker to ensure order
    })

    // Create fewer documents to make test more predictable
    const simulatedDocuments = [
      { _id: '0' },
      { _id: '1' }, // This will error
      { _id: '2' },
      { _id: '3' },
    ]

    let execCallCount = 0
    mockModel.exec = sandbox.stub().callsFake(() => {
      execCallCount++

      if (execCallCount === 1) {
        return Promise.resolve(simulatedDocuments)
      } else {
        return Promise.resolve([])
      }
    })

    // Don't forget to stub countDocuments
    mockModel.countDocuments = sandbox.stub().returns(Promise.resolve(4))

    const crawlResult = await crawler.crawl()

    console.log('Process order:', processOrder)
    console.log('Crawl result:', crawlResult)
    console.log('Error caught:', errorCaught)
    console.log('Error message:', errorMessage)

    // Verify error was caught by our custom handler
    expect(errorCaught).to.be.true
    expect(errorMessage).to.equal('Simulated error')
    expect(onErrorStub.calledOnce).to.be.true

    // Verify crawl results
    expect(crawlResult.nbError).to.equal(1)
    expect(crawlResult.nbTotal).to.equal(4)
    expect(crawlResult.nbSuccess).to.equal(1) // Only document '0' succeeded

    // Verify process order
    expect(processOrder).to.include('start-0')
    expect(processOrder).to.include('success-0')
    expect(processOrder).to.include('start-1')
    expect(processOrder).to.include('error-1')

    // With stopOnError=true and concurrency=1, documents after the error should NOT be processed
    expect(onDocumentStub.callCount).to.equal(2) // Only docs 0 and 1

    // Documents 2 and 3 should NOT have been processed
    expect(processOrder).to.not.include('start-2')
    expect(processOrder).to.not.include('start-3')

    // Additional verification
    expect(processOrder.length).to.equal(4) // start-0, success-0, start-1, error-1
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

    // Create a mock document with an _id
    const mockDocument = {
      _id: {
        toString: () => 'test-id-123',
      },
      createdAt: new Date(),
    }

    // Set a mock resolve function to prevent the error
    crawler['crawlResolve'] = sandbox.stub()

    // Call _worker
    await crawler._worker(mockDocument)

    // Wait for setImmediate to execute
    await new Promise(resolve => setImmediate(resolve))

    expect(onErrorStub.calledOnce).to.be.true
    expect(onErrorStub.calledWith(mockError, mockDocument)).to.be.true
    expect(crawler['crawlResult'].nbError).to.eq(1)
    expect(crawler['crawlResult'].nbSuccess).to.eq(0)
    expect(crawler['isOnError']).to.be.true
    expect(crawler['crawling']).to.be.false
    expect(crawler['isCompleted']).to.be.true
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

  describe('Infinite Loop Prevention Tests', () => {
    it('prevents infinite loop when database returns same documents repeatedly', async () => {
      const processedDocs: any[] = []
      const onDocumentStub = sandbox.stub().callsFake(doc => {
        processedDocs.push(doc)
        return Promise.resolve()
      })

      const totalDocuments = 5
      const sameDocuments = [
        { _id: 'doc-1', index: 1 },
        { _id: 'doc-2', index: 2 },
        { _id: 'doc-3', index: 3 },
        { _id: 'doc-4', index: 4 },
        { _id: 'doc-5', index: 5 },
      ]

      mockModel.countDocuments = sandbox.stub().resolves(totalDocuments)

      // Simulate the bug: database keeps returning the same documents
      let execCallCount = 0
      mockModel.exec = sandbox.stub().callsFake(() => {
        execCallCount++
        console.log(`Exec call ${execCallCount}`)

        // First few calls return the same documents (simulating the bug)
        if (execCallCount <= 10) {
          return Promise.resolve(sameDocuments)
        }
        // Eventually return empty (this shouldn't be reached with the fix)
        return Promise.resolve([])
      })

      const crawler = new DBCrawler({
        model: mockModel,
        onDocument: onDocumentStub,
        batchSize: 10,
        concurrency: 2,
        skip: 0,
      })

      const crawlResult = await crawler.crawl()

      // Should process each document exactly once, despite DB returning duplicates
      expect(processedDocs.length).to.equal(totalDocuments)
      expect(onDocumentStub.callCount).to.equal(totalDocuments)
      expect(crawlResult.nbSuccess).to.equal(totalDocuments)
      expect(crawlResult.nbError).to.equal(0)
      expect(crawlResult.nbTotal).to.equal(totalDocuments)

      // Verify no duplicates were processed
      const processedIds = processedDocs.map(doc => doc._id)
      const uniqueIds = [...new Set(processedIds)]
      expect(uniqueIds.length).to.equal(totalDocuments)

      // Should have called exec multiple times but stopped when no new docs found
      expect(execCallCount).to.be.greaterThan(1)
      expect(execCallCount).to.be.lessThan(10) // Should terminate before hitting our limit
    })

    it('properly excludes processed IDs from subsequent queries', async () => {
      const processedDocs: any[] = []
      const onDocumentStub = sandbox.stub().callsFake(doc => {
        processedDocs.push(doc)
        return Promise.resolve()
      })

      const allDocuments = [
        { _id: 'doc-1', index: 1 },
        { _id: 'doc-2', index: 2 },
        { _id: 'doc-3', index: 3 },
        { _id: 'doc-4', index: 4 },
        { _id: 'doc-5', index: 5 },
      ]

      mockModel.countDocuments = sandbox.stub().resolves(5)

      let execCallCount = 0
      const queryConditions: any[] = []

      // Capture the where conditions to verify ID exclusion
      mockModel.find = sandbox.stub().callsFake(where => {
        queryConditions.push(where)
        return mockModel
      })

      mockModel.exec = sandbox.stub().callsFake(() => {
        execCallCount++

        // Get the current where condition
        const currentWhere = queryConditions[queryConditions.length - 1] || {}
        const excludedIds = currentWhere._id?.$nin || []

        // Return documents not in the excluded list
        const availableDocs = allDocuments.filter(doc => !excludedIds.includes(doc._id))

        if (execCallCount === 1) {
          // First batch: return first 2 documents
          return Promise.resolve(availableDocs.slice(0, 2))
        } else if (execCallCount === 2) {
          // Second batch: should exclude the first 2, return next 2
          return Promise.resolve(availableDocs.slice(0, 2))
        } else if (execCallCount === 3) {
          // Third batch: should exclude first 4, return last 1
          return Promise.resolve(availableDocs.slice(0, 1))
        } else {
          // No more documents
          return Promise.resolve([])
        }
      })

      const crawler = new DBCrawler({
        model: mockModel,
        onDocument: onDocumentStub,
        batchSize: 2,
        concurrency: 1,
        skip: 0,
      })

      const crawlResult = await crawler.crawl()

      // Verify all documents were processed exactly once
      expect(processedDocs.length).to.equal(5)
      expect(crawlResult.nbSuccess).to.equal(5)

      // Verify that exclusion was applied in subsequent queries
      expect(queryConditions.length).to.be.greaterThan(1)

      // Second query should exclude first processed IDs
      const secondQuery = queryConditions[1]
      expect(secondQuery._id).to.exist
      expect(secondQuery._id.$nin).to.be.an('array')
      expect(secondQuery._id.$nin.length).to.equal(2) // First 2 IDs excluded

      // Third query should exclude more IDs
      const thirdQuery = queryConditions[2]
      expect(thirdQuery._id.$nin.length).to.equal(4) // First 4 IDs excluded
    })

    it('handles aggregation pipeline with ID exclusion', async () => {
      const processedDocs: any[] = []
      const onDocumentStub = sandbox.stub().callsFake(doc => {
        processedDocs.push(doc)
        return Promise.resolve()
      })

      const allDocuments = [
        { _id: 'doc-1', index: 1 },
        { _id: 'doc-2', index: 2 },
        { _id: 'doc-3', index: 3 },
      ]

      const aggregatePipelines: any[] = []

      mockModel.aggregate = sandbox.stub().callsFake(pipeline => {
        aggregatePipelines.push([...pipeline]) // Clone the pipeline
        return mockModel
      })

      let crawlExecCallCount = 0
      let countExecCallCount = 0

      mockModel.exec = sandbox.stub().callsFake(() => {
        const currentPipeline = aggregatePipelines[aggregatePipelines.length - 1]

        // Check if this is a count aggregation
        const isCountQuery = currentPipeline.some((stage: any) => stage.$count)

        if (isCountQuery) {
          countExecCallCount++
          return Promise.resolve([{ totalRecords: 3 }])
        }

        // This is a data query
        crawlExecCallCount++

        // Check if there's an exclusion match stage
        const matchStage = currentPipeline.find((stage: any) => stage.$match)
        const excludedIds = matchStage?.$match?._id?.$nin || []

        // Return documents not in the excluded list
        const availableDocs = allDocuments.filter(doc => !excludedIds.includes(doc._id))

        if (crawlExecCallCount === 1) {
          // First batch: return first 2 documents
          return Promise.resolve(availableDocs.slice(0, 2))
        } else if (crawlExecCallCount === 2) {
          // Second batch: should have exclusion, return remaining documents
          return Promise.resolve(availableDocs.slice(0, 1))
        } else {
          // No more documents
          return Promise.resolve([])
        }
      })

      const crawler = new DBCrawler({
        model: mockModel,
        onDocument: onDocumentStub,
        useAggregate: true,
        aggregate: (skip: number | undefined, limit: number | undefined) => {
          return [...DBCrawler.aggregatePagination(skip, limit)]
        },
        batchSize: 2,
        concurrency: 1,
      })

      const crawlResult = await crawler.crawl()

      expect(processedDocs.length).to.equal(3)
      expect(crawlResult.nbSuccess).to.equal(3)

      // Verify we had both count and data queries
      expect(countExecCallCount).to.equal(1)
      expect(crawlExecCallCount).to.be.greaterThan(1)

      // Verify exclusion was added to aggregation pipeline
      expect(aggregatePipelines.length).to.be.greaterThan(2)

      // Find data pipelines (non-count)
      const dataPipelines = aggregatePipelines.filter(p => !p.some((stage: any) => stage.$count))
      expect(dataPipelines.length).to.be.greaterThan(1)

      // Check if any data pipeline has exclusion (should be the second one)
      const pipelinesWithExclusion = dataPipelines.filter(p => {
        const matchStage = p.find((stage: any) => stage.$match && stage.$match._id && stage.$match._id.$nin)
        return matchStage !== undefined
      })

      expect(pipelinesWithExclusion.length).to.be.greaterThan(0)

      // Verify the exclusion contains processed IDs
      const exclusionPipeline = pipelinesWithExclusion[0]
      const matchStage = exclusionPipeline.find((stage: any) => stage.$match)
      expect(matchStage.$match._id.$nin).to.be.an('array')
      expect(matchStage.$match._id.$nin.length).to.be.greaterThan(0)
    })

    it('terminates after consecutive empty batches even with processing errors', async () => {
      const processedDocs: any[] = []
      let errorCount = 0

      const onDocumentStub = sandbox.stub().callsFake(doc => {
        if (doc._id === 'doc-2') {
          errorCount++
          throw new Error('Processing error')
        }
        processedDocs.push(doc)
        return Promise.resolve()
      })

      const documents = [
        { _id: 'doc-1', index: 1 },
        { _id: 'doc-2', index: 2 }, // This will cause an error
        { _id: 'doc-3', index: 3 },
      ]

      mockModel.countDocuments = sandbox.stub().resolves(3)

      let execCallCount = 0
      mockModel.exec = sandbox.stub().callsFake(() => {
        execCallCount++

        if (execCallCount === 1) {
          return Promise.resolve(documents)
        } else {
          // Simulate no more documents after processing
          return Promise.resolve([])
        }
      })

      const crawler = new DBCrawler({
        model: mockModel,
        onDocument: onDocumentStub,
        batchSize: 10,
        concurrency: 1,
        stopOnError: false, // Continue despite errors
      })

      const crawlResult = await crawler.crawl()

      // Should process all documents (2 success, 1 error)
      expect(processedDocs.length).to.equal(2)
      expect(errorCount).to.equal(1)
      expect(crawlResult.nbSuccess).to.equal(2)
      expect(crawlResult.nbError).to.equal(1)
      expect(crawlResult.nbTotal).to.equal(3)

      // Should terminate properly after empty batches
      expect(execCallCount).to.be.lessThan(10) // Should not loop indefinitely
    })

    it('handles edge case where processed count exceeds initial total', async () => {
      const processedDocs: any[] = []
      const onDocumentStub = sandbox.stub().callsFake(doc => {
        processedDocs.push(doc)
        return Promise.resolve()
      })

      // Initial count returns 3, but actually there are 5 documents
      // This can happen if documents are added during crawling
      mockModel.countDocuments = sandbox.stub().resolves(3)

      const allDocuments = [
        { _id: 'doc-1', index: 1 },
        { _id: 'doc-2', index: 2 },
        { _id: 'doc-3', index: 3 },
        { _id: 'doc-4', index: 4 },
        { _id: 'doc-5', index: 5 },
      ]

      let execCallCount = 0
      mockModel.exec = sandbox.stub().callsFake(() => {
        execCallCount++

        if (execCallCount === 1) {
          return Promise.resolve(allDocuments.slice(0, 3))
        } else if (execCallCount === 2) {
          return Promise.resolve(allDocuments.slice(3, 5))
        } else {
          return Promise.resolve([])
        }
      })

      const crawler = new DBCrawler({
        model: mockModel,
        onDocument: onDocumentStub,
        batchSize: 3,
        concurrency: 1,
      })

      const crawlResult = await crawler.crawl()

      // Should process all 5 documents even though initial count was 3
      expect(processedDocs.length).to.equal(5)
      expect(crawlResult.nbSuccess).to.equal(5)
      expect(crawlResult.nbTotal).to.equal(3) // Original count

      // Should handle the case gracefully
      expect(execCallCount).to.equal(3) // Two data batches + one empty
    })
  })
})
