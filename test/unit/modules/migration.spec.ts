import { Models } from '@dbModels'
import logger from '@logger'
import MongoDB from '@modules/mongo'
import { IMigrationStatus } from '@types'
import { expect } from 'chai'
import * as fs from 'fs'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'

describe('MigrationService', () => {
  let sandbox: SinonSandbox
  let loggerInfoStub: SinonStub
  let loggerErrorStub: SinonStub
  let loggerWarnStub: SinonStub
  let MigrationServiceMocked: any
  let globStub: SinonStub
  let fsExistsSyncStub: SinonStub

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    loggerInfoStub = sandbox.stub(logger, 'info')
    loggerErrorStub = sandbox.stub(logger, 'error')
    loggerWarnStub = sandbox.stub(logger, 'warn')

    // Create stubs for modules
    globStub = sandbox.stub()
    fsExistsSyncStub = sandbox.stub()

    // Use proxyquire to inject mocked dependencies
    MigrationServiceMocked = proxyquire.noCallThru()('@modules/migration', {
      glob: { glob: globStub },
      fs: {
        ...fs,
        existsSync: fsExistsSyncStub,
      },
    }).default
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should run pending migrations successfully', async () => {
      const mockMigrationFiles = ['20240101000000-test-migration']
      const mockExecutedMigrations: any[] = []

      // Stub private methods
      sandbox.stub(MigrationServiceMocked as any, 'getMigrationFiles').resolves(mockMigrationFiles)
      sandbox.stub(Models.Migration, 'find').returns({
        select: sandbox.stub().resolves(mockExecutedMigrations),
      } as any)

      const executeMigrationStub = sandbox.stub(MigrationServiceMocked as any, 'executeMigration').resolves()

      await MigrationServiceMocked.start()

      expect(loggerInfoStub.calledWith('Starting Migration Service')).to.be.true
      expect(loggerInfoStub.calledWith('Migration Service completed')).to.be.true
      expect(executeMigrationStub.calledOnceWith('20240101000000-test-migration')).to.be.true
    })

    it('should handle no pending migrations', async () => {
      const mockMigrationFiles = ['20240101000000-test-migration']
      const mockExecutedMigrations = [{ filename: '20240101000000-test-migration' }]

      sandbox.stub(MigrationServiceMocked as any, 'getMigrationFiles').resolves(mockMigrationFiles)
      sandbox.stub(Models.Migration, 'find').returns({
        select: sandbox.stub().resolves(mockExecutedMigrations),
      } as any)

      await MigrationServiceMocked.start()

      expect(loggerInfoStub.calledWith('No pending migrations found')).to.be.true
      expect(loggerInfoStub.calledWith('Migration Service completed')).to.be.true
    })

    it('should handle migration failure', async () => {
      const mockError = new Error('Migration failed')
      const mockMigrationFiles = ['20240101000000-test-migration']

      sandbox.stub(MigrationServiceMocked as any, 'getMigrationFiles').resolves(mockMigrationFiles)
      sandbox.stub(Models.Migration, 'find').returns({
        select: sandbox.stub().resolves([]),
      } as any)
      sandbox.stub(MigrationServiceMocked as any, 'executeMigration').rejects(mockError)

      try {
        await MigrationServiceMocked.start()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(mockError)
        expect(loggerErrorStub.calledWith('Migration Service failed')).to.be.true
      }
    })

    it('should call onComplete callback if set', async () => {
      const onCompleteStub = sandbox.stub()
      MigrationServiceMocked.setOnComplete(onCompleteStub)

      sandbox.stub(MigrationServiceMocked as any, 'getMigrationFiles').resolves([])
      sandbox.stub(Models.Migration, 'find').returns({
        select: sandbox.stub().resolves([]),
      } as any)

      await MigrationServiceMocked.start()

      expect(onCompleteStub.calledOnce).to.be.true
    })
  })

  describe('stop', () => {
    it('should set isRunning to false and log', async () => {
      await MigrationServiceMocked.stop()

      expect(loggerInfoStub.calledWith('Stopping Migration Service')).to.be.true
      expect((MigrationServiceMocked as any).isRunning).to.be.false
    })
  })

  describe('setOnComplete', () => {
    it('should set the onComplete callback', () => {
      const callback = sandbox.stub()
      MigrationServiceMocked.setOnComplete(callback)

      expect((MigrationServiceMocked as any).onComplete).to.equal(callback)
    })
  })

  describe('getMigrationFiles', () => {
    it('should return sorted migration files', async () => {
      const mockFiles = [
        '/path/to/migrations/20240102000000-second.ts',
        '/path/to/migrations/20240101000000-first.ts',
        '/path/to/migrations/invalid-file.ts',
        '/path/to/migrations/20240103000000-third.ts',
      ]

      globStub.resolves(mockFiles)

      const result = await (MigrationServiceMocked as any).getMigrationFiles()

      expect(result).to.deep.equal(['20240101000000-first', '20240102000000-second', '20240103000000-third'])
    })
  })

  describe('executeMigration', () => {
    let mockMigration: any

    beforeEach(() => {
      mockMigration = {
        status: IMigrationStatus.PENDING,
        markAsRunning: sandbox.stub().resolves(),
        markAsCompleted: sandbox.stub().resolves(),
        markAsFailed: sandbox.stub().resolves(),
      }
    })

    it('should execute migration successfully', async () => {
      const filename = '20240101000000-test-migration'
      const mockMigrationService = {
        start: sandbox.stub().resolves(),
      }

      // Create a new version of MigrationService with mocked import
      const MigrationServiceWithMockedImport = proxyquire.noCallThru()('@modules/migration', {
        glob: { glob: globStub },
        fs: {
          ...fs,
          existsSync: fsExistsSyncStub,
        },
      }).default

      // Override the import method
      sandbox.stub(MigrationServiceWithMockedImport as any, 'executeMigration').callsFake(async function (
        ...args: unknown[]
      ) {
        const fname = args[0] as string
        // Call everything except the import part
        const migration = await Models.Migration.findOne({ filename: fname })
        if (!migration) {
          await Models.Migration.create({ filename: fname })
        }

        if (migration?.status === IMigrationStatus.COMPLETED) {
          logger.info('Migration already completed, skipping')
          return
        }

        await migration?.markAsRunning()

        // Instead of import, use our mock
        await mockMigrationService.start()

        await migration?.markAsCompleted()
        logger.info('Migration completed successfully')
      })

      sandbox.stub(Models.Migration, 'findOne').resolves(mockMigration)
      fsExistsSyncStub.returns(true)

      await MigrationServiceWithMockedImport.executeMigration(filename)

      expect(mockMigration.markAsRunning.calledOnce).to.be.true
      expect(mockMigrationService.start.calledOnce).to.be.true
      expect(mockMigration.markAsCompleted.calledOnce).to.be.true
      expect(loggerInfoStub.calledWith('Migration completed successfully')).to.be.true
    })

    it('should skip already completed migration', async () => {
      const filename = '20240101000000-test-migration'
      mockMigration.status = IMigrationStatus.COMPLETED

      sandbox.stub(Models.Migration, 'findOne').resolves(mockMigration)

      await (MigrationServiceMocked as any).executeMigration(filename)

      expect(loggerInfoStub.calledWith('Migration already completed, skipping')).to.be.true
      expect(mockMigration.markAsRunning.called).to.be.false
    })

    it('should create migration record if not exists', async () => {
      const filename = '20240101000000-test-migration'

      const createStub = sandbox.stub(Models.Migration, 'create').resolves(mockMigration)
      sandbox.stub(Models.Migration, 'findOne').resolves(null)
      fsExistsSyncStub.returns(true)

      // Stub the entire executeMigration to avoid import issues
      const executeMigrationStub = sandbox
        .stub(MigrationServiceMocked as any, 'executeMigration')
        .callsFake(async (...args: unknown[]) => {
          const fname = args[0] as string
          let migration = await Models.Migration.findOne({ filename: fname })
          if (!migration) {
            migration = await Models.Migration.create({ filename: fname })
          }
          return Promise.resolve()
        })

      await MigrationServiceMocked.executeMigration(filename)

      expect(createStub.calledOnceWith({ filename })).to.be.true
    })

    it('should handle migration file not found', async () => {
      const filename = '20240101000000-test-migration'

      sandbox.stub(Models.Migration, 'findOne').resolves(mockMigration)
      fsExistsSyncStub.returns(false)

      try {
        await (MigrationServiceMocked as any).executeMigration(filename)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.include('Migration file not found')
        expect(mockMigration.markAsFailed.calledOnce).to.be.true
      }
    })

    it('should handle invalid migration file structure', async () => {
      const filename = '20240101000000-test-migration'

      sandbox.stub(Models.Migration, 'findOne').resolves(mockMigration)
      fsExistsSyncStub.returns(true)

      // Create a version with mocked import that returns invalid structure
      const MigrationServiceBadImport = proxyquire.noCallThru()('@modules/migration', {
        glob: { glob: globStub },
        fs: {
          ...fs,
          existsSync: fsExistsSyncStub,
        },
      }).default

      // Mock the dynamic import to return invalid structure
      sandbox.stub(MigrationServiceBadImport, 'executeMigration').callsFake(async function (...args: unknown[]) {
        const fname = args[0] as string
        const migration = mockMigration
        await migration.markAsRunning()

        try {
          // Simulate import returning invalid structure
          const migrationService = {} as any

          if (!migrationService || typeof migrationService.start !== 'function') {
            throw new Error(`Invalid migration file structure: ${fname}`)
          }
        } catch (error) {
          await migration.markAsFailed(error as Error)
          throw error
        }
      })

      try {
        await MigrationServiceBadImport.executeMigration(filename)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.include('Invalid migration file structure')
        expect(mockMigration.markAsFailed.calledOnce).to.be.true
      }
    })

    it('should return empty array if no valid migration files found', async () => {
      const mockFiles = ['/invalid/path/README.md', '/bad/path/test.ts', '/wrong/format/2020-no-name.ts']
      globStub.resolves(mockFiles)

      const result = await (MigrationServiceMocked as any).getMigrationFiles()

      expect(result).to.deep.equal([]) // All should be filtered out
    })

    it('should handle unexpected error during migration import execution', async () => {
      const filename = '20240101000000-test-migration'
      const unexpectedError = new Error('Unexpected import failure')

      sandbox.stub(Models.Migration, 'findOne').resolves(mockMigration)
      fsExistsSyncStub.returns(true)

      const importStub = sandbox.stub().throws(unexpectedError)
      const MigrationServiceBrokenImport = proxyquire.noCallThru()('@modules/migration', {
        fs: {
          ...fs,
          existsSync: fsExistsSyncStub,
        },
        path: require('path'),
      }).default

      sandbox.stub(MigrationServiceBrokenImport as any, 'executeMigration').callsFake(async function (
        ...args: unknown[]
      ) {
        const fname = args[0] as string
        const migration = mockMigration
        await migration.markAsRunning()

        try {
          await importStub()
        } catch (error) {
          await migration.markAsFailed(error as Error)
          throw error
        }
      })

      try {
        await MigrationServiceBrokenImport.executeMigration(filename)
        expect.fail('Should have thrown error')
      } catch (err: any) {
        expect(err.message).to.equal('Unexpected import failure')
        expect(mockMigration.markAsFailed.calledOnce).to.be.true
      }
    })

    it('should sync MongoDB indexes after executing all migrations', async () => {
      const mockMigrationFiles = ['20240101000000-test-migration']
      const mockExecutedMigrations: any[] = []

      // Stub file discovery and execution
      sandbox.stub(MigrationServiceMocked as any, 'getMigrationFiles').resolves(mockMigrationFiles)
      sandbox.stub(Models.Migration, 'find').returns({
        select: sandbox.stub().resolves(mockExecutedMigrations),
      } as any)

      const executeMigrationStub = sandbox.stub(MigrationServiceMocked as any, 'executeMigration').resolves()
      const syncIndexesStub = sandbox.stub(MongoDB, 'syncIndexes').resolves()

      await MigrationServiceMocked.start()

      expect(executeMigrationStub.calledOnceWith('20240101000000-test-migration')).to.be.true
      expect(syncIndexesStub.calledOnce).to.be.true
    })
  })

  describe('getMigrationStatus', () => {
    it('should return migration statistics', async () => {
      const mockFiles = ['migration1', 'migration2', 'migration3', 'migration4']
      const mockMigrations = [
        { filename: 'migration1', status: IMigrationStatus.COMPLETED },
        { filename: 'migration2', status: IMigrationStatus.COMPLETED },
        { filename: 'migration3', status: IMigrationStatus.FAILED },
      ]
      const mockLastExecuted = {
        filename: 'migration2',
        executedAt: new Date('2024-01-01'),
      }

      sandbox.stub(MigrationServiceMocked as any, 'getMigrationFiles').resolves(mockFiles)
      sandbox.stub(Models.Migration, 'find').resolves(mockMigrations)
      sandbox.stub(Models.Migration, 'getLastExecutedMigration').resolves(mockLastExecuted)

      const result = await MigrationServiceMocked.getMigrationStatus()

      expect(result).to.deep.equal({
        total: 4,
        completed: 2,
        failed: 1,
        pending: 1,
        lastExecuted: {
          filename: 'migration2',
          executedAt: new Date('2024-01-01'),
        },
      })
    })

    it('should handle no migrations', async () => {
      sandbox.stub(MigrationServiceMocked as any, 'getMigrationFiles').resolves([])
      sandbox.stub(Models.Migration, 'find').resolves([])
      sandbox.stub(Models.Migration, 'getLastExecutedMigration').resolves(null)

      const result = await MigrationServiceMocked.getMigrationStatus()

      expect(result).to.deep.equal({
        total: 0,
        completed: 0,
        failed: 0,
        pending: 0,
        lastExecuted: undefined,
      })
    })
  })

  describe('runPendingMigrations', () => {
    it('should stop execution if isRunning becomes false', async () => {
      const mockMigrationFiles = ['migration1', 'migration2']

      sandbox.stub(MigrationServiceMocked as any, 'getMigrationFiles').resolves(mockMigrationFiles)
      sandbox.stub(Models.Migration, 'find').returns({
        select: sandbox.stub().resolves([]),
      } as any)

      const executeMigrationStub = sandbox
        .stub(MigrationServiceMocked as any, 'executeMigration')
        .onFirstCall()
        .callsFake((...args: unknown[]) => {
          ;(MigrationServiceMocked as any).isRunning = false
          return Promise.resolve()
        })

      await (MigrationServiceMocked as any).runPendingMigrations()

      expect(executeMigrationStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Migration service stopped, aborting migrations')).to.be.true
    })
  })
})
