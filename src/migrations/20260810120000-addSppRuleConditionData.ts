import { Models } from '@dbModels'
import { PluginHandler } from '@handlers/pluginHandler'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import DBCrawler from '@models/utils/crawler'
import { type IMigration, IPluginInterfaceType, IPluginStatus } from '@types'
import { ZeroAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'Migration: addSppRuleConditionData' })
const MIGRATION_NAME = '20260810120000-addSppRuleConditionData'

export const addSppRuleConditionDataMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION_NAME }))

    let processed = 0
    let updated = 0
    let errored = 0

    const crawler = new DBCrawler({
      model: Models.Plugin,
      onDocument: async (plugin: Plugin) => {
        processed++
        await PluginHandler.enrichProposalCondition(plugin, plugin.network)
        await plugin.update({
          proposalCreationConditionInterfaceType: plugin.proposalCreationConditionInterfaceType,
          proposalCreationConditionRules: plugin.proposalCreationConditionRules,
        })
        updated++
      },
      onError: (error: unknown, plugin: Plugin) => {
        errored++
        logger.error(
          'Error backfilling SPP proposal condition data',
          llo({ error, pluginAddress: plugin.address, network: plugin.network }),
        )
      },
      where: {
        status: IPluginStatus.installed,
        interfaceType: IPluginInterfaceType.spp,
        proposalCreationConditionAddress: { $exists: true, $nin: [null, ZeroAddress] },
        proposalCreationConditionInterfaceType: { $exists: false },
      },
      batchSize: 200,
      concurrency: 10,
    })

    await crawler.crawl()

    const summary = { migration: MIGRATION_NAME, processed, updated, errored }
    if (errored > 0) {
      logger.error('Migration completed with errors', llo(summary))
    } else {
      logger.info('Migration completed successfully', llo(summary))
    }
  },

  stop: async () => {},
}

export default addSppRuleConditionDataMigration
