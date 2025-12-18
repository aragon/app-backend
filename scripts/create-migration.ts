#!/usr/bin/env node
import { format } from 'date-fns'
import * as fs from 'fs'
import * as path from 'path'

const MIGRATIONS_DIR = path.join(__dirname, '../src/migrations')

// Ensure migrations directory exists
if (!fs.existsSync(MIGRATIONS_DIR)) {
  fs.mkdirSync(MIGRATIONS_DIR, { recursive: true })
}

// Get migration name from command line arguments
const migrationName = process.argv[2]

if (!migrationName) {
  process.exit(1)
}

// Validate migration name (alphanumeric and hyphens only)
if (!/^[a-zA-Z0-9-]+$/.test(migrationName)) {
  process.exit(1)
}

// Generate timestamp and filename
const timestamp = format(new Date(), 'yyyyMMddHHmmss')
const filename = `${timestamp}-${migrationName}`
const filepath = path.join(MIGRATIONS_DIR, `${filename}.ts`)

// Check if file already exists
if (fs.existsSync(filepath)) {
  process.exit(1)
}

const template = `import { EnumConnection, type IMigration } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'

const llo = logger.logMeta.bind(null, { service: 'Migration: ${migrationName}' })

export const ${migrationName}Migration: IMigration = {

  start: async () => {
    logger.info('Starting migration', llo({ migration: '${filename}' }))
    
    try {
      // TODO: Implement your migration logic here
      logger.info('Migration completed successfully', llo({ migration: '${filename}' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '${filename}', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default ${migrationName}Migration
`

// Write migration file
try {
  fs.writeFileSync(filepath, template)
} catch (_error) {
  process.exit(1)
}
