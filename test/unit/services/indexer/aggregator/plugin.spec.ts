import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorPlugin } from '@services/indexer/aggregator/plugin'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { UtilsIndexer } from '@models/utils/indexer'
import logger from '@logger'
import { IAPlugin, IPluginType, NetworksEnum } from '@types'
import Logger from '@logger'
import dayjs from '@helpers/dayjs'

describe('Indexer:Aggregator:Plugin', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('should start the AggregatorPlugin', async () => {
    const findByTypeStub = sandbox.stub(Models.Aggregator, 'findByType')
    const stubLogger = sandbox.stub(logger, 'verbose')
    const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')
    const saveAggregationSyncStub = sandbox.stub(UtilsIndexer, 'saveAggregationSync')

    await AggregatorPlugin.start()

    expect(stubLogger.calledWith('End AggregatorPlugin' as any)).to.be.true
    expect(findByTypeStub.calledOnce).to.be.true
    expect(crawlerStub.calledOnce).to.be.true
    expect(saveAggregationSyncStub.calledOnce).to.be.true
  })

  it('should call onDocument', async () => {
    const document: IAPlugin = {
      transactionHash: '0x0',
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      type: IPluginType.install,
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5333',
      implementationAddress: '0x123',
      daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      tokenAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      pluginSetupRepoAddress: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1968',
      build: '1',
      release: '1',
      subdomain: 'dao.eth',
      sender: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1900',
    }

    const stubLogger = sandbox.spy(Logger, 'verbose')

    await AggregatorPlugin.onDocument(document as any)

    expect(stubLogger.calledOnce).to.be.true

    const member = await Models.Plugin.findExistingLog(document.transactionHash, document.type, document.network)
    expect(member.transactionHash).to.equal(document.transactionHash)
    expect(member.blockNumber).to.equal(document.blockNumber)
    expect(member.network).to.equal(document.network)
    expect(member.type).to.equal(document.type)
    expect(member.address).to.equal(document.address)
    expect(member.implementationAddress).to.equal(document.implementationAddress)
    expect(member.daoAddress).to.equal(document.daoAddress)
    expect(member.tokenAddress).to.equal(document.tokenAddress)
    expect(member.pluginSetupRepoAddress).to.equal(document.pluginSetupRepoAddress)
    expect(member.build).to.equal(document.build)
    expect(member.release).to.equal(document.release)
    expect(member.subdomain).to.equal(document.subdomain)
    expect(member.sender).to.equal(document.sender)
  })

  it('should use default date when none is provided', () => {
    const defaultDate = dayjs.utc('1970-01-01T00:00:00Z').toDate()
    const pipeline = AggregatorPlugin.query(defaultDate)
    expect(pipeline[0].$match?.createdAt?.['$gte']).to.deep.equal(defaultDate)
  })
})
