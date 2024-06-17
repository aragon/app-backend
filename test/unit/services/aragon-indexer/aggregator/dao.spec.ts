import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorDao } from '@services/aragon-indexer/aggregator/dao'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import Logger from '@logger'
import { DaoList } from '@test/mock/fakeDao'
import Web3Helper from '@helpers/web3'

describe('Indexer:Aggregator:Dao', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the AggregatorDao', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')

      await AggregatorDao.start()

      expect(stubLogger.calledWith('End AggregatorDao' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the AggregatorDao', async () => {
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await AggregatorDao.start()

      expect(stubLogger.calledWith('End AggregatorDao' as any)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  describe('onDocument', () => {
    it('should call onDocument', async () => {
      const document = { ...DaoList[1] }

      const stubLogger = sandbox.stub(Logger, 'verbose')
      const stubSubdomain = sandbox.stub(Web3Helper, 'subdomainExists').resolves(true)
      const stubBlock = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(100)

      await AggregatorDao.onDocument(document as any)

      expect(stubLogger.calledWith('New Aggregate Dao' as any)).to.be.true

      const dao = await Models.Dao.findExistingLog(document.address, document.network)

      expect(stubSubdomain.calledOnce).to.be.true
      expect(stubBlock.calledOnceWith(document.blockNumber, document.network)).to.be.true

      expect(dao.id).to.exist
      expect(dao.entityId).to.exist
      expect(dao.network).to.equal(document.network)
      expect(dao.transactionHash).to.equal(document.transactionHash)
      expect(dao.blockNumber).to.equal(document.blockNumber)
      expect(dao.blockTimestamp).to.equal(100)
      expect(dao.permalink).to.eq(`${document.network}-${document.ens || document.address}`)
      expect(dao.address).to.equal(document.address)
      expect(dao.implementationAddress).to.equal(document.implementationAddress)
      expect(dao.creatorAddress).to.eq(document.creatorAddress)
      expect(dao.ens).to.eq(document.ens)
      expect(dao.members).to.eq(document.members)
      expect(dao.metadataIpfs).to.eq(document.metadataIpfs)
      expect(dao.name).to.eq(document.name)
      expect(dao.description).to.eq(document.description)
      expect(dao.avatar).to.eq(document.avatar)
      expect(dao.links[0].name).to.eq(document.links?.[0].name)
      expect(dao.links[0].url).to.eq(document.links?.[0].url)
      expect(dao.proposalsCreated).to.eq(document.proposalsCreated)
      expect(dao.proposalsExecuted).to.eq(document.proposalsExecuted)
      expect(dao.tvlUSD).to.eq(document.tvlUSD)
      expect(dao.uniqueVoters).to.eq(document.uniqueVoters)
      expect(dao.votes).to.eq(document.votes)
      expect(dao.plugins.length).to.eq(1)
      expect(dao.plugins[0].transactionHash).to.eq(document.plugins![0].transactionHash)
      expect(dao.plugins[0].blockNumber).to.eq(document.plugins![0].blockNumber)
      expect(dao.plugins[0].subdomain).to.eq(document.plugins![0].subdomain)
      expect(dao.plugins[0].tokenAddress).to.eq(document.plugins![0].tokenAddress)
      expect(dao.plugins[0].address).to.eq(document.plugins![0].address)
      expect(dao.plugins[0].implementationAddress).to.eq(document.plugins![0].implementationAddress)
      expect(dao.plugins[0].release).to.eq(document.plugins![0].release)
      expect(dao.plugins[0].build).to.eq(document.plugins![0].build)
      expect(dao.hideDao).to.eq(document.hideDao)
    })

    it('should call onDocument update', async () => {
      const document = { ...DaoList[1] }

      await Models.Dao.create(document)

      const stubLogger = sandbox.stub(Logger, 'verbose')
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(100)

      document.implementationAddress = '0x0000'
      await AggregatorDao.onDocument(document as any)

      expect(stubLogger.calledWith('Update Aggregate Dao' as any)).to.be.true

      const dao = await Models.Dao.findExistingLog(document.address, document.network)
      expect(dao.id).to.exist
      expect(dao.entityId).to.exist
      expect(dao.network).to.equal(document.network)
      expect(dao.transactionHash).to.equal(document.transactionHash)
      expect(dao.blockNumber).to.equal(document.blockNumber)
      expect(dao.permalink).to.eq(`${document.network}-${document.ens || document.address}`)
      expect(dao.address).to.equal(document.address)
      expect(dao.implementationAddress).to.equal(document.implementationAddress)
      expect(dao.creatorAddress).to.eq(document.creatorAddress)
      expect(dao.ens).to.eq(document.ens)
      expect(dao.members).to.eq(document.members)
      expect(dao.metadataIpfs).to.eq(document.metadataIpfs)
      expect(dao.name).to.eq(document.name)
      expect(dao.description).to.eq(document.description)
      expect(dao.avatar).to.eq(document.avatar)
      expect(dao.links[0].name).to.eq(document.links?.[0].name)
      expect(dao.links[0].url).to.eq(document.links?.[0].url)
      expect(dao.proposalsCreated).to.eq(document.proposalsCreated)
      expect(dao.proposalsExecuted).to.eq(document.proposalsExecuted)
      expect(dao.tvlUSD).to.eq(document.tvlUSD)
      expect(dao.uniqueVoters).to.eq(document.uniqueVoters)
      expect(dao.votes).to.eq(document.votes)
      expect(dao.plugins.length).to.eq(1)
      expect(dao.plugins[0].transactionHash).to.eq(document.plugins![0].transactionHash)
      expect(dao.plugins[0].blockNumber).to.eq(document.plugins![0].blockNumber)
      expect(dao.plugins[0].subdomain).to.eq(document.plugins![0].subdomain)
      expect(dao.plugins[0].address).to.eq(document.plugins![0].address)
      expect(dao.plugins[0].implementationAddress).to.eq(document.plugins![0].implementationAddress)
      expect(dao.plugins[0].tokenAddress).to.eq(document.plugins![0].tokenAddress)
      expect(dao.plugins[0].pluginSetupRepoAddress).to.eq(document.plugins![0].pluginSetupRepoAddress)
      expect(dao.plugins[0].release).to.eq(document.plugins![0].release)
      expect(dao.plugins[0].build).to.eq(document.plugins![0].build)
      expect(dao.hideDao).to.eq(document.hideDao)
    })
  })

  it('should query', () => {
    const pipeline = AggregatorDao.query()
    expect(pipeline.length).to.eq(17)
  })
})
