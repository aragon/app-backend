import { Models } from '@dbModels'
import dayjs from '@helpers/dayjs'
import Migration from '@models/schema/migration'
import { IMigrationStatus } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model: Migration', () => {
  let sandbox: SinonSandbox
  let rawMigration: Partial<Migration>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawMigration = {
      filename: '20240101000000-test-migration',
      status: IMigrationStatus.PENDING,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('create', () => {
    it('Should create Migration', async () => {
      const createdMigration = await Models.Migration.create(rawMigration)

      expect(createdMigration.filename).to.eq(rawMigration.filename)
      expect(createdMigration.status).to.eq(IMigrationStatus.PENDING)
      expect(createdMigration.executedAt).to.be.null
      expect(createdMigration.startedAt).to.be.null
      expect(createdMigration.executionTimeMs).to.be.null
      expect(createdMigration.error).to.be.null
      expect(createdMigration.errorStack).to.be.null
    })

    it('Should throw error when filename is missing', async () => {
      try {
        await Models.Migration.create({})
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.eq('filename is required')
      }
    })
  })

  describe('findByFilename', () => {
    it('Should find migration by filename', async () => {
      const createdMigration = await Models.Migration.create(rawMigration)
      const foundMigration = await Models.Migration.findByFilename(createdMigration.filename)

      expect(foundMigration?.filename).to.eq(createdMigration.filename)
      expect(foundMigration?.id).to.eq(createdMigration.id)
    })

    it('Should return null when migration not found', async () => {
      const foundMigration = await Models.Migration.findByFilename('non-existent-migration')
      expect(foundMigration).to.be.null
    })
  })

  describe('findPendingMigrations', () => {
    it('Should find only pending migrations sorted by filename', async () => {
      // Create migrations with different statuses
      await Models.Migration.create({ filename: '20240103000000-third', status: IMigrationStatus.PENDING })
      await Models.Migration.create({ filename: '20240101000000-first', status: IMigrationStatus.PENDING })
      await Models.Migration.create({ filename: '20240102000000-second', status: IMigrationStatus.COMPLETED })
      await Models.Migration.create({ filename: '20240104000000-fourth', status: IMigrationStatus.FAILED })

      const pendingMigrations = await Models.Migration.findPendingMigrations()

      expect(pendingMigrations).to.have.lengthOf(2)
      expect(pendingMigrations[0].filename).to.eq('20240101000000-first')
      expect(pendingMigrations[1].filename).to.eq('20240103000000-third')
    })

    it('Should return empty array when no pending migrations', async () => {
      await Models.Migration.create({ filename: '20240101000000-first', status: IMigrationStatus.COMPLETED })

      const pendingMigrations = await Models.Migration.findPendingMigrations()
      expect(pendingMigrations).to.have.lengthOf(0)
    })
  })

  describe('findExecutedMigrations', () => {
    it('Should find completed and failed migrations sorted by executedAt', async () => {
      const now = dayjs.utc()

      await Models.Migration.create({
        filename: '20240101000000-first',
        status: IMigrationStatus.COMPLETED,
        executedAt: now.subtract(2, 'days').toDate(),
      })
      await Models.Migration.create({
        filename: '20240102000000-second',
        status: IMigrationStatus.FAILED,
        executedAt: now.subtract(1, 'day').toDate(),
      })
      await Models.Migration.create({
        filename: '20240103000000-third',
        status: IMigrationStatus.PENDING,
      })
      await Models.Migration.create({
        filename: '20240104000000-fourth',
        status: IMigrationStatus.COMPLETED,
        executedAt: now.toDate(),
      })

      const executedMigrations = await Models.Migration.findExecutedMigrations()

      expect(executedMigrations).to.have.lengthOf(3)
      expect(executedMigrations[0].filename).to.eq('20240104000000-fourth') // Most recent
      expect(executedMigrations[1].filename).to.eq('20240102000000-second')
      expect(executedMigrations[2].filename).to.eq('20240101000000-first') // Oldest
    })
  })

  describe('getLastExecutedMigration', () => {
    it('Should return the most recently completed migration', async () => {
      const now = dayjs.utc()

      await Models.Migration.create({
        filename: '20240101000000-first',
        status: IMigrationStatus.COMPLETED,
        executedAt: now.subtract(2, 'days').toDate(),
      })
      await Models.Migration.create({
        filename: '20240102000000-second',
        status: IMigrationStatus.FAILED,
        executedAt: now.subtract(1, 'day').toDate(),
      })
      await Models.Migration.create({
        filename: '20240103000000-third',
        status: IMigrationStatus.COMPLETED,
        executedAt: now.toDate(),
      })

      const lastExecuted = await Models.Migration.getLastExecutedMigration()

      expect(lastExecuted?.filename).to.eq('20240103000000-third')
    })

    it('Should return null when no completed migrations', async () => {
      await Models.Migration.create({
        filename: '20240101000000-first',
        status: IMigrationStatus.FAILED,
      })

      const lastExecuted = await Models.Migration.getLastExecutedMigration()
      expect(lastExecuted).to.be.null
    })
  })

  describe('markAsRunning', () => {
    it('Should mark migration as running with start time', async () => {
      const migration = await Models.Migration.create(rawMigration)
      const beforeMark = new Date()

      await migration.markAsRunning()

      expect(migration.status).to.eq(IMigrationStatus.RUNNING)
      expect(migration.startedAt).to.be.instanceOf(Date)
      expect(migration.startedAt!.getTime()).to.be.at.least(beforeMark.getTime())
    })
  })

  describe('markAsCompleted', () => {
    it('Should mark migration as completed with execution time', async () => {
      const migration = await Models.Migration.create(rawMigration)

      // First mark as running
      await migration.markAsRunning()
      const startTime = migration.startedAt!

      // Wait a bit to have some execution time
      await new Promise(resolve => setTimeout(resolve, 100))

      await migration.markAsCompleted()

      expect(migration.status).to.eq(IMigrationStatus.COMPLETED)
      expect(migration.executedAt).to.be.instanceOf(Date)
      expect(migration.executionTimeMs).to.be.a('number')
      expect(migration.executionTimeMs).to.be.at.least(100)
      expect(migration.error).to.be.null
      expect(migration.errorStack).to.be.null
    })

    it('Should handle completion without startedAt', async () => {
      const migration = await Models.Migration.create(rawMigration)

      await migration.markAsCompleted()

      expect(migration.status).to.eq(IMigrationStatus.COMPLETED)
      expect(migration.executedAt).to.be.instanceOf(Date)
      expect(migration.executionTimeMs).to.be.null
    })
  })

  describe('markAsFailed', () => {
    it('Should mark migration as failed with error details', async () => {
      const migration = await Models.Migration.create(rawMigration)
      const testError = new Error('Test migration error')
      testError.stack = 'Error: Test migration error\n    at Test.run'

      // First mark as running
      await migration.markAsRunning()

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100))

      await migration.markAsFailed(testError)

      expect(migration.status).to.eq(IMigrationStatus.FAILED)
      expect(migration.executedAt).to.be.instanceOf(Date)
      expect(migration.executionTimeMs).to.be.a('number')
      expect(migration.executionTimeMs).to.be.at.least(100)
      expect(migration.error).to.eq('Test migration error')
      expect(migration.errorStack).to.eq('Error: Test migration error\n    at Test.run')
    })

    it('Should handle error without stack', async () => {
      const migration = await Models.Migration.create(rawMigration)
      const testError = new Error('Test migration error')
      delete testError.stack

      await migration.markAsFailed(testError)

      expect(migration.status).to.eq(IMigrationStatus.FAILED)
      expect(migration.error).to.eq('Test migration error')
      expect(migration.errorStack).to.be.null
    })
  })

  describe('filterKeys', () => {
    it('Should filter out _id and __v', async () => {
      const migration = await Models.Migration.create(rawMigration)
      const filtered = migration.filterKeys()

      expect(filtered._id).to.be.undefined
      expect(filtered.__v).to.be.undefined
      expect(filtered.filename).to.eq(migration.filename)
      expect(filtered.status).to.eq(migration.status)
      expect(filtered.createdAt).to.exist
      expect(filtered.updatedAt).to.exist
    })

    it('Should pick only specified keys', async () => {
      const migration = await Models.Migration.create(rawMigration)
      const filtered = migration.filterKeys(['filename', 'status'])

      expect(Object.keys(filtered)).to.have.lengthOf(2)
      expect(filtered.filename).to.eq(migration.filename)
      expect(filtered.status).to.eq(migration.status)
      expect(filtered.createdAt).to.be.undefined
    })

    it('Should return empty object when picking non-existent keys', async () => {
      const migration = await Models.Migration.create(rawMigration)
      const filtered = migration.filterKeys(['nonExistentKey'])

      expect(Object.keys(filtered)).to.have.lengthOf(0)
    })
  })
})
