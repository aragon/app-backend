import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { EXECUTE_PERMISSION_ID } from '@modules/safe/safeDaoAssociations'
import {
  EnumQueueName,
  type HexAddress,
  IEventLogPermission,
  type IMigration,
  IPluginStatus,
  type NetworksEnum,
} from '@types'

const MIGRATION = '20261021120000-inheritUpdatedPluginExecuteCondition'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

/**
 * Puts the EXECUTE condition back on the installed row of an updated plugin, from the latest row the updates
 * deprecated that still had one. Only when the DAO's latest EXECUTE event for the plugin is still a grant with that
 * condition, so a condition revoked or cleared after the update is not brought back.
 *
 * Selector events emitted while the installed row had no condition found no plugin and were dropped, so the
 * condition is crawled again. The crawl resumes from the block its earlier run saved, which covers that gap.
 */
export const fixExecuteCondition = async (
  network: NetworksEnum,
  address: HexAddress,
  daoAddress: HexAddress,
): Promise<boolean> => {
  const installed = await Models.Plugin.findOne({ network, address, daoAddress, status: IPluginStatus.installed })
  if (!installed || installed.conditionAddress) return false

  const previous = await Models.Plugin.findOne({
    network,
    address,
    daoAddress,
    status: IPluginStatus.deprecated,
    conditionAddress: { $ne: null },
    blockNumber: { $lt: installed.blockNumber },
  }).sort({ blockNumber: -1 })
  if (!previous) return false

  const latestExecute = await Models.DaoPermission.findOne({
    network,
    daoAddress,
    whoAddress: address,
    permissionId: EXECUTE_PERMISSION_ID,
  }).sort({ blockNumber: -1, transactionIndex: -1, logIndex: -1 })

  if (
    latestExecute?.event !== IEventLogPermission.Granted ||
    latestExecute.conditionAddress?.toLowerCase() !== previous.conditionAddress?.toLowerCase()
  ) {
    logger.warn('Skipped plugin, its EXECUTE grant does not match the previous row', llo({ address, network }))
    return false
  }

  await installed.update({
    conditionAddress: previous.conditionAddress,
    conditionInterfaceType: previous.conditionInterfaceType,
  })
  logger.info('Fixed EXECUTE condition', llo({ address, network, conditionAddress: previous.conditionAddress }))

  await RabbitMQHelper.sendMessage(EnumQueueName.logSelectorPermission, {
    id: `${installed.id}-${previous.conditionAddress}`,
    params: { address, network, daoAddress, conditionAddress: previous.conditionAddress },
  })
  return true
}

export const inheritUpdatedPluginExecuteConditionMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      const plugins = await Models.Plugin.aggregate([
        { $match: { status: IPluginStatus.deprecated, conditionAddress: { $ne: null } } },
        { $group: { _id: { network: '$network', address: '$address', daoAddress: '$daoAddress' } } },
      ])

      let fixed = 0
      let errored = 0
      for (const { _id } of plugins) {
        try {
          if (await fixExecuteCondition(_id.network, _id.address, _id.daoAddress)) fixed++
        } catch (error) {
          errored++
          logger.error('Failed to fix plugin', llo({ address: _id.address, network: _id.network, error }))
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

export default inheritUpdatedPluginExecuteConditionMigration
