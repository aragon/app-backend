import { expect } from 'chai'
import sinon from 'sinon'
import { NetworksEnum } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import ProxyUtils from '@modules/proxyProvider/utils'

describe('ProxyUtils', () => {
  let sandbox: sinon.SinonSandbox
  let loggerStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerStub = sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getProgressFromConfigIndexer', () => {
    it('should return ConfigIndexer data when a record exists', async () => {
      const network = NetworksEnum.ethereumMainnet
      const syncKey = 'test-sync-key'
      const mockConfigData = { lastSync: 5, end: false }

      const findExistingLogStub = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(mockConfigData)

      const result = await ProxyUtils.getProgressFromConfigIndexer(network, syncKey as any)

      expect(findExistingLogStub.calledOnceWith({ network, service: syncKey })).to.be.true
      expect(result).to.deep.equal(mockConfigData)
    })

    it('should return null when no record exists', async () => {
      const network = NetworksEnum.ethereumMainnet
      const syncKey = 'test-sync-key'

      const findExistingLogStub = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(null)

      const result = await ProxyUtils.getProgressFromConfigIndexer(network, syncKey as any)

      expect(findExistingLogStub.calledOnceWith({ network, service: syncKey })).to.be.true
      expect(result).to.be.null
    })
  })

  describe('updateProgressInConfigIndexer', () => {
    it('should update existing ConfigIndexer record when it exists', async () => {
      const network = NetworksEnum.ethereumMainnet
      const syncKey = 'test-sync-key'
      const lastPage = 10
      const hasMore = true

      const mockExistingRecord = {
        update: sandbox.stub().resolves(),
      }

      const findExistingLogStub = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(mockExistingRecord)
      const createStub = sandbox.stub(Models.ConfigIndexer, 'create')

      await ProxyUtils.updateProgressInConfigIndexer(network, syncKey as any, lastPage, hasMore)

      expect(findExistingLogStub.calledOnceWith({ network, service: syncKey })).to.be.true
      expect(mockExistingRecord.update.calledOnce).to.be.true
      expect(mockExistingRecord.update.calledWith({ lastSync: lastPage, end: hasMore })).to.be.true
      expect(createStub.notCalled).to.be.true
    })

    it('should create new ConfigIndexer record when none exists', async () => {
      const network = NetworksEnum.ethereumMainnet
      const syncKey = 'test-sync-key'
      const lastPage = 10
      const hasMore = true

      const findExistingLogStub = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(null)
      const createStub = sandbox.stub(Models.ConfigIndexer, 'create').resolves()

      await ProxyUtils.updateProgressInConfigIndexer(network, syncKey as any, lastPage, hasMore)

      expect(findExistingLogStub.calledOnceWith({ network, service: syncKey })).to.be.true
      expect(createStub.calledOnce).to.be.true
      expect(
        createStub.calledWith({
          network,
          service: syncKey,
          lastSync: lastPage,
          end: hasMore,
        }),
      ).to.be.true
    })
  })
})
