import config from '@config'
import { Models } from '@dbModels'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import IPFSModule from '@modules/ipfs'
import { MetadataRefetchScheduler } from '@services/aragon-rates/handlers/metadataRefetch'
import { MetadataEntityType, MetadataRefetchStatus, NetworksEnum } from '@types'
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
      const mockMarkAttempt = sandbox.stub().resolves()
      const mockRecord = {
        ...baseRecord,
        retryCount: 0,
        markAttempt: mockMarkAttempt,
        markCompleted: sandbox.stub().resolves(),
        markDiscarded: sandbox.stub().resolves(),
      }
      fetchMetadataStub.resolves(null)

      await MetadataRefetchScheduler._processRecord(mockRecord)

      expect(mockMarkAttempt.calledOnce).to.be.true
      expect(fetchMetadataStub.calledOnce).to.be.true
    })

    it('Should call fetchMetadata with correct params and retries=4', async () => {
      const mockRecord = {
        ...baseRecord,
        retryCount: 0,
        markAttempt: sandbox.stub().resolves(),
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
      const mockRecord = {
        ...baseRecord,
        retryCount: 0,
        markAttempt: sandbox.stub().resolves(),
        markCompleted: mockMarkCompleted,
        markDiscarded: sandbox.stub().resolves(),
      }

      const metadata = { name: 'Test', description: 'Test desc' }
      fetchMetadataStub.resolves(metadata)

      // Stub _updateEntity
      const updateEntityStub = sandbox.stub(MetadataRefetchScheduler, '_updateEntity').resolves(true)

      await MetadataRefetchScheduler._processRecord(mockRecord)

      expect(updateEntityStub.calledOnce).to.be.true
      expect(mockMarkCompleted.calledOnce).to.be.true
      expect(loggerInfoStub.calledWith('Scheduled MetadataRefetch completed successfully')).to.be.true
    })

    it('Should discard after max retries when fetch fails', async () => {
      const mockMarkDiscarded = sandbox.stub().resolves()
      const mockRecord = {
        ...baseRecord,
        retryCount: 1, // Will be 2 after markAttempt, which equals MAX_RETRY_COUNT
        markAttempt: sandbox.stub().resolves(),
        markCompleted: sandbox.stub().resolves(),
        markDiscarded: mockMarkDiscarded,
      }
      fetchMetadataStub.resolves(null)

      await MetadataRefetchScheduler._processRecord(mockRecord)

      expect(mockMarkDiscarded.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Scheduled MetadataRefetch discarded after max retries')).to.be.true
    })

    it('Should keep pending when fetch fails but under max retries', async () => {
      const mockRecord = {
        ...baseRecord,
        retryCount: 0, // Will be 1 after markAttempt, still under MAX_RETRY_COUNT
        markAttempt: sandbox.stub().resolves(),
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
      const mockRecord = {
        ...baseRecord,
        retryCount: 0,
        markAttempt: sandbox.stub().resolves(),
        markCompleted: mockMarkCompleted,
        markDiscarded: sandbox.stub().resolves(),
      }

      const metadata = { name: 'Test' }
      fetchMetadataStub.resolves(metadata)

      // Stub _updateEntity to return false
      sandbox.stub(MetadataRefetchScheduler, '_updateEntity').resolves(false)

      await MetadataRefetchScheduler._processRecord(mockRecord)

      expect(mockMarkCompleted.called).to.be.false
    })
  })

  describe('_updateEntity', () => {
    const network = NetworksEnum.ethereumMainnet
    const entityId = '0x1111111111111111111111111111111111111111'

    describe('Dao', () => {
      it('Should update Dao metadata successfully', async () => {
        const mockUpdate = sandbox.stub().resolves()
        const mockDao = { update: mockUpdate }
        sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao as any)

        const metadata = {
          name: 'Updated DAO',
          description: 'Updated description',
          avatar: 'https://example.com/avatar.png',
          links: [{ name: 'Website', url: 'https://example.com' }],
        }

        const result = await MetadataRefetchScheduler._updateEntity(MetadataEntityType.Dao, entityId, network, metadata)

        expect(result).to.be.true
        expect(mockUpdate.calledOnce).to.be.true
        expect(loggerVerboseStub.calledWith('Updated Dao metadata via scheduler')).to.be.true
      })

      it('Should return false when Dao not found', async () => {
        sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

        const result = await MetadataRefetchScheduler._updateEntity(MetadataEntityType.Dao, entityId, network, {})

        expect(result).to.be.false
        expect(loggerWarnStub.calledWith('Dao not found for metadata update')).to.be.true
      })
    })

    describe('Plugin', () => {
      it('Should update Plugin metadata successfully', async () => {
        const mockUpdate = sandbox.stub().resolves()
        const mockPlugin = { update: mockUpdate }
        sandbox.stub(Models.Plugin, 'findByAddress').resolves(mockPlugin as any)

        const metadata = {
          name: 'Updated Plugin',
          description: 'Updated description',
          links: [],
          processKey: 'test-key',
          blockedCountries: ['US'],
          termsConditionsUrl: 'https://terms.example.com',
          enableOfacCheck: true,
        }

        const result = await MetadataRefetchScheduler._updateEntity(
          MetadataEntityType.Plugin,
          entityId,
          network,
          metadata,
        )

        expect(result).to.be.true
        expect(mockUpdate.calledOnce).to.be.true
        expect(loggerVerboseStub.calledWith('Updated Plugin metadata via scheduler')).to.be.true
      })

      it('Should return false when Plugin not found', async () => {
        sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)

        const result = await MetadataRefetchScheduler._updateEntity(MetadataEntityType.Plugin, entityId, network, {})

        expect(result).to.be.false
        expect(loggerWarnStub.calledWith('Plugin not found for metadata update')).to.be.true
      })
    })

    describe('Proposal', () => {
      it('Should update Proposal metadata successfully', async () => {
        const mockUpdate = sandbox.stub().resolves()
        const mockProposal = { update: mockUpdate }
        sandbox.stub(Models.Proposal, 'findOne').resolves(mockProposal as any)

        const metadata = {
          title: 'Updated Proposal',
          description: 'Updated description',
          summary: 'Updated summary',
          resources: [],
          media: [],
        }

        const parsedMetadata = {
          title: 'Updated Proposal',
          description: 'Updated description',
          summary: 'Updated summary',
          resources: [],
          media: [],
        }
        sandbox.stub(Web3Utils, 'parseProposalMetadata').returns(parsedMetadata as any)

        const result = await MetadataRefetchScheduler._updateEntity(
          MetadataEntityType.Proposal,
          '12345',
          network,
          metadata,
        )

        expect(result).to.be.true
        expect(mockUpdate.calledOnce).to.be.true
        expect(loggerVerboseStub.calledWith('Updated Proposal metadata via scheduler')).to.be.true
      })

      it('Should return false when Proposal not found', async () => {
        sandbox.stub(Models.Proposal, 'findOne').resolves(null)
        sandbox.stub(Web3Utils, 'parseProposalMetadata').returns({ title: 'Test' } as any)

        const result = await MetadataRefetchScheduler._updateEntity(MetadataEntityType.Proposal, '12345', network, {
          title: 'Test',
        })

        expect(result).to.be.false
        expect(loggerWarnStub.calledWith('Proposal not found for metadata update')).to.be.true
      })

      it('Should return false when metadata parsing fails', async () => {
        sandbox.stub(Web3Utils, 'parseProposalMetadata').returns(null as any)

        const result = await MetadataRefetchScheduler._updateEntity(
          MetadataEntityType.Proposal,
          '12345',
          network,
          null as any,
        )

        expect(result).to.be.false
        expect(loggerWarnStub.calledWith('Failed to parse proposal metadata')).to.be.true
      })
    })

    describe('Gauge', () => {
      it('Should update Gauge metadata successfully', async () => {
        const mockUpdate = sandbox.stub().resolves()
        const mockGauge = { update: mockUpdate }
        sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)

        const metadata = {
          name: 'Updated Gauge',
          description: 'Updated description',
          links: [],
          avatar: 'https://example.com/avatar.png',
        }

        const result = await MetadataRefetchScheduler._updateEntity(
          MetadataEntityType.Gauge,
          entityId,
          network,
          metadata,
        )

        expect(result).to.be.true
        expect(mockUpdate.calledOnce).to.be.true
        expect(loggerVerboseStub.calledWith('Updated Gauge metadata via scheduler')).to.be.true
      })

      it('Should return false when Gauge not found', async () => {
        sandbox.stub(Models.Gauge, 'findOne').resolves(null)

        const result = await MetadataRefetchScheduler._updateEntity(MetadataEntityType.Gauge, entityId, network, {})

        expect(result).to.be.false
        expect(loggerWarnStub.calledWith('Gauge not found for metadata update')).to.be.true
      })
    })

    describe('Campaign', () => {
      it('Should update Campaign metadata successfully', async () => {
        const mockUpdateMetadata = sandbox.stub().resolves()
        const mockCampaign = { updateMetadata: mockUpdateMetadata }
        sandbox.stub(Models.Campaign, 'findOne').resolves(mockCampaign as any)

        const metadata = {
          title: 'Updated Campaign',
          description: 'Updated description',
          resources: [],
          type: 'airdrop',
        }

        const parsedMetadata = {
          title: 'Updated Campaign',
          description: 'Updated description',
          resources: [],
          type: 'airdrop',
        }
        sandbox.stub(Web3Utils, 'parseCampaignMetadata').returns(parsedMetadata as any)

        const result = await MetadataRefetchScheduler._updateEntity(
          MetadataEntityType.Campaign,
          'campaign-1',
          network,
          metadata,
        )

        expect(result).to.be.true
        expect(mockUpdateMetadata.calledOnce).to.be.true
        expect(loggerVerboseStub.calledWith('Updated Campaign metadata via scheduler')).to.be.true
      })

      it('Should return false when Campaign not found', async () => {
        sandbox.stub(Models.Campaign, 'findOne').resolves(null)
        sandbox.stub(Web3Utils, 'parseCampaignMetadata').returns({ title: 'Test' } as any)

        const result = await MetadataRefetchScheduler._updateEntity(
          MetadataEntityType.Campaign,
          'campaign-1',
          network,
          { title: 'Test' },
        )

        expect(result).to.be.false
        expect(loggerWarnStub.calledWith('Campaign not found for metadata update')).to.be.true
      })

      it('Should return false when metadata parsing fails', async () => {
        sandbox.stub(Web3Utils, 'parseCampaignMetadata').returns(null as any)

        const result = await MetadataRefetchScheduler._updateEntity(
          MetadataEntityType.Campaign,
          'campaign-1',
          network,
          null as any,
        )

        expect(result).to.be.false
        expect(loggerWarnStub.calledWith('Failed to parse campaign metadata')).to.be.true
      })
    })

    describe('Unknown entity type', () => {
      it('Should return false for unknown entity type', async () => {
        const result = await MetadataRefetchScheduler._updateEntity(
          'UnknownType' as MetadataEntityType,
          entityId,
          network,
          {},
        )

        expect(result).to.be.false
        expect(loggerWarnStub.calledWith('Unknown entity type for metadata update')).to.be.true
      })
    })

    describe('Error handling', () => {
      it('Should return false and log error when update throws', async () => {
        sandbox.stub(Models.Dao, 'findByAddress').rejects(new Error('Database error'))

        const result = await MetadataRefetchScheduler._updateEntity(MetadataEntityType.Dao, entityId, network, {})

        expect(result).to.be.false
        expect(loggerErrorStub.calledWith('Error updating entity metadata')).to.be.true
      })
    })
  })
})
