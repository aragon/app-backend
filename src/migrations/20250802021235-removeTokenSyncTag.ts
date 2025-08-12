import { type IMigration } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import type ConfigIndexer from '@models/schema/configIndexer'

const llo = logger.logMeta.bind(null, { service: 'Migration: removeTokenSyncTag' })

export enum ITokenSyncTagName {
  delegates = 'delegates',
  transfers = 'transfers',
  holders = 'holders',
}

export const removeTokenSyncTagMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250802021235-removeTokenSyncTag' }))

    try {
      // Find all services with ITokenSyncTagName suffixes
      const syncTags = Object.values(ITokenSyncTagName)
      const regexPattern = `-(${syncTags.join('|')})$`

      const servicesWithTags = await Models.ConfigIndexer.find({
        service: { $regex: regexPattern },
      })

      logger.info(
        'Found services with sync tags',
        llo({
          count: servicesWithTags.length,
          services: servicesWithTags.map(s => s.service),
        }),
      )

      if (servicesWithTags.length === 0) {
        logger.info('No services found with sync tags', llo({}))
        return
      }

      // Update each service to remove the sync tag suffix
      const updatePromises = servicesWithTags.map(async (configIndexer: ConfigIndexer) => {
        const oldService = configIndexer.service!
        const newService = oldService.replace(new RegExp(regexPattern), '')

        logger.info(
          'Updating service',
          llo({
            oldService,
            newService,
            id: configIndexer._id,
          }),
        )

        return Models.ConfigIndexer.updateOne({ _id: configIndexer._id }, { $set: { service: newService } })
      })

      const results = await Promise.all(updatePromises)
      const totalUpdated = results.reduce((sum, result) => sum + result.modifiedCount, 0)

      logger.info(
        'Migration completed successfully',
        llo({
          migration: '20250802021235-removeTokenSyncTag',
          totalFound: servicesWithTags.length,
          totalUpdated,
        }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250802021235-removeTokenSyncTag', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default removeTokenSyncTagMigration
