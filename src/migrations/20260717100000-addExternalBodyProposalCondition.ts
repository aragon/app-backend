import { Models } from '@dbModels'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import logger from '@logger'
import type Setting from '@models/schema/setting'
import DBCrawler from '@models/utils/crawler'
import { type IMigration, ISettingStatus, VotingBodyBrandIdentity } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: addExternalBodyProposalCondition' })

export const addExternalBodyProposalConditionMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260717100000-addExternalBodyProposalCondition' }))

    const crawler = new DBCrawler({
      model: Models.Setting,
      onDocument: async (setting: Setting) => {
        const sppPlugin = await Models.Plugin.findByAddress(setting.pluginAddress, setting.network)
        if (!sppPlugin?.proposalCreationConditionAddress) {
          logger.warn(
            'SPP plugin or its rule condition not found, skipping setting',
            llo({ pluginAddress: setting.pluginAddress, network: setting.network }),
          )
          return
        }

        const stages = setting.toObject().stages
        await PluginSettingHandler.attachExternalBodyConditions(sppPlugin, stages, setting.network)
        await setting.update({ stages })

        logger.verbose(
          'Processed document',
          llo({ pluginAddress: setting.pluginAddress, network: setting.network }),
        )
      },
      onError: (error: any, document: any) => {
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
    logger.info(
      'Migration completed successfully',
      llo({ migration: '20260717100000-addExternalBodyProposalCondition' }),
    )
  },

  stop: async () => {},
}

export default addExternalBodyProposalConditionMigration
