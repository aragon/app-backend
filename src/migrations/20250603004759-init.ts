import { EnumConnection, type IService } from '@types'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'Migration: init' })

export const initMigration: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB],

  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250603004759-init' }))

    try {
      logger.info('Migration completed successfully', llo({ migration: '20250603004759-init' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250603004759-init', error }))
      throw error
    }
  },

  stop: async () => {},
}

export default initMigration
