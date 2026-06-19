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
  // biome-ignore lint/suspicious/noConsole: CLI script output
  console.error('❌ Error: Please provide a migration name')
  // biome-ignore lint/suspicious/noConsole: CLI script output
  console.error('Usage: pnpm mig:create <migration-name>')
  process.exit(1)
}

// Validate migration name (alphanumeric and hyphens only)
if (!/^[a-zA-Z0-9-]+$/.test(migrationName)) {
  // biome-ignore lint/suspicious/noConsole: CLI script output
  console.error('❌ Error: Migration name should only contain alphanumeric characters and hyphens')
  process.exit(1)
}

// Generate timestamp and filename
const timestamp = format(new Date(), 'yyyyMMddHHmmss')
const filename = `${timestamp}-${migrationName}`
const filepath = path.join(MIGRATIONS_DIR, `${filename}.ts`)

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

// Write migration file, the wx flag fails when the file already exists to avoid a check-then-write race
try {
  fs.writeFileSync(filepath, template, { flag: 'wx' })
  // biome-ignore lint/suspicious/noConsole: CLI script output
  console.log(`✅ Created migration: ${filepath}`)
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
    // biome-ignore lint/suspicious/noConsole: CLI script output
    console.error(`❌ Error: Migration file already exists: ${filename}.ts`)
  } else {
    // biome-ignore lint/suspicious/noConsole: CLI script output
    console.error('❌ Error creating migration file:', error)
  }
  process.exit(1)
}
