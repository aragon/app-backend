import config from '@config'
import { Models } from '@dbModels'
import MetadataRefetchHelper from '@helpers/metadataRefetch'
import logger from '@logger'
import IPFSModule from '@modules/ipfs'
import { MetadataRefetchScheduler } from '@services/aragon-rates/handlers/metadataRefetch'
import { MetadataEntityType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Services: aragon-rates/handlers/MetadataRefetchScheduler', () => {
  let sandbox: SinonSandbox
  let loggerInfoStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub
  let loggerWarnStub: sinon.SinonStub
  let loggerVerboseStub: sinon.SinonStub
  let fetchMetadataStub: sinon.SinonStub
  let findPendingForRetryStub: sinon.SinonStub
  let applyRefetchedMetadataStub: sinon.SinonStub
  let originalMaxRetry: number
  let originalIntervalMs: number

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerInfoStub = sandbox.stub(logger, 'info')
    loggerErrorStub = sandbox.stub(logger, 'error')
    loggerWarnStub = sandbox.stub(logger, 'warn')
    loggerVerboseStub = sandbox.stub(logger, 'verbose')
    fetchMetadataStub = sandbox.stub(IPFSModule, 'fetchMetadata')
    findPendingForRetryStub = sandbox.stub(Models.MetadataRefetch, 'findPendingForRetry')
    applyRefetchedMetadataStub = sandbox.stub(MetadataRefetchHelper, 'applyRefetchedMetadata')

    // Store original config and set test values
    originalMaxRetry = config.IPFS.METADATA_REFETCH_MAX_RETRY
    originalIntervalMs = config.IPFS.METADATA_REFETCH_INTERVAL_MS
    config.IPFS.METADATA_REFETCH_MAX_RETRY = 2
    config.IPFS.METADATA_REFETCH_INTERVAL_MS = 1000
  })

  afterEach(() => {
    sandbox.restore()
    // Restore original config
    config.IPFS.METADATA_REFETCH_MAX_RETRY = originalMaxRetry
    config.IPFS.METADATA_REFETCH_INTERVAL_MS = originalIntervalMs
  })

  describe('start', () => {
    it('Should log start message and query pending records', async () => {
      findPendingForRetryStub.resolves([])

      await MetadataRefetchScheduler.start()

      expect(loggerInfoStub.calledWith('Starting MetadataRefetchScheduler')).to.be.true
      expect(findPendingForRetryStub.calledOnceWith(config.IPFS.METADATA_REFETCH_INTERVAL_MS)).to.be.true
    })

    it('Should log verbose when no pending records found', async () => {
      findPendingForRetryStub.resolves([])

      await MetadataRefetchScheduler.start()

      expect(loggerVerboseStub.calledWith('No pending metadata refetch records to process')).to.be.true
    })

    it('Should process each pending record', async () => {
      const mockRecords = [
        {
          id: 'record-1',
          metadataUri: 'ipfs://Qm1',
          entityType: MetadataEntityType.Dao,
          entityId: '0x1111111111111111111111111111111111111111',
          network: NetworksEnum.ethereumMainnet,
          retryCount: 1,
          markAttempt: sandbox.stub().resolves(),
          markCompleted: sandbox.stub().resolves(),
          markDiscarded: sandbox.stub().resolves(),
        },
        {
          id: 'record-2',
          metadataUri: 'ipfs://Qm2',
          entityType: MetadataEntityType.Plugin,
          entityId: '0x2222222222222222222222222222222222222222',
          network: NetworksEnum.ethereumMainnet,
          retryCount: 0,
          markAttempt: sandbox.stub().resolves(),
          markCompleted: sandbox.stub().resolves(),
          markDiscarded: sandbox.stub().resolves(),
        },
      ]
      findPendingForRetryStub.resolves(mockRecords)
      fetchMetadataStub.resolves(null)

      await MetadataRefetchScheduler.start()

      expect(loggerInfoStub.calledWith('Found 2 pending metadata refetch records')).to.be.true
      expect(mockRecords[0].markAttempt.calledOnce).to.be.true
      expect(mockRecords[1].markAttempt.calledOnce).to.be.true
      expect(loggerInfoStub.calledWith('MetadataRefetchScheduler completed')).to.be.true
    })

    it('Should handle errors from individual record processing', async () => {
      const mockRecord = {
        id: 'record-1',
        metadataUri: 'ipfs://Qm1',
        entityType: MetadataEntityType.Dao,
        entityId: '0x1111111111111111111111111111111111111111',
        network: NetworksEnum.ethereumMainnet,
        retryCount: 0,
        markAttempt: sandbox.stub().rejects(new Error('Mark attempt failed')),
        markCompleted: sandbox.stub().resolves(),
        markDiscarded: sandbox.stub().resolves(),
      }
      findPendingForRetryStub.resolves([mockRecord])

      await MetadataRefetchScheduler.start()

      expect(loggerErrorStub.calledWith('Error processing metadata refetch record')).to.be.true
      expect(loggerInfoStub.calledWith('MetadataRefetchScheduler completed')).to.be.true
    })

    it('Should handle errors from findPendingForRetry', async () => {
      findPendingForRetryStub.rejects(new Error('Database error'))

      await MetadataRefetchScheduler.start()

      expect(loggerErrorStub.calledWith('Error in MetadataRefetchScheduler')).to.be.true
    })
  })

  describe('_processRecord', () => {
    const baseRecord = {
      id: 'test-record-id',
      metadataUri: 'ipfs://QmTest1234567890123456789012345678901234567890',
      entityType: MetadataEntityType.Dao,
      entityId: '0x1111111111111111111111111111111111111111',
      network: NetworksEnum.ethereumMainnet,
    }

    it('Should mark attempt before fetching', async () => {
      const mockRecord: any = {
        ...baseRecord,
        retryCount: 0,
        markAttempt: sandbox.stub().callsFake(async function (this: any) {
          this.retryCount = (this.retryCount || 0) + 1
        }),
        markCompleted: sandbox.stub().resolves(),
        markDiscarded: sandbox.stub().resolves(),
      }
      fetchMetadataStub.resolves(null)

      await MetadataRefetchScheduler._processRecord(mockRecord)

      expect(mockRecord.markAttempt.calledOnce).to.be.true
      expect(fetchMetadataStub.calledOnce).to.be.true
    })

    it('Should call fetchMetadata with correct params and retries=4', async () => {
      const mockRecord: any = {
        ...baseRecord,
        retryCount: 0,
        markAttempt: sandbox.stub().callsFake(async function (this: any) {
          this.retryCount = (this.retryCount || 0) + 1
        }),
        markCompleted: sandbox.stub().resolves(),
        markDiscarded: sandbox.stub().resolves(),
      }
      fetchMetadataStub.resolves(null)

      await MetadataRefetchScheduler._processRecord(mockRecord)

      expect(fetchMetadataStub.calledOnce).to.be.true
      expect(fetchMetadataStub.firstCall.args[0]).to.eq(baseRecord.metadataUri)
      expect(fetchMetadataStub.firstCall.args[1]).to.deep.equal({ retries: 4 })
    })

    it('Should mark completed on successful fetch and entity update', async () => {
      const mockMarkCompleted = sandbox.stub().resolves()
      const mockRecord: any = {
        ...baseRecord,
        retryCount: 0,
        markAttempt: sandbox.stub().callsFake(async function (this: any) {
          this.retryCount = (this.retryCount || 0) + 1
        }),
        markCompleted: mockMarkCompleted,
        markDiscarded: sandbox.stub().resolves(),
      }

      const metadata = { name: 'Test', description: 'Test desc' }
      fetchMetadataStub.resolves(metadata)
      applyRefetchedMetadataStub.resolves(true)

      await MetadataRefetchScheduler._processRecord(mockRecord)

      expect(applyRefetchedMetadataStub.calledOnce).to.be.true
      expect(mockMarkCompleted.calledOnce).to.be.true
      expect(loggerInfoStub.calledWith('Scheduled MetadataRefetch completed successfully')).to.be.true
    })

    it('Should discard after max retries when fetch fails', async () => {
      const mockMarkDiscarded = sandbox.stub().resolves()
      const mockRecord: any = {
        ...baseRecord,
        retryCount: 1, // Will be 2 after markAttempt, which equals MAX_RETRY_COUNT
        markAttempt: sandbox.stub().callsFake(async function (this: any) {
          this.retryCount = (this.retryCount || 0) + 1
        }),
        markCompleted: sandbox.stub().resolves(),
        markDiscarded: mockMarkDiscarded,
      }
      fetchMetadataStub.resolves(null)

      await MetadataRefetchScheduler._processRecord(mockRecord)

      expect(mockMarkDiscarded.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Scheduled MetadataRefetch discarded after max retries')).to.be.true
    })

    it('Should keep pending when fetch fails but under max retries', async () => {
      const mockRecord: any = {
        ...baseRecord,
        retryCount: 0, // Will be 1 after markAttempt, still under MAX_RETRY_COUNT
        markAttempt: sandbox.stub().callsFake(async function (this: any) {
          this.retryCount = (this.retryCount || 0) + 1
        }),
        markCompleted: sandbox.stub().resolves(),
        markDiscarded: sandbox.stub().resolves(),
      }
      fetchMetadataStub.resolves(null)

      await MetadataRefetchScheduler._processRecord(mockRecord)

      expect(mockRecord.markCompleted.called).to.be.false
      expect(mockRecord.markDiscarded.called).to.be.false
      expect(loggerVerboseStub.calledWith('Scheduled MetadataRefetch still pending')).to.be.true
    })

    it('Should not mark completed when entity update fails', async () => {
      const mockMarkCompleted = sandbox.stub().resolves()
      const mockRecord: any = {
        ...baseRecord,
        retryCount: 0,
        markAttempt: sandbox.stub().callsFake(async function (this: any) {
          this.retryCount = (this.retryCount || 0) + 1
        }),
        markCompleted: mockMarkCompleted,
        markDiscarded: sandbox.stub().resolves(),
      }

      const metadata = { name: 'Test' }
      fetchMetadataStub.resolves(metadata)
      applyRefetchedMetadataStub.resolves(false)

      await MetadataRefetchScheduler._processRecord(mockRecord)

      expect(mockMarkCompleted.called).to.be.false
    })
  })
})
