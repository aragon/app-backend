import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DBCrawler from '@models/utils/crawler'

describe('Model/Utils: crawler', () => {
  let sandbox: SinonSandbox
  let mockModel: any = null

  beforeEach(async () => {
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

  it('processes documents successfully', async function () {
    const onDocumentStub = sandbox.stub().resolves()
    const crawler = new DBCrawler({
      model: mockModel,
      onDocument: onDocumentStub,
      batchSize: 2,
      concurrency: 1,
    })

    const simulatedDocuments = new Array(10)
      .fill(null)
      .map((_, index) => ({ _id: index.toString() }))
    mockModel.exec.onFirstCall().resolves(simulatedDocuments)
    mockModel.exec.onSecondCall().resolves([])

    await crawler.crawl()

    expect(onDocumentStub.callCount).to.equal(10)
  })

  it('throws an error if required options are missing', function () {
    expect(() => new DBCrawler({})).to.throw('Need onDocument method')
    expect(() => new DBCrawler({ onDocument: () => {} })).to.throw(
      'Need model to crawl',
    )
  })
})
