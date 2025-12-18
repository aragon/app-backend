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

    if (status.lastExecuted) {
    }

    // Close connections
    await Connections.close()
    process.exit(0)
  } catch (error) {
    logger.error('Failed to get migration status', llo({ error }))
    process.exit(1)
  }
}

showMigrationStatus()
