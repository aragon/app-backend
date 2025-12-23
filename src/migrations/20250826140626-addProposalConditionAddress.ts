import { Models } from '@dbModels'
import { PluginHandler } from '@handlers/pluginHandler'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import DBCrawler from '@models/utils/crawler'
import { type IMigration } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: addProposalConditionAddress' })

export const addProposalConditionAddressMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250826140626-addProposalConditionAddress' }))

    const crawler = new DBCrawler({
      model: Models.Plugin,
      onDocument: async (plugin: Plugin) => {
        const permissionCondition = PluginHandler.findProposalConditionAddress(plugin.permissions)
        await plugin.update({
          proposalCreationConditionAddress: permissionCondition,
        })
        logger.verbose(
          'Processed document',
          llo({ permissionCondition, network: plugin.network, address: plugin.address }),
        )
      },
      onError: (error: any, document: any) => {
        logger.error(
          'Error update permissionCondition',
          llo({
            error,
            address: document.address,
            network: document.network,
          }),
        )
      },

      where: {},
      batchSize: 2000,
      concurrency: 200,
    })

    await crawler.crawl()
    logger.info('Migration completed successfully', llo({ migration: '20250826140626-addProposalConditionAddress' }))
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default addProposalConditionAddressMigration
