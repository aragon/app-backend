#!/usr/bin/env node
import logger from '@logger'
import Connections from '@modules/connections'
import MigrationService from '@modules/migration'
import { EnumConnection } from '@types'

const llo = logger.logMeta.bind(null, { service: 'migration-status' })

async function showMigrationStatus() {
  try {
    // Open database connection
    await Connections.open([EnumConnection.MONGODB])

    // Get migration status
    const status = await MigrationService.getMigrationStatus()

    // biome-ignore lint/suspicious/noConsole: CLI script output
    console.log('\n📊 Migration Status:')
    // biome-ignore lint/suspicious/noConsole: CLI script output
    console.log('─'.repeat(40))
    // biome-ignore lint/suspicious/noConsole: CLI script output
    console.log(`Total migrations:     ${status.total}`)
    // biome-ignore lint/suspicious/noConsole: CLI script output
    console.log(`✅ Completed:         ${status.completed}`)
    // biome-ignore lint/suspicious/noConsole: CLI script output
    console.log(`❌ Failed:            ${status.failed}`)
    // biome-ignore lint/suspicious/noConsole: CLI script output
    console.log(`⏳ Pending:           ${status.pending}`)

    if (status.lastExecuted) {
      // biome-ignore lint/suspicious/noConsole: CLI script output
      console.log('\n📅 Last executed:')
      // biome-ignore lint/suspicious/noConsole: CLI script output
      console.log(`   ${status.lastExecuted.filename}`)
      // biome-ignore lint/suspicious/noConsole: CLI script output
      console.log(`   ${status.lastExecuted.executedAt.toLocaleString()}`)
    }

    // biome-ignore lint/suspicious/noConsole: CLI script output
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
