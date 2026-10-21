import { Models } from '@dbModels'
import { PluginHandler } from '@handlers/pluginHandler'
import ConditionDetector from '@helpers/conditionDetector'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import { LogSelectorPermission } from '@services/aragon-plugins/logSelectorPermission'
import { type IMigration, IPluginStatus } from '@types'

const MIGRATION = '20261021120000-recoverPluginExecuteCondition'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

/**
 * Sets the EXECUTE condition on an installed process row that has none, from the DAO's latest EXECUTE grant. Updated
 * plugins lost it because the update does not re-grant EXECUTE. Rows that are not a process are left alone, as the
 * Safe association clears the condition on them on purpose.
 *
 * Selector events emitted while the row had no condition found no plugin and were dropped, so the condition is
 * crawled again here rather than through the queue, as the consumers are stopped while migrations run. The crawl
 * resumes from the block its earlier run saved, which covers that gap.
 */
export const fixExecuteCondition = async (plugin: Plugin): Promise<boolean> => {
  const conditionAddress = await PluginHandler.latestExecuteCondition(plugin)
  if (!conditionAddress) return false

  const conditionInterfaceType = await ConditionDetector.detect(conditionAddress, plugin.network)
  const updated = await plugin.update({ conditionAddress, conditionInterfaceType: conditionInterfaceType ?? undefined })
  logger.info('Fixed EXECUTE condition', llo({ address: plugin.address, network: plugin.network, conditionAddress }))

  await LogSelectorPermission.start(updated)
  return true
}

export const recoverPluginExecuteConditionMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      const plugins = await Models.Plugin.find({
        status: IPluginStatus.installed,
        isProcess: true,
        conditionAddress: null,
      })

      let fixed = 0
      let errored = 0
      for (const plugin of plugins) {
        try {
          if (await fixExecuteCondition(plugin)) fixed++
        } catch (error) {
          errored++
          logger.error('Failed to fix plugin', llo({ address: plugin.address, network: plugin.network, error }))
        }
      }

      if (errored > 0) {
        logger.error(
          `Failed to fix EXECUTE conditions for ${errored} plugin(s)`,
          llo({ migration: MIGRATION, errored }),
        )
      }

      logger.info(
        'Migration completed successfully',
        llo({ migration: MIGRATION, plugins: plugins.length, fixed, errored }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default recoverPluginExecuteConditionMigration
