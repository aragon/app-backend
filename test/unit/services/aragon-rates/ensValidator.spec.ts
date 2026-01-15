import { Models } from '@dbModels'
import EnsHelper from '@helpers/ens'
import logger from '@logger'
import DBCrawler from '@models/utils/crawler'
import { EnsValidator } from '@services/aragon-rates/handlers/ensValidator'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonRates: EnsValidator', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should start the EnsValidator and crawl members', async () => {
      const stubLoggerInfo = sandbox.stub(logger, 'info')
      const stubOnDocument = sandbox.stub(EnsValidator, 'onDocument')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onDocument({ address: '0x123', ens: 'test.eth' })
      })

      await EnsValidator.start()

      expect(stubLoggerInfo.calledWith('Start EnsValidator' as any)).to.be.true
      expect(stubLoggerInfo.calledWith('EnsValidator completed' as any)).to.be.true
      expect(stubOnDocument.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should handle errors during crawl', async () => {
      const stubLoggerError = sandbox.stub(logger, 'error')
      const stubLoggerInfo = sandbox.stub(logger, 'info')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(new Error('Test error'), { address: '0x123' })
      })

      await EnsValidator.start()

      expect(stubLoggerInfo.calledWith('EnsValidator completed' as any)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  describe('onDocument', () => {
    it('should not update when ENS is unchanged', async () => {
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('same.eth' as any)
      const updateStub = sandbox.stub(Models.Member, 'updateOne').resolves()

      await EnsValidator.onDocument({ address: '0x123', ens: 'same.eth' })

      expect(updateStub.called).to.be.false
    })

    it('should update ENS when changed to new name', async () => {
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('newname.eth' as any)
      const updateStub = sandbox.stub(Models.Member, 'updateOne').resolves()
      sandbox.stub(logger, 'info')

      await EnsValidator.onDocument({ address: '0x123', ens: 'oldname.eth' })

      expect(updateStub.calledOnce).to.be.true
      expect(updateStub.calledWith({ address: '0x123' }, { $set: { ens: 'newname.eth' } })).to.be.true
    })

    it('should clear ENS when expired/removed (returns null)', async () => {
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves(null)
      const updateStub = sandbox.stub(Models.Member, 'updateOne').resolves()
      sandbox.stub(logger, 'info')

      await EnsValidator.onDocument({ address: '0x123', ens: 'expired.eth' })

      expect(updateStub.calledOnce).to.be.true
      expect(updateStub.calledWith({ address: '0x123' }, { $set: { ens: null } })).to.be.true
    })

    it('should clear ENS when expired/removed (returns undefined)', async () => {
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves(undefined as any)
      const updateStub = sandbox.stub(Models.Member, 'updateOne').resolves()
      sandbox.stub(logger, 'info')

      await EnsValidator.onDocument({ address: '0x456', ens: 'removed.eth' })

      expect(updateStub.calledOnce).to.be.true
      expect(updateStub.calledWith({ address: '0x456' }, { $set: { ens: null } })).to.be.true
    })
  })
})
