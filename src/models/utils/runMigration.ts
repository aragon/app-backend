import { EnumConnection, ICollectionNames, type IService } from '@types'
import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'models:utils:RunMigration' })

export const RunMigration: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    logger.verbose('Starting mongodb migrations...', llo())

    const db = mongoose.connection.db

    // Migrations directory
    const migrationsDir = path.join(__dirname, '..', 'migrations')

    // Ensure the migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      logger.error('Migrations directory not found.', llo({ migrationsDir }))
      return
    }

    // Fetch applied migrations from MongoDB
    const appliedMigrations = await db.collection(ICollectionNames.Migration).find({}).toArray()
    const appliedMigrationFiles = new Set(appliedMigrations.map(m => m.name))

    // Get all migration files
    const migrationFiles = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.ts'))

    // Determine pending migrations
    const pendingMigrations = migrationFiles.filter(file => !appliedMigrationFiles.has(file))

    if (pendingMigrations.length === 0) {
      logger.verbose('No pending migrations to apply.', llo())
      return
    }

    logger.verbose(`Pending migrations: ${pendingMigrations.join(', ')}`, llo())

    for (const migrationFile of pendingMigrations) {
      const migrationPath = path.join(migrationsDir, migrationFile)
      logger.verbose(`Applying migration: ${migrationFile}`, llo())

      try {
        // Dynamically import the migration
        const migration = await import(migrationPath)

        // Run the "up" migration
        if (migration.up) {
          await migration.up(db)
        } else {
          logger.warn(`Migration ${migrationFile} is missing an "up" method.`, llo())
          continue
        }

        // Record the applied migration in the database
        await db.collection('migrations').insertOne({
          name: migrationFile,
          appliedAt: new Date(),
        })

        logger.verbose(`Migration applied: ${migrationFile}`, llo())
      } catch (error) {
        logger.error(`Error applying migration ${migrationFile}:`, llo(error))
        break // Stop on failure
      }
    }

    logger.verbose('All pending migrations have been processed.', llo())
  },

  stop: async () => {},
}

export default RunMigration
