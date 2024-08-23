import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorDao } from '@services/aragon-indexer/aggregator/dao'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import Logger from '@logger'
import { DaoList } from '@test/mock/fakeDao'
import Web3Helper from '@helpers/web3'
import { NetworksEnum } from '@types'
import LogDaoMetadata from '@models/schema/logDaoMetadata'

describe('Indexer:AggregatorDao', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('updateDaoMetadata', async () => {
    it('should updateDaoMetadata', async () => {
      const document = { ...DaoList[1] }
      await Models.Dao.create(document as any)

      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')

      const rawLogDaoMetadata: Partial<LogDaoMetadata> = {
        transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        blockNumber: 3,
        network: NetworksEnum.ethereumMainnet,
        fetchedMetadata: true,
        daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        trustedForwarder: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        daoURI: 'test',
        ens: 'fake-ens.eth',
        metadataUri: 'fake-uri',
        name: 'fake-name',
        description: 'fake-description',
        avatar: 'fake-avatar',
        links: [],
      }

      await AggregatorDao.updateDaoMetadata(rawLogDaoMetadata)

      expect(stubLogger.calledOnceWith('Update Dao Metadata' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })
})
