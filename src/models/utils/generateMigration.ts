import fs from 'fs'
import path from 'path'

// Resolve the migrations directory relative to this file:
//   src/models/utils -> .. -> src/models/migrations
const migrationsDir = path.join(__dirname, '..', 'migrations')

// Ensure the migrations directory exists
if (!fs.existsSync(migrationsDir)) {
  fs.mkdirSync(migrationsDir)
}

const migrationName = process.argv[2]

if (!migrationName) {
  console.error('Please provide a migration name.') // eslint-disable-line no-console
  process.exit(1)
}

const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '')
const fileName = `${timestamp}_${migrationName}.ts`

// Template for the migration file
const template = `
import { MongoClient } from 'mongodb';

export async function up(db: MongoClient): Promise<void> {
  // TODO: Add "up" migration logic here
}

export async function down(db: MongoClient): Promise<void> {
  // TODO: Add "down" (rollback) logic here
}
`

fs.writeFileSync(path.join(migrationsDir, fileName), template.trim())

console.log(`Migration file created at: src/models/migrations/${fileName}`) // eslint-disable-line no-console
