import config from '@config'
import { Models } from '@dbModels'
import Web3Utils from '@helpers/web3Utils'
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
  let originalMaxRetry: number

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerInfoStub = sandbox.stub(logger, 'info')
    loggerErrorStub = sandbox.stub(logger, 'error')
    loggerWarnStub = sandbox.stub(logger, 'warn')
    loggerVerboseStub = sandbox.stub(logger, 'verbose')
    fetchMetadataStub = sandbox.stub(IPFSModule, 'fetchMetadata')
    findByEntityIdStub = sandbox.stub(Models.MetadataRefetch, 'findByEntityId')

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

      // Stub _updateEntity
      const updateEntityStub = sandbox.stub(MetadataRefetchProcessor, '_updateEntity').resolves(true)

      const result = await MetadataRefetchProcessor.processRefetch(baseParams)

      expect(result).to.be.true
      expect(updateEntityStub.calledOnce).to.be.true
      expect(updateEntityStub.firstCall.args).to.deep.equal([
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

      // Stub _updateEntity to return false
      sandbox.stub(MetadataRefetchProcessor, '_updateEntity').resolves(false)

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

        const result = await MetadataRefetchProcessor._updateEntity(MetadataEntityType.Dao, entityId, network, metadata)

        expect(result).to.be.true
        expect(mockUpdate.calledOnce).to.be.true
        expect(loggerVerboseStub.calledWith('Updated Dao metadata')).to.be.true
      })

      it('Should return false when Dao not found', async () => {
        sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

        const result = await MetadataRefetchProcessor._updateEntity(MetadataEntityType.Dao, entityId, network, {})

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

        const result = await MetadataRefetchProcessor._updateEntity(
          MetadataEntityType.Plugin,
          entityId,
          network,
          metadata,
        )

        expect(result).to.be.true
        expect(mockUpdate.calledOnce).to.be.true
        expect(loggerVerboseStub.calledWith('Updated Plugin metadata')).to.be.true
      })

      it('Should return false when Plugin not found', async () => {
        sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)

        const result = await MetadataRefetchProcessor._updateEntity(MetadataEntityType.Plugin, entityId, network, {})

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

        const result = await MetadataRefetchProcessor._updateEntity(
          MetadataEntityType.Proposal,
          '12345',
          network,
          metadata,
        )

        expect(result).to.be.true
        expect(mockUpdate.calledOnce).to.be.true
        expect(loggerVerboseStub.calledWith('Updated Proposal metadata')).to.be.true
      })

      it('Should return false when Proposal not found', async () => {
        sandbox.stub(Models.Proposal, 'findOne').resolves(null)
        sandbox.stub(Web3Utils, 'parseProposalMetadata').returns({ title: 'Test' } as any)

        const result = await MetadataRefetchProcessor._updateEntity(MetadataEntityType.Proposal, '12345', network, {
          title: 'Test',
        })

        expect(result).to.be.false
        expect(loggerWarnStub.calledWith('Proposal not found for metadata update')).to.be.true
      })

      it('Should return false when metadata parsing fails', async () => {
        // parseProposalMetadata returns null for invalid metadata
        sandbox.stub(Web3Utils, 'parseProposalMetadata').returns(null as any)

        const result = await MetadataRefetchProcessor._updateEntity(
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

        const result = await MetadataRefetchProcessor._updateEntity(
          MetadataEntityType.Gauge,
          entityId,
          network,
          metadata,
        )

        expect(result).to.be.true
        expect(mockUpdate.calledOnce).to.be.true
        expect(loggerVerboseStub.calledWith('Updated Gauge metadata')).to.be.true
      })

      it('Should return false when Gauge not found', async () => {
        sandbox.stub(Models.Gauge, 'findOne').resolves(null)

        const result = await MetadataRefetchProcessor._updateEntity(MetadataEntityType.Gauge, entityId, network, {})

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

        const result = await MetadataRefetchProcessor._updateEntity(
          MetadataEntityType.Campaign,
          'campaign-1',
          network,
          metadata,
        )

        expect(result).to.be.true
        expect(mockUpdateMetadata.calledOnce).to.be.true
        expect(loggerVerboseStub.calledWith('Updated Campaign metadata')).to.be.true
      })

      it('Should return false when Campaign not found', async () => {
        sandbox.stub(Models.Campaign, 'findOne').resolves(null)
        sandbox.stub(Web3Utils, 'parseCampaignMetadata').returns({ title: 'Test' } as any)

        const result = await MetadataRefetchProcessor._updateEntity(
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

        const result = await MetadataRefetchProcessor._updateEntity(
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
        const result = await MetadataRefetchProcessor._updateEntity(
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

        const result = await MetadataRefetchProcessor._updateEntity(MetadataEntityType.Dao, entityId, network, {})

        expect(result).to.be.false
        expect(loggerErrorStub.calledWith('Error updating entity metadata')).to.be.true
      })
    })
  })
})
