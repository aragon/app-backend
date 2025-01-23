import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { Models } from '@dbModels'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { CustomInstall } from '@indexer/customInstall'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import config from '@config'
import { NetworksEnum } from '@types'

describe('AragonIndexer: CustomInstall', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('install', () => {
    it('should log and return if CUSTOM_INSTALL is disabled', async () => {
      sandbox.stub(config, 'CUSTOM_INSTALL').value(false)
      const loggerStub = sandbox.stub(logger, 'info')

      await CustomInstall.install()

      expect(loggerStub.calledOnceWith('Custom install is disabled' as any)).to.be.true
    })

    it('should skip DAO installation if DAO already exists', async () => {
      sandbox.stub(config, 'CUSTOM_INSTALL').value(true)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({} as any)
      const daoRegisteredStub = sandbox.stub(DaoRegistryHandler, 'daoRegistered')

      await CustomInstall.install()

      expect(daoRegisteredStub.notCalled).to.be.true
    })

    it('should register a new DAO and process plugins if DAO does not exist', async () => {
      sandbox.stub(config, 'CUSTOM_INSTALL').value(true)
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const daoRegisteredStub = sandbox.stub(DaoRegistryHandler, 'daoRegistered').resolves()
      sandbox.stub(Models.ConfigIndexer, 'findOne').resolves({ lastSync: 21000000 } as any)
      const pluginEventsStub = sandbox.stub(CustomInstall, 'pluginEvents').resolves()

      await CustomInstall.install()

      expect(daoRegisteredStub.calledOnce).to.be.true
      expect(pluginEventsStub.calledOnce).to.be.true
    })

    it('should not process plugins if `lastSync` is less than `blockNumber`', async () => {
      sandbox.stub(config, 'CUSTOM_INSTALL').value(true)
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const daoRegisteredStub = sandbox.stub(DaoRegistryHandler, 'daoRegistered').resolves()
      sandbox.stub(Models.ConfigIndexer, 'findOne').resolves({ lastSync: 16000000 } as any)
      const pluginEventsStub = sandbox.stub(CustomInstall, 'pluginEvents')

      await CustomInstall.install()

      expect(daoRegisteredStub.calledOnce).to.be.true
      expect(pluginEventsStub.notCalled).to.be.true
    })
  })

  describe('pluginEvents', () => {
    it('should create a BlockchainLogCrawler and crawl logs', async () => {
      const dao = {
        network: NetworksEnum.ethereumMainnet,
        pluginSetupProcessor: { blockNumber: 16721862 },
        address: '0x55da37AF02c4e7e0Ce01964A68692f7e32575eFA',
      }
      const crawlerStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const loggerStub = sandbox.stub(logger, 'error')

      await CustomInstall.pluginEvents(dao)

      expect(crawlerStub.calledOnce).to.be.true
      expect(loggerStub.notCalled).to.be.true
    })

    it('should fails format address', async () => {
      const dao = {
        network: NetworksEnum.ethereumMainnet,
        pluginSetupProcessor: { blockNumber: 16721862 },
        address: '0x0',
      }
      const crawlerStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const loggerStub = sandbox.stub(logger, 'error')

      await CustomInstall.pluginEvents(dao)

      expect(crawlerStub.notCalled).to.be.true
      expect(loggerStub.calledOnceWith('Error pluginEvents' as any)).to.be.true
    })
  })
})
