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
    console.log('\n📊 Migration Status:') // eslint-disable-line no-console
    console.log('─'.repeat(40)) // eslint-disable-line no-console
    console.log(`Total migrations:     ${status.total}`) // eslint-disable-line no-console
    console.log(`✅ Completed:         ${status.completed}`) // eslint-disable-line no-console
    console.log(`❌ Failed:            ${status.failed}`) // eslint-disable-line no-console
    console.log(`⏳ Pending:           ${status.pending}`) // eslint-disable-line no-console

    if (status.lastExecuted) {
      console.log('\n📅 Last executed:') // eslint-disable-line no-console
      console.log(`   ${status.lastExecuted.filename}`) // eslint-disable-line no-console
      console.log(`   ${status.lastExecuted.executedAt.toLocaleString()}`) // eslint-disable-line no-console
    }

    console.log('─'.repeat(40)) // eslint-disable-line no-console

    // Close connections
    await Connections.close()
    process.exit(0)
  } catch (error) {
    logger.error('Failed to get migration status', llo({ error }))
    process.exit(1)
  }
}

showMigrationStatus()
