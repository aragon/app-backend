import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration, IPluginInterfaceType } from '@types'

const MIGRATION = '20260831194214-markCrossChainControllerSupported'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

export const markCrossChainControllerSupportedMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      const result = await Models.Plugin.collection.updateMany(
        { interfaceType: IPluginInterfaceType.crossChainController, isSupported: { $ne: true } },
        { $set: { isSupported: true } },
      )

      logger.info('Migration completed successfully', llo({ migration: MIGRATION, modified: result.modifiedCount }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default markCrossChainControllerSupportedMigration
