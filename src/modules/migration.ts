import { Models } from '@dbModels'
import logger from '@logger'
import Mongo from '@modules/mongo'
import { EnumConnection, EnumServiceName, IMigrationStatus, type IService } from '@types'
import * as fs from 'fs'
import { glob } from 'glob'
import * as path from 'path'

const llo = logger.logMeta.bind(null, { service: 'MigrationService' })

class MigrationService implements IService {
  name: EnumServiceName = EnumServiceName.ARAGON_MIGRATION
  NEED_CONNECTIONS = [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ]
  options = { mongoSync: false }
  private readonly migrationsPath = path.resolve(process.cwd(), 'src/migrations')
  private isRunning = false
  private onComplete?: () => void

  async start(): Promise<void> {
    logger.info('Starting Migration Service', llo({}))

    try {
      // Run migrations
      await this.runPendingMigrations()

      logger.info('Migration Service completed', llo({}))

      // Trigger completion callback if set
      if (this.onComplete) {
        this.onComplete()
      }
    } catch (error) {
      logger.error('Migration Service failed', llo({ error }))
      throw error
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false
    logger.info('Stopping Migration Service', llo({}))
  }

  setOnComplete(callback: () => void): void {
    this.onComplete = callback
  }

  private async runPendingMigrations(): Promise<void> {
    this.isRunning = true

    // Get all migration files
    const migrationFiles = await this.getMigrationFiles()
    logger.info('Found migration files', llo({ count: migrationFiles.length }))

    // Get executed migrations from database
    const executedMigrations = await Models.Migration.find({
      status: { $in: [IMigrationStatus.COMPLETED, IMigrationStatus.RUNNING] },
    }).select('filename')

    const executedFilenames = new Set(executedMigrations.map((m: { filename: any }) => m.filename))

    // Filter pending migrations
    const pendingMigrations = migrationFiles.filter(file => !executedFilenames.has(file))

    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations found', llo({}))
      return
    }

    logger.info(
      'Pending migrations',
      llo({
        count: pendingMigrations.length,
        migrations: pendingMigrations,
      }),
    )

    // Execute migrations sequentially
    for (const filename of pendingMigrations) {
      if (!this.isRunning) {
        logger.warn('Migration service stopped, aborting migrations', llo({}))
        break
      }

      await this.executeMigration(filename)
    }

    // Sync MongoDB indexes after migrations
    await Mongo.syncIndexes()
  }

  private async getMigrationFiles(): Promise<string[]> {
    const pattern = path.join(this.migrationsPath, '*.ts')
    const files = await glob(pattern)

    return files
      .map(file => path.basename(file, '.ts'))
      .filter(filename => /^[0-9]{6,}-[^.]+$/.test(filename))
      .sort() // Sort by timestamp
  }

  private async executeMigration(filename: string): Promise<void> {
    logger.info('Executing migration', llo({ filename }))

    // Create or update migration record
    let migration = await Models.Migration.findOne({ filename })
    if (!migration) {
      migration = await Models.Migration.create({ filename })
    }

    // Skip if already completed
    if (migration.status === IMigrationStatus.COMPLETED) {
      logger.info('Migration already completed, skipping', llo({ filename }))
      return
    }

    // Mark as running
    await migration.markAsRunning()

    try {
      // Dynamically import migration file
      const migrationPath = path.join(this.migrationsPath, `${filename}.ts`)

      if (!fs.existsSync(migrationPath)) {
        throw new Error(`Migration file not found: ${migrationPath}`)
      }

      const migrationModule = await import(migrationPath)
      const migrationService = migrationModule.default as IService

      if (!migrationService || typeof migrationService.start !== 'function') {
        throw new Error(`Invalid migration file structure: ${filename}`)
      }

      // Execute migration
      await migrationService.start()

      // Mark as completed
      await migration.markAsCompleted()
      logger.info('Migration completed successfully', llo({ filename }))
    } catch (error) {
      // Mark as failed
      await migration.markAsFailed(error as Error)
      logger.error('Migration failed', llo({ filename, error }))

      // Re-throw to stop the migration process
      throw error
    }
  }

  async getMigrationStatus(): Promise<{
    total: number
    completed: number
    failed: number
    pending: number
    lastExecuted?: {
      filename: string
      executedAt: Date
    }
  }> {
    const [allFiles, migrations, lastExecuted] = await Promise.all([
      this.getMigrationFiles(),
      Models.Migration.find({}),
      Models.Migration.getLastExecutedMigration(),
    ])

    const migrationMap = new Map(migrations.map(m => [m.filename, m.status]))

    const stats = {
      total: allFiles.length,
      completed: 0,
      failed: 0,
      pending: 0,
      lastExecuted: lastExecuted
        ? {
            filename: lastExecuted.filename,
            executedAt: lastExecuted.executedAt!,
          }
        : undefined,
    }

    allFiles.forEach(filename => {
      const status = migrationMap.get(filename)
      if (status === IMigrationStatus.COMPLETED) {
        stats.completed++
      } else if (status === IMigrationStatus.FAILED) {
        stats.failed++
      } else {
        stats.pending++
      }
    })

    return stats
  }
}

export default new MigrationService()
