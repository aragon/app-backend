import { Models } from '@dbModels'
import MetadataRefetch from '@models/schema/metadataRefetch'
import { MetadataEntityType, MetadataRefetchStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model: MetadataRefetch', () => {
  let sandbox: SinonSandbox
  let rawRefetch: Partial<MetadataRefetch>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawRefetch = {
      metadataUri: 'ipfs://QmTest1234567890123456789012345678901234567890',
      entityType: MetadataEntityType.Dao,
      entityId: '0x1111111111111111111111111111111111111111',
      network: NetworksEnum.ethereumMainnet,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create MetadataRefetch', () => {
    it('Should create MetadataRefetch with default values', async () => {
      const created = await Models.MetadataRefetch.create(rawRefetch)

      expect(created.id).to.exist
      expect(created.metadataUri).to.eq(rawRefetch.metadataUri)
      expect(created.entityType).to.eq(rawRefetch.entityType)
      expect(created.entityId).to.eq(rawRefetch.entityId)
      expect(created.network).to.eq(rawRefetch.network)
      expect(created.retryCount).to.eq(0)
      expect(created.lastAttemptAt).to.be.null
      expect(created.status).to.eq(MetadataRefetchStatus.pending)
    })

    it('Should create MetadataRefetch with custom status', async () => {
      const created = await Models.MetadataRefetch.create({
        ...rawRefetch,
        status: MetadataRefetchStatus.completed,
      })

      expect(created.status).to.eq(MetadataRefetchStatus.completed)
    })

    it('Should create MetadataRefetch with custom retryCount', async () => {
      const created = await Models.MetadataRefetch.create({
        ...rawRefetch,
        retryCount: 5,
      })

      expect(created.retryCount).to.eq(5)
    })

    it('Should create MetadataRefetch with lastAttemptAt', async () => {
      const attemptDate = new Date()
      const created = await Models.MetadataRefetch.create({
        ...rawRefetch,
        lastAttemptAt: attemptDate,
      })

      expect(created.lastAttemptAt).to.not.be.null
      expect(created.lastAttemptAt!.getTime()).to.eq(attemptDate.getTime())
    })

    it('Should not call getEntityId when id is already present', async () => {
      const entityId = Models.MetadataRefetch.getEntityId({
        metadataUri: rawRefetch.metadataUri!,
        entityType: rawRefetch.entityType!,
        entityId: rawRefetch.entityId!,
        network: rawRefetch.network!,
      })

      rawRefetch.id = entityId
      const getEntityIdSpy = sandbox.spy(Models.MetadataRefetch, 'getEntityId')
      const created = await Models.MetadataRefetch.create(rawRefetch)

      expect(getEntityIdSpy.called).to.be.false
      expect(created.id).to.eq(entityId)
    })

    it('Should fail when metadataUri is not present', async () => {
      await expect(
        Models.MetadataRefetch.create({
          entityType: rawRefetch.entityType,
          entityId: rawRefetch.entityId,
          network: rawRefetch.network,
        }),
      ).to.be.rejectedWith('metadataUri is required')
    })

    it('Should fail when entityType is not present', async () => {
      await expect(
        Models.MetadataRefetch.create({
          metadataUri: rawRefetch.metadataUri,
          entityId: rawRefetch.entityId,
          network: rawRefetch.network,
        }),
      ).to.be.rejectedWith('entityType is required')
    })

    it('Should fail when entityId is not present', async () => {
      await expect(
        Models.MetadataRefetch.create({
          metadataUri: rawRefetch.metadataUri,
          entityType: rawRefetch.entityType,
          network: rawRefetch.network,
        }),
      ).to.be.rejectedWith('entityId is required')
    })

    it('Should fail when network is not present', async () => {
      await expect(
        Models.MetadataRefetch.create({
          metadataUri: rawRefetch.metadataUri,
          entityType: rawRefetch.entityType,
          entityId: rawRefetch.entityId,
        }),
      ).to.be.rejectedWith('network is required')
    })
  })

  describe('getEntityId', () => {
    it('Should generate correct entity ID format', () => {
      const entityId = Models.MetadataRefetch.getEntityId({
        metadataUri: rawRefetch.metadataUri!,
        entityType: rawRefetch.entityType!,
        entityId: rawRefetch.entityId!,
        network: rawRefetch.network!,
      })

      expect(entityId).to.eq(
        `${rawRefetch.network}-${rawRefetch.entityType}-${rawRefetch.entityId}-${rawRefetch.metadataUri}`,
      )
    })

    it('Should generate different IDs for different networks', () => {
      const idMainnet = Models.MetadataRefetch.getEntityId({
        metadataUri: rawRefetch.metadataUri!,
        entityType: rawRefetch.entityType!,
        entityId: rawRefetch.entityId!,
        network: NetworksEnum.ethereumMainnet,
      })

      const idPolygon = Models.MetadataRefetch.getEntityId({
        metadataUri: rawRefetch.metadataUri!,
        entityType: rawRefetch.entityType!,
        entityId: rawRefetch.entityId!,
        network: NetworksEnum.polygonMainnet,
      })

      expect(idMainnet).to.not.eq(idPolygon)
    })

    it('Should generate different IDs for different entity types', () => {
      const idDao = Models.MetadataRefetch.getEntityId({
        metadataUri: rawRefetch.metadataUri!,
        entityType: MetadataEntityType.Dao,
        entityId: rawRefetch.entityId!,
        network: rawRefetch.network!,
      })

      const idPlugin = Models.MetadataRefetch.getEntityId({
        metadataUri: rawRefetch.metadataUri!,
        entityType: MetadataEntityType.Plugin,
        entityId: rawRefetch.entityId!,
        network: rawRefetch.network!,
      })

      expect(idDao).to.not.eq(idPlugin)
    })
  })

  describe('findOrCreate', () => {
    it('Should create a new record when not exists', async () => {
      const record = await Models.MetadataRefetch.findOrCreate(rawRefetch)

      expect(record.id).to.exist
      expect(record.metadataUri).to.eq(rawRefetch.metadataUri)
      expect(record.entityType).to.eq(rawRefetch.entityType)
      expect(record.status).to.eq(MetadataRefetchStatus.pending)
    })

    it('Should return existing record when exists', async () => {
      const created = await Models.MetadataRefetch.create(rawRefetch)
      const found = await Models.MetadataRefetch.findOrCreate(rawRefetch)

      expect(found.id).to.eq(created.id)
      expect(found._id.toString()).to.eq(created._id.toString())
    })

    it('Should not create duplicate records', async () => {
      await Models.MetadataRefetch.findOrCreate(rawRefetch)
      await Models.MetadataRefetch.findOrCreate(rawRefetch)

      const count = await Models.MetadataRefetch.countDocuments({
        metadataUri: rawRefetch.metadataUri,
        entityType: rawRefetch.entityType,
        entityId: rawRefetch.entityId,
        network: rawRefetch.network,
      })

      expect(count).to.eq(1)
    })
  })

  describe('findPendingForRetry', () => {
    it('Should find pending records ready for retry', async () => {
      const pastTime = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
      const created = await Models.MetadataRefetch.create({
        ...rawRefetch,
        retryCount: 1,
        lastAttemptAt: pastTime,
        status: MetadataRefetchStatus.pending,
      })

      const pendingRecords = await Models.MetadataRefetch.findPendingForRetry(30 * 60 * 1000)

      expect(pendingRecords).to.have.lengthOf(1)
      expect(pendingRecords[0].id).to.eq(created.id)
    })

    it('Should not find records with retryCount = 0', async () => {
      await Models.MetadataRefetch.create({
        ...rawRefetch,
        retryCount: 0,
        lastAttemptAt: new Date(Date.now() - 60 * 60 * 1000),
        status: MetadataRefetchStatus.pending,
      })

      const pendingRecords = await Models.MetadataRefetch.findPendingForRetry(30 * 60 * 1000)

      expect(pendingRecords).to.have.lengthOf(0)
    })

    it('Should not find records with lastAttemptAt too recent', async () => {
      await Models.MetadataRefetch.create({
        ...rawRefetch,
        retryCount: 1,
        lastAttemptAt: new Date(), // Just now
        status: MetadataRefetchStatus.pending,
      })

      const pendingRecords = await Models.MetadataRefetch.findPendingForRetry(30 * 60 * 1000)

      expect(pendingRecords).to.have.lengthOf(0)
    })

    it('Should not find completed records', async () => {
      await Models.MetadataRefetch.create({
        ...rawRefetch,
        retryCount: 1,
        lastAttemptAt: new Date(Date.now() - 60 * 60 * 1000),
        status: MetadataRefetchStatus.completed,
      })

      const pendingRecords = await Models.MetadataRefetch.findPendingForRetry(30 * 60 * 1000)

      expect(pendingRecords).to.have.lengthOf(0)
    })

    it('Should not find discarded records', async () => {
      await Models.MetadataRefetch.create({
        ...rawRefetch,
        retryCount: 1,
        lastAttemptAt: new Date(Date.now() - 60 * 60 * 1000),
        status: MetadataRefetchStatus.discarded,
      })

      const pendingRecords = await Models.MetadataRefetch.findPendingForRetry(30 * 60 * 1000)

      expect(pendingRecords).to.have.lengthOf(0)
    })

    it('Should find multiple pending records', async () => {
      const pastTime = new Date(Date.now() - 60 * 60 * 1000)

      await Models.MetadataRefetch.create({
        metadataUri: 'ipfs://QmTest1',
        entityType: MetadataEntityType.Dao,
        entityId: '0x1111111111111111111111111111111111111111',
        network: NetworksEnum.ethereumMainnet,
        retryCount: 1,
        lastAttemptAt: pastTime,
        status: MetadataRefetchStatus.pending,
      })

      await Models.MetadataRefetch.create({
        metadataUri: 'ipfs://QmTest2',
        entityType: MetadataEntityType.Plugin,
        entityId: '0x2222222222222222222222222222222222222222',
        network: NetworksEnum.ethereumMainnet,
        retryCount: 2,
        lastAttemptAt: pastTime,
        status: MetadataRefetchStatus.pending,
      })

      const pendingRecords = await Models.MetadataRefetch.findPendingForRetry(30 * 60 * 1000)

      expect(pendingRecords).to.have.lengthOf(2)
    })
  })

  describe('findByEntityId', () => {
    it('Should find record by entity ID', async () => {
      const created = await Models.MetadataRefetch.create(rawRefetch)
      const found = await Models.MetadataRefetch.findByEntityId(created.id)

      expect(found).to.not.be.null
      expect(found!.id).to.eq(created.id)
    })

    it('Should return null when not found', async () => {
      const found = await Models.MetadataRefetch.findByEntityId('non-existent-id')
      expect(found).to.be.null
    })
  })

  describe('markAttempt', () => {
    it('Should increment retryCount from 0 to 1', async () => {
      const created = await Models.MetadataRefetch.create(rawRefetch)
      expect(created.retryCount).to.eq(0)

      await created.markAttempt()

      expect(created.retryCount).to.eq(1)
    })

    it('Should set lastAttemptAt to current time', async () => {
      const created = await Models.MetadataRefetch.create(rawRefetch)
      expect(created.lastAttemptAt).to.be.null

      const beforeMark = Date.now()
      await created.markAttempt()
      const afterMark = Date.now()

      expect(created.lastAttemptAt).to.not.be.null
      expect(created.lastAttemptAt!.getTime()).to.be.at.least(beforeMark)
      expect(created.lastAttemptAt!.getTime()).to.be.at.most(afterMark)
    })

    it('Should increment retryCount on multiple calls', async () => {
      const created = await Models.MetadataRefetch.create(rawRefetch)

      await created.markAttempt()
      expect(created.retryCount).to.eq(1)

      await created.markAttempt()
      expect(created.retryCount).to.eq(2)

      await created.markAttempt()
      expect(created.retryCount).to.eq(3)
    })

    it('Should return the updated document', async () => {
      const created = await Models.MetadataRefetch.create(rawRefetch)
      const updated = await created.markAttempt()

      expect(updated).to.eq(created)
      expect(updated.retryCount).to.eq(1)
    })
  })

  describe('markCompleted', () => {
    it('Should set status to completed', async () => {
      const created = await Models.MetadataRefetch.create(rawRefetch)
      expect(created.status).to.eq(MetadataRefetchStatus.pending)

      await created.markCompleted()

      expect(created.status).to.eq(MetadataRefetchStatus.completed)
    })

    it('Should persist the completed status', async () => {
      const created = await Models.MetadataRefetch.create(rawRefetch)
      await created.markCompleted()

      const found = await Models.MetadataRefetch.findByEntityId(created.id)
      expect(found!.status).to.eq(MetadataRefetchStatus.completed)
    })

    it('Should return the updated document', async () => {
      const created = await Models.MetadataRefetch.create(rawRefetch)
      const updated = await created.markCompleted()

      expect(updated).to.eq(created)
      expect(updated.status).to.eq(MetadataRefetchStatus.completed)
    })
  })

  describe('markDiscarded', () => {
    it('Should set status to discarded', async () => {
      const created = await Models.MetadataRefetch.create(rawRefetch)
      expect(created.status).to.eq(MetadataRefetchStatus.pending)

      await created.markDiscarded()

      expect(created.status).to.eq(MetadataRefetchStatus.discarded)
    })

    it('Should persist the discarded status', async () => {
      const created = await Models.MetadataRefetch.create(rawRefetch)
      await created.markDiscarded()

      const found = await Models.MetadataRefetch.findByEntityId(created.id)
      expect(found!.status).to.eq(MetadataRefetchStatus.discarded)
    })

    it('Should return the updated document', async () => {
      const created = await Models.MetadataRefetch.create(rawRefetch)
      const updated = await created.markDiscarded()

      expect(updated).to.eq(created)
      expect(updated.status).to.eq(MetadataRefetchStatus.discarded)
    })
  })

  describe('reload', () => {
    it('Should reload the document from database', async () => {
      const created = await Models.MetadataRefetch.create(rawRefetch)
      const reloaded = await created.reload()

      expect(reloaded.id).to.eq(created.id)
      expect(reloaded.metadataUri).to.eq(created.metadataUri)
    })
  })

  describe('Entity Types Coverage', () => {
    const entityTypes = [
      { type: MetadataEntityType.Dao, entityId: '0x1111111111111111111111111111111111111111' },
      { type: MetadataEntityType.Plugin, entityId: '0x2222222222222222222222222222222222222222' },
      { type: MetadataEntityType.Proposal, entityId: '12345' },
      { type: MetadataEntityType.Gauge, entityId: '0x3333333333333333333333333333333333333333' },
      { type: MetadataEntityType.Campaign, entityId: 'campaign-1' },
    ]

    entityTypes.forEach(({ type, entityId }) => {
      it(`Should create and find MetadataRefetch for ${type} entity`, async () => {
        const data = {
          metadataUri: 'ipfs://QmTest',
          entityType: type,
          entityId,
          network: NetworksEnum.ethereumMainnet,
        }

        const created = await Models.MetadataRefetch.create(data)
        expect(created.entityType).to.eq(type)
        expect(created.entityId).to.eq(entityId)

        const found = await Models.MetadataRefetch.findByEntityId(created.id)
        expect(found).to.not.be.null
        expect(found!.entityType).to.eq(type)
      })
    })
  })

  describe('Network Coverage', () => {
    const networks = [NetworksEnum.ethereumMainnet, NetworksEnum.polygonMainnet, NetworksEnum.arbitrumMainnet]

    networks.forEach(network => {
      it(`Should create MetadataRefetch for ${network} network`, async () => {
        const data = {
          ...rawRefetch,
          network,
        }

        const created = await Models.MetadataRefetch.create(data)
        expect(created.network).to.eq(network)
      })
    })
  })
})
