import { Models } from '@dbModels'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import logger from '@logger'
import type Setting from '@models/schema/setting'
import DBCrawler from '@models/utils/crawler'
import { type IMigration, ISettingStatus, VotingBodyBrandIdentity } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: addExternalBodyProposalCondition' })

const MIGRATION_NAME = '20260717100000-addExternalBodyProposalCondition'

export const addExternalBodyProposalConditionMigration: IMigration = {
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
          skipped++
          logger.warn(
            'SPP plugin or its rule condition not found, skipping setting',
            llo({ pluginAddress: setting.pluginAddress, network: setting.network }),
          )
          return
        }

        const stages = setting.toObject().stages
        await PluginSettingHandler.attachExternalBodyConditions(sppPlugin, stages, setting.network)
        await setting.update({ stages })
        updated++

        logger.verbose('Processed document', llo({ pluginAddress: setting.pluginAddress, network: setting.network }))
      },
      onError: (error: any, document: any) => {
        errored++
        logger.error(
          'Error backfilling external body condition',
          llo({
            error,
            pluginAddress: document.pluginAddress,
            network: document.network,
          }),
        )
      },

      where: {
        status: ISettingStatus.active,
        stages: {
          $elemMatch: {
            plugins: {
              $elemMatch: {
                brandId: VotingBodyBrandIdentity.SAFE,
                $or: [
                  { proposalCreationConditionAddress: null },
                  { proposalCreationConditionAddress: { $exists: false } },
                ],
              },
            },
          },
        },
      },
      batchSize: 200,
      concurrency: 10,
    })

    await crawler.crawl()

    const summary = { migration: MIGRATION_NAME, processed, updated, skipped, errored }
    if (skipped > 0 || errored > 0) {
      logger.error('Migration completed with unprocessed settings', llo(summary))
    } else {
      logger.info('Migration completed successfully', llo(summary))
    }
  },

  stop: async () => {},
}

export default addExternalBodyProposalConditionMigration
