import { Models } from '@dbModels'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import logger from '@logger'
import type Setting from '@models/schema/setting'
import DBCrawler from '@models/utils/crawler'
import { type IMigration, ISettingStatus } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: addSppExternalProposers' })

const MIGRATION_NAME = '20260722120000-addSppExternalProposers'

export const addSppExternalProposersMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION_NAME }))

    let processed = 0
    let updated = 0
    let skipped = 0
    let errored = 0

    const crawler = new DBCrawler({
      model: Models.Setting,
      onDocument: async (setting: Setting) => {
        processed++

        const sppPlugin = await Models.Plugin.findByAddress(setting.pluginAddress, setting.network)
        if (!sppPlugin?.proposalCreationConditionAddress) {
          // No rule condition -> no external proposers possible. Set the field so it is not reprocessed.
          await setting.update({ externalProposers: [] })
          skipped++
          logger.verbose(
            'SPP plugin or its rule condition not found, no external proposers',
            llo({ pluginAddress: setting.pluginAddress, network: setting.network }),
          )
          return
        }

        const stages = setting.toObject().stages
        const externalProposers = await PluginSettingHandler.attachExternalBodyConditions(
          sppPlugin,
          stages,
          setting.network,
        )

        if (externalProposers === undefined) {
          // Resolution failed - leave the field unset (not []) so this document is picked up again
          // by a future backfill instead of being wrongly marked as "zero external proposers".
          errored++
          logger.warn(
            'Failed to resolve external proposers, leaving unset for retry',
            llo({ pluginAddress: setting.pluginAddress, network: setting.network }),
          )
          return
        }

        await setting.update({ externalProposers })
        updated++

        logger.verbose('Processed document', llo({ pluginAddress: setting.pluginAddress, network: setting.network }))
      },
      onError: (error: any, document: any) => {
        errored++
        logger.error(
          'Error backfilling external proposers',
          llo({
            error,
            pluginAddress: document.pluginAddress,
            network: document.network,
          }),
        )
      },

      where: {
        status: ISettingStatus.active,
        stages: { $exists: true, $ne: [] },
        externalProposers: { $exists: false },
      },
      batchSize: 200,
      concurrency: 10,
    })

    await crawler.crawl()

    const summary = { migration: MIGRATION_NAME, processed, updated, skipped, errored }
    if (errored > 0) {
      logger.error('Migration completed with errors', llo(summary))
    } else {
      logger.info('Migration completed successfully', llo(summary))
    }
  },

  stop: async () => {},
}

export default addSppExternalProposersMigration
