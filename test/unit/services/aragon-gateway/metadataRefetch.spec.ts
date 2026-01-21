import config from '@config'
import { Models } from '@dbModels'
import MetadataRefetchHelper from '@helpers/metadataRefetch'
import logger from '@logger'
import IPFSModule from '@modules/ipfs'
import { MetadataRefetchProcessor } from '@services/aragon-gateway/metadataRefetch'
import { MetadataEntityType, MetadataRefetchStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Services: aragon-gateway/MetadataRefetch', () => {
  let sandbox: SinonSandbox
  let loggerInfoStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub
  let loggerWarnStub: sinon.SinonStub
  let loggerVerboseStub: sinon.SinonStub
  let fetchMetadataStub: sinon.SinonStub
  let findByEntityIdStub: sinon.SinonStub
  let applyRefetchedMetadataStub: sinon.SinonStub
  let originalMaxRetry: number

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerInfoStub = sandbox.stub(logger, 'info')
    loggerErrorStub = sandbox.stub(logger, 'error')
    loggerWarnStub = sandbox.stub(logger, 'warn')
    loggerVerboseStub = sandbox.stub(logger, 'verbose')
    fetchMetadataStub = sandbox.stub(IPFSModule, 'fetchMetadata')
    findByEntityIdStub = sandbox.stub(Models.MetadataRefetch, 'findByEntityId')
    applyRefetchedMetadataStub = sandbox.stub(MetadataRefetchHelper, 'applyRefetchedMetadata')

    // Store original config and set test value
    originalMaxRetry = config.IPFS.METADATA_REFETCH_MAX_RETRY
    config.IPFS.METADATA_REFETCH_MAX_RETRY = 2
  })

  afterEach(() => {
    sandbox.restore()
    // Restore original config
    config.IPFS.METADATA_REFETCH_MAX_RETRY = originalMaxRetry
  })

  describe('processRefetch', () => {
    const baseParams = {
      id: 'test-record-id',
      metadataUri: 'ipfs://QmTest1234567890123456789012345678901234567890',
      entityType: MetadataEntityType.Dao,
      entityId: '0x1111111111111111111111111111111111111111',
      network: NetworksEnum.ethereumMainnet,
    }

    it('Should return false when record not found', async () => {
      findByEntityIdStub.resolves(null)

      const result = await MetadataRefetchProcessor.processRefetch(baseParams)

      expect(result).to.be.false
      expect(findByEntityIdStub.calledOnceWith(baseParams.id)).to.be.true
      expect(loggerWarnStub.calledWith('MetadataRefetch record not found')).to.be.true
      expect(fetchMetadataStub.called).to.be.false
    })

    it('Should return true when record is already completed', async () => {
      const mockRecord = {
        id: baseParams.id,
        status: MetadataRefetchStatus.completed,
      }
      findByEntityIdStub.resolves(mockRecord)

      const result = await MetadataRefetchProcessor.processRefetch(baseParams)

      expect(result).to.be.true
      expect(loggerVerboseStub.calledWith('MetadataRefetch record already processed')).to.be.true
      expect(fetchMetadataStub.called).to.be.false
    })

    it('Should return true when record is already discarded', async () => {
      const mockRecord = {
        id: baseParams.id,
        status: MetadataRefetchStatus.discarded,
      }
      findByEntityIdStub.resolves(mockRecord)

      const result = await MetadataRefetchProcessor.processRefetch(baseParams)

      expect(result).to.be.true
      expect(fetchMetadataStub.called).to.be.false
    })

    it('Should mark attempt before fetching', async () => {
      const mockMarkAttempt = sandbox.stub().resolves()
      const mockRecord = {
        id: baseParams.id,
        status: MetadataRefetchStatus.pending,
        retryCount: 0,
        markAttempt: mockMarkAttempt,
        markCompleted: sandbox.stub().resolves(),
        markDiscarded: sandbox.stub().resolves(),
      }
      findByEntityIdStub.resolves(mockRecord)
      fetchMetadataStub.resolves(null)

      await MetadataRefetchProcessor.processRefetch(baseParams)

      expect(mockMarkAttempt.calledOnce).to.be.true
      expect(fetchMetadataStub.calledOnce).to.be.true
    })

    it('Should call fetchMetadata with correct params and retries=4', async () => {
      const mockRecord = {
        id: baseParams.id,
        status: MetadataRefetchStatus.pending,
        retryCount: 0,
        markAttempt: sandbox.stub().resolves(),
        markCompleted: sandbox.stub().resolves(),
        markDiscarded: sandbox.stub().resolves(),
      }
      findByEntityIdStub.resolves(mockRecord)
      fetchMetadataStub.resolves(null)

      await MetadataRefetchProcessor.processRefetch(baseParams)

      expect(fetchMetadataStub.calledOnce).to.be.true
      expect(fetchMetadataStub.firstCall.args[0]).to.eq(baseParams.metadataUri)
      expect(fetchMetadataStub.firstCall.args[1]).to.deep.equal({ retries: 4 })
    })

    it('Should mark completed on successful fetch and entity update', async () => {
      const mockMarkCompleted = sandbox.stub().resolves()
      const mockRecord = {
        id: baseParams.id,
        status: MetadataRefetchStatus.pending,
        retryCount: 0,
        markAttempt: sandbox.stub().resolves(),
        markCompleted: mockMarkCompleted,
        markDiscarded: sandbox.stub().resolves(),
      }
      findByEntityIdStub.resolves(mockRecord)

      const metadata = { name: 'Test', description: 'Test desc' }
      fetchMetadataStub.resolves(metadata)
      applyRefetchedMetadataStub.resolves(true)

      const result = await MetadataRefetchProcessor.processRefetch(baseParams)

      expect(result).to.be.true
      expect(applyRefetchedMetadataStub.calledOnce).to.be.true
      expect(applyRefetchedMetadataStub.firstCall.args).to.deep.equal([
        baseParams.entityType,
        baseParams.entityId,
        baseParams.network,
        metadata,
      ])
      expect(mockMarkCompleted.calledOnce).to.be.true
      expect(loggerInfoStub.calledWith('MetadataRefetch completed successfully')).to.be.true
    })

    it('Should discard after max retries when fetch fails', async () => {
      const mockMarkDiscarded = sandbox.stub().resolves()
      const mockRecord = {
        id: baseParams.id,
        status: MetadataRefetchStatus.pending,
        retryCount: 2, // Already at MAX_RETRY_COUNT (2), should discard
        markAttempt: sandbox.stub().resolves(),
        markCompleted: sandbox.stub().resolves(),
        markDiscarded: mockMarkDiscarded,
      }
      findByEntityIdStub.resolves(mockRecord)
      fetchMetadataStub.resolves(null)

      const result = await MetadataRefetchProcessor.processRefetch(baseParams)

      expect(result).to.be.false
      expect(mockMarkDiscarded.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('MetadataRefetch discarded after max retries')).to.be.true
    })

    it('Should keep pending when fetch fails but under max retries', async () => {
      const mockRecord = {
        id: baseParams.id,
        status: MetadataRefetchStatus.pending,
        retryCount: 0, // Will be 1 after markAttempt, still under MAX_RETRY_COUNT
        markAttempt: sandbox.stub().resolves(),
        markCompleted: sandbox.stub().resolves(),
        markDiscarded: sandbox.stub().resolves(),
      }
      findByEntityIdStub.resolves(mockRecord)
      fetchMetadataStub.resolves(null)

      const result = await MetadataRefetchProcessor.processRefetch(baseParams)

      expect(result).to.be.false
      expect(mockRecord.markCompleted.called).to.be.false
      expect(mockRecord.markDiscarded.called).to.be.false
      expect(loggerVerboseStub.calledWith('MetadataRefetch still pending, will retry later')).to.be.true
    })

    it('Should not mark completed when entity update fails', async () => {
      const mockMarkCompleted = sandbox.stub().resolves()
      const mockRecord = {
        id: baseParams.id,
        status: MetadataRefetchStatus.pending,
        retryCount: 0,
        markAttempt: sandbox.stub().resolves(),
        markCompleted: mockMarkCompleted,
        markDiscarded: sandbox.stub().resolves(),
      }
      findByEntityIdStub.resolves(mockRecord)

      const metadata = { name: 'Test' }
      fetchMetadataStub.resolves(metadata)
      applyRefetchedMetadataStub.resolves(false)

      const result = await MetadataRefetchProcessor.processRefetch(baseParams)

      expect(result).to.be.false
      expect(mockMarkCompleted.called).to.be.false
    })

    it('Should handle errors gracefully', async () => {
      findByEntityIdStub.rejects(new Error('Database error'))

      const result = await MetadataRefetchProcessor.processRefetch(baseParams)

      expect(result).to.be.false
      expect(loggerErrorStub.calledWith('Error processing metadata refetch')).to.be.true
    })
  })
})
