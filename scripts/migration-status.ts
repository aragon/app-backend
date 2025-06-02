#!/usr/bin/env node
import { EnumConnection } from '@types'
import Connections from '@modules/connections'
import MigrationService from '@modules/migration'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'migration-status' })

async function showMigrationStatus() {
  try {
    // Open database connection
    await Connections.open([EnumConnection.MONGODB])

    // Get migration status
    const status = await MigrationService.getMigrationStatus()

    // Display status
    console.log('\n📊 Migration Status:')
    console.log('─'.repeat(40))
    console.log(`Total migrations:     ${status.total}`)
    console.log(`✅ Completed:         ${status.completed}`)
    console.log(`❌ Failed:            ${status.failed}`)
    console.log(`⏳ Pending:           ${status.pending}`)

    if (status.lastExecuted) {
      console.log('\n📅 Last executed:')
      console.log(`   ${status.lastExecuted.filename}`)
      console.log(`   ${status.lastExecuted.executedAt.toLocaleString()}`)
    }

    console.log('─'.repeat(40))

    // Close connections
    await Connections.close()
    process.exit(0)
  } catch (error) {
    logger.error('Failed to get migration status', llo({ error }))
    process.exit(1)
  }
}

showMigrationStatus()
