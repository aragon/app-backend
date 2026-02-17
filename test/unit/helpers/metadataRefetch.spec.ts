import { Models } from '@dbModels'
import MetadataRefetchHelper from '@helpers/metadataRefetch'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import { EnumQueueName, MetadataEntityType, MetadataRefetchStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helpers: MetadataRefetch', () => {
  let sandbox: SinonSandbox
  let loggerInfoStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub
  let loggerVerboseStub: sinon.SinonStub
  let loggerWarnStub: sinon.SinonStub
  let sendMessageStub: sinon.SinonStub
  let findOrCreateStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerInfoStub = sandbox.stub(logger, 'info')
    loggerErrorStub = sandbox.stub(logger, 'error')
    loggerVerboseStub = sandbox.stub(logger, 'verbose')
    loggerWarnStub = sandbox.stub(logger, 'warn')
    sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    findOrCreateStub = sandbox.stub(Models.MetadataRefetch, 'findOrCreate')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('queueForRefetch', () => {
    const testParams = {
      metadataUri: 'ipfs://QmTest1234567890123456789012345678901234567890',
      entityType: MetadataEntityType.Dao,
      entityId: '0x1111111111111111111111111111111111111111',
      network: NetworksEnum.ethereumMainnet,
    }

    it('Should create a record and queue for refetch when record is pending', async () => {
      const mockRecord = {
        id: 'test-record-id',
        status: MetadataRefetchStatus.pending,
      }
      findOrCreateStub.resolves(mockRecord)

      await MetadataRefetchHelper.queueForRefetch(testParams)

      // Verify findOrCreate was called with correct params
      expect(findOrCreateStub.calledOnce).to.be.true
      expect(findOrCreateStub.firstCall.args[0]).to.deep.equal({
        metadataUri: testParams.metadataUri,
        entityType: testParams.entityType,
        entityId: testParams.entityId,
        network: testParams.network,
      })

      // Verify message was sent to queue
      expect(sendMessageStub.calledOnce).to.be.true
      expect(sendMessageStub.firstCall.args[0]).to.eq(EnumQueueName.metadataRefetch)

      const queuePayload = sendMessageStub.firstCall.args[1]
      expect(queuePayload.id).to.eq(mockRecord.id)
      expect(queuePayload.params.metadataUri).to.eq(testParams.metadataUri)
      expect(queuePayload.params.entityType).to.eq(testParams.entityType)
      expect(queuePayload.params.entityId).to.eq(testParams.entityId)
      expect(queuePayload.params.network).to.eq(testParams.network)

      // Verify logging
      expect(loggerInfoStub.calledWith('Queued metadata for refetch')).to.be.true
    })

    it('Should not queue already completed records', async () => {
      const mockRecord = {
        id: 'test-record-id',
        status: MetadataRefetchStatus.completed,
      }
      findOrCreateStub.resolves(mockRecord)

      await MetadataRefetchHelper.queueForRefetch(testParams)

      // Should not send message to queue
      expect(sendMessageStub.called).to.be.false
      expect(loggerVerboseStub.calledWith('MetadataRefetch record already processed, skipping queue')).to.be.true
    })

    it('Should not queue already discarded records', async () => {
      const mockRecord = {
        id: 'test-record-id',
        status: MetadataRefetchStatus.discarded,
      }
      findOrCreateStub.resolves(mockRecord)

      await MetadataRefetchHelper.queueForRefetch(testParams)

      // Should not send message to queue
      expect(sendMessageStub.called).to.be.false
      expect(loggerVerboseStub.calledWith('MetadataRefetch record already processed, skipping queue')).to.be.true
    })

    it('Should handle errors from findOrCreate gracefully', async () => {
      findOrCreateStub.rejects(new Error('Database error'))

      await MetadataRefetchHelper.queueForRefetch(testParams)

      // Should log the error
      expect(loggerErrorStub.calledWith('Error queueing metadata for refetch')).to.be.true
      expect(sendMessageStub.called).to.be.false
    })

    it('Should handle errors from sendMessage gracefully', async () => {
      const mockRecord = {
        id: 'test-record-id',
        status: MetadataRefetchStatus.pending,
      }
      findOrCreateStub.resolves(mockRecord)
      sendMessageStub.rejects(new Error('Queue error'))

      await MetadataRefetchHelper.queueForRefetch(testParams)

      // Should log the error
      expect(loggerErrorStub.calledWith('Error queueing metadata for refetch')).to.be.true
    })

    it('Should work with different entity types', async () => {
      const entityTypes = [
        MetadataEntityType.Dao,
        MetadataEntityType.Plugin,
        MetadataEntityType.Proposal,
        MetadataEntityType.Gauge,
        MetadataEntityType.Campaign,
      ]

      for (const entityType of entityTypes) {
        findOrCreateStub.resetHistory()
        sendMessageStub.resetHistory()

        const mockRecord = {
          id: `record-${entityType}`,
          status: MetadataRefetchStatus.pending,
        }
        findOrCreateStub.resolves(mockRecord)

        await MetadataRefetchHelper.queueForRefetch({
          ...testParams,
          entityType,
        })

        expect(findOrCreateStub.calledOnce).to.be.true
        expect(sendMessageStub.calledOnce).to.be.true
        expect(sendMessageStub.firstCall.args[1].params.entityType).to.eq(entityType)
      }
    })

    it('Should work with different networks', async () => {
      const networks = [NetworksEnum.ethereumMainnet, NetworksEnum.polygonMainnet, NetworksEnum.arbitrumMainnet]

      for (const network of networks) {
        findOrCreateStub.resetHistory()
        sendMessageStub.resetHistory()

        const mockRecord = {
          id: `record-${network}`,
          status: MetadataRefetchStatus.pending,
        }
        findOrCreateStub.resolves(mockRecord)

        await MetadataRefetchHelper.queueForRefetch({
          ...testParams,
          network,
        })

        expect(findOrCreateStub.calledOnce).to.be.true
        expect(sendMessageStub.calledOnce).to.be.true
        expect(sendMessageStub.firstCall.args[1].params.network).to.eq(network)
      }
    })
  })

  describe('createFailedCallback', () => {
    it('Should return a function', () => {
      const callback = MetadataRefetchHelper.createFailedCallback(
        MetadataEntityType.Dao,
        '0x1111111111111111111111111111111111111111',
        NetworksEnum.ethereumMainnet,
      )

      expect(callback).to.be.a('function')
    })

    it('Should call queueForRefetch with correct parameters when invoked', async () => {
      const entityType = MetadataEntityType.Dao
      const entityId = '0x1111111111111111111111111111111111111111'
      const network = NetworksEnum.ethereumMainnet
      const metadataUri = 'ipfs://QmTest1234567890123456789012345678901234567890'

      const mockRecord = {
        id: 'test-callback-record',
        status: MetadataRefetchStatus.pending,
      }
      findOrCreateStub.resolves(mockRecord)

      const callback = MetadataRefetchHelper.createFailedCallback(entityType, entityId, network)
      await callback(metadataUri)

      // Verify findOrCreate was called with the combined parameters
      expect(findOrCreateStub.calledOnce).to.be.true
      expect(findOrCreateStub.firstCall.args[0]).to.deep.equal({
        metadataUri,
        entityType,
        entityId,
        network,
      })

      // Verify message was queued
      expect(sendMessageStub.calledOnce).to.be.true
    })

    it('Should create callbacks for all entity types', async () => {
      const entityTypes = [
        MetadataEntityType.Dao,
        MetadataEntityType.Plugin,
        MetadataEntityType.Proposal,
        MetadataEntityType.Gauge,
        MetadataEntityType.Campaign,
      ]

      const entityId = '0x1111111111111111111111111111111111111111'
      const network = NetworksEnum.ethereumMainnet
      const metadataUri = 'ipfs://QmTest'

      for (const type of entityTypes) {
        findOrCreateStub.resetHistory()
        sendMessageStub.resetHistory()

        const mockRecord = {
          id: `record-callback-${type}`,
          status: MetadataRefetchStatus.pending,
        }
        findOrCreateStub.resolves(mockRecord)

        const callback = MetadataRefetchHelper.createFailedCallback(type, entityId, network)
        await callback(metadataUri)

        expect(findOrCreateStub.calledOnce).to.be.true
        expect(findOrCreateStub.firstCall.args[0].entityType).to.eq(type)
      }
    })

    it('Should pass different metadataUri to each callback invocation', async () => {
      const entityType = MetadataEntityType.Dao
      const entityId = '0x1111111111111111111111111111111111111111'
      const network = NetworksEnum.ethereumMainnet

      const mockRecord = {
        id: 'test-multi-uri',
        status: MetadataRefetchStatus.pending,
      }
      findOrCreateStub.resolves(mockRecord)

      const callback = MetadataRefetchHelper.createFailedCallback(entityType, entityId, network)

      // Call with different URIs
      await callback('ipfs://QmUri1')
      expect(findOrCreateStub.firstCall.args[0].metadataUri).to.eq('ipfs://QmUri1')

      findOrCreateStub.resetHistory()
      findOrCreateStub.resolves(mockRecord)

      await callback('ipfs://QmUri2')
      expect(findOrCreateStub.firstCall.args[0].metadataUri).to.eq('ipfs://QmUri2')
    })
  })

  describe('applyRefetchedMetadata', () => {
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

        const result = await MetadataRefetchHelper.applyRefetchedMetadata(
          MetadataEntityType.Dao,
          entityId,
          network,
          metadata,
        )

        expect(result).to.be.true
        expect(mockUpdate.calledOnce).to.be.true
        expect(loggerVerboseStub.calledWith('Applied refetched metadata to Dao')).to.be.true
      })

      it('Should return false when Dao not found', async () => {
        sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

        const result = await MetadataRefetchHelper.applyRefetchedMetadata(MetadataEntityType.Dao, entityId, network, {})

        expect(result).to.be.false
        expect(loggerWarnStub.calledWith('Dao not found for metadata update')).to.be.true
      })

      it('Should return false when metadata is null', async () => {
        const result = await MetadataRefetchHelper.applyRefetchedMetadata(
          MetadataEntityType.Dao,
          entityId,
          network,
          null as any,
        )

        expect(result).to.be.false
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

        const result = await MetadataRefetchHelper.applyRefetchedMetadata(
          MetadataEntityType.Plugin,
          entityId,
          network,
          metadata,
        )

        expect(result).to.be.true
        expect(mockUpdate.calledOnce).to.be.true
        expect(loggerVerboseStub.calledWith('Applied refetched metadata to Plugin')).to.be.true
      })

      it('Should return false when Plugin not found', async () => {
        sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)

        const result = await MetadataRefetchHelper.applyRefetchedMetadata(
          MetadataEntityType.Plugin,
          entityId,
          network,
          {},
        )

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

        const result = await MetadataRefetchHelper.applyRefetchedMetadata(
          MetadataEntityType.Proposal,
          '12345',
          network,
          metadata,
        )

        expect(result).to.be.true
        expect(mockUpdate.calledOnce).to.be.true
        expect(loggerVerboseStub.calledWith('Applied refetched metadata to Proposal')).to.be.true
      })

      it('Should return false when Proposal not found', async () => {
        sandbox.stub(Models.Proposal, 'findOne').resolves(null)
        sandbox.stub(Web3Utils, 'parseProposalMetadata').returns({ title: 'Test' } as any)

        const result = await MetadataRefetchHelper.applyRefetchedMetadata(
          MetadataEntityType.Proposal,
          '12345',
          network,
          {
            title: 'Test',
          },
        )

        expect(result).to.be.false
        expect(loggerWarnStub.calledWith('Proposal not found for metadata update')).to.be.true
      })

      it('Should return false when metadata parsing fails', async () => {
        sandbox.stub(Web3Utils, 'parseProposalMetadata').returns(null as any)

        const result = await MetadataRefetchHelper.applyRefetchedMetadata(
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

        const result = await MetadataRefetchHelper.applyRefetchedMetadata(
          MetadataEntityType.Gauge,
          entityId,
          network,
          metadata,
        )

        expect(result).to.be.true
        expect(mockUpdate.calledOnce).to.be.true
        expect(loggerVerboseStub.calledWith('Applied refetched metadata to Gauge')).to.be.true
      })

      it('Should return false when Gauge not found', async () => {
        sandbox.stub(Models.Gauge, 'findOne').resolves(null)

        const result = await MetadataRefetchHelper.applyRefetchedMetadata(
          MetadataEntityType.Gauge,
          entityId,
          network,
          {},
        )

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

        const result = await MetadataRefetchHelper.applyRefetchedMetadata(
          MetadataEntityType.Campaign,
          'campaign-1',
          network,
          metadata,
        )

        expect(result).to.be.true
        expect(mockUpdateMetadata.calledOnce).to.be.true
        expect(loggerVerboseStub.calledWith('Applied refetched metadata to Campaign')).to.be.true
      })

      it('Should return false when Campaign not found', async () => {
        sandbox.stub(Models.Campaign, 'findOne').resolves(null)
        sandbox.stub(Web3Utils, 'parseCampaignMetadata').returns({ title: 'Test' } as any)

        const result = await MetadataRefetchHelper.applyRefetchedMetadata(
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

        const result = await MetadataRefetchHelper.applyRefetchedMetadata(
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
        const result = await MetadataRefetchHelper.applyRefetchedMetadata(
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

        const result = await MetadataRefetchHelper.applyRefetchedMetadata(MetadataEntityType.Dao, entityId, network, {})

        expect(result).to.be.false
        expect(loggerErrorStub.calledWith('Error applying refetched metadata')).to.be.true
      })
    })
  })
})
