import { Models } from '@dbModels'
import ConditionDetector from '@helpers/conditionDetector'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import { EXECUTE_PERMISSION_ID } from '@modules/safe/safeDaoAssociations'
import { LogSelectorPermission } from '@services/aragon-plugins/logSelectorPermission'
import {
  type HexAddress,
  ICollectionNames,
  IEventLogPermission,
  type IMigration,
  IPluginStatus,
  type NetworksEnum,
} from '@types'

const MIGRATION = '20261021120000-recoverPluginExecuteCondition'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

type FixRow = { network: NetworksEnum; daoAddress: HexAddress; address: HexAddress; conditionAddress: HexAddress }

const latestSort = { blockNumber: -1, transactionIndex: -1, logIndex: -1 } as const

/**
 * Sets the EXECUTE condition on an installed process row that has none, from the DAO's latest EXECUTE grant. Updated
 * plugins lost it because the update does not re-grant EXECUTE. Rows that are not a process are left alone, as the
 * Safe association clears the condition on them on purpose.
 *
 * A pair is fixed only when its latest EXECUTE event is still a grant carrying a condition, so a later revoke leaves
 * the row alone. The condition address comes out of the pipeline, so there is no per-row chain read.
 *
 * Selector events emitted while the row had no condition found no plugin and were dropped, so the condition is
 * crawled again here rather than through the queue, as the consumers are stopped while migrations run. The crawl
 * resumes from the block its earlier run saved, which covers that gap.
 */
export const fixExecuteCondition = async (plugin: Plugin, conditionAddress: HexAddress): Promise<void> => {
  const conditionInterfaceType = await ConditionDetector.detect(conditionAddress, plugin.network)
  const updated = await plugin.update({ conditionAddress, conditionInterfaceType: conditionInterfaceType ?? undefined })
  logger.info('Fixed EXECUTE condition', llo({ address: plugin.address, network: plugin.network, conditionAddress }))

  await LogSelectorPermission.start(updated)
}

export const recoverPluginExecuteConditionMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      const rows = (await Models.DaoPermission.aggregate([
        { $match: { permissionId: EXECUTE_PERMISSION_ID, conditionAddress: { $ne: null } } },
        { $group: { _id: { network: '$network', daoAddress: '$daoAddress', whoAddress: '$whoAddress' } } },

        {
          $lookup: {
            from: ICollectionNames.DaoPermission,
            let: { n: '$_id.network', d: '$_id.daoAddress', w: '$_id.whoAddress' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$network', '$$n'] },
                      { $eq: ['$daoAddress', '$$d'] },
                      { $eq: ['$whoAddress', '$$w'] },
                    ],
                  },
                  permissionId: EXECUTE_PERMISSION_ID,
                },
              },
              { $sort: latestSort },
              { $limit: 1 },
              { $project: { _id: 0, event: 1, conditionAddress: 1 } },
            ],
            as: 'latest',
          },
        },
        { $set: { latest: { $first: '$latest' } } },
        { $match: { 'latest.event': IEventLogPermission.Granted, 'latest.conditionAddress': { $ne: null } } },

        {
          $lookup: {
            from: ICollectionNames.Plugin,
            let: { n: '$_id.network', d: '$_id.daoAddress', a: '$_id.whoAddress' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ['$network', '$$n'] }, { $eq: ['$daoAddress', '$$d'] }, { $eq: ['$address', '$$a'] }],
                  },
                  status: IPluginStatus.installed,
                  isProcess: true,
                  conditionAddress: null,
                },
              },
              { $project: { _id: 0, id: 1 } },
            ],
            as: 'plugin',
          },
        },
        { $match: { 'plugin.0': { $exists: true } } },
        {
          $project: {
            _id: 0,
            network: '$_id.network',
            daoAddress: '$_id.daoAddress',
            address: '$_id.whoAddress',
            conditionAddress: '$latest.conditionAddress',
          },
        },
      ])) as FixRow[]

      let fixed = 0
      let errored = 0
      for (const row of rows) {
        try {
          const plugin = await Models.Plugin.findOne({
            network: row.network,
            daoAddress: row.daoAddress,
            address: row.address,
            status: IPluginStatus.installed,
            isProcess: true,
          })
          if (!plugin) continue

          await fixExecuteCondition(plugin, row.conditionAddress)
          fixed++
        } catch (error) {
          errored++
          logger.error('Failed to fix plugin', llo({ address: row.address, network: row.network, error }))
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
        llo({ migration: MIGRATION, plugins: rows.length, fixed, errored }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default recoverPluginExecuteConditionMigration
