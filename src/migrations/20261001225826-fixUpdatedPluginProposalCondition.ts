import { Models } from '@dbModels'
import { PluginHandler } from '@handlers/pluginHandler'
import logger from '@logger'
import { type HexAddress, IEventLogPluginType, type IMigration, IPluginStatus, type NetworksEnum } from '@types'

const MIGRATION = '20261001225826-fixUpdatedPluginProposalCondition'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

export const fixProposalCondition = async (address: HexAddress, network: NetworksEnum): Promise<boolean> => {
  const [firstRow, installed, updates] = await Promise.all([
    Models.Plugin.findOne({ network, address }).sort({ blockNumber: 1 }),
    Models.Plugin.findOne({ network, address, status: IPluginStatus.installed }),
    Models.LogPluginSetupProcessor.find({
      network,
      pluginAddress: address,
      event: IEventLogPluginType.UpdateApplied,
    }).sort({ blockNumber: 1, transactionIndex: 1, logIndex: 1 }),
  ])

  if (!firstRow || !installed || installed.transactionHash !== updates[updates.length - 1].transactionHash) {
    logger.warn('Skipped plugin, its installed row is not the last update', llo({ address, network }))
    return false
  }

  let condition = PluginHandler.findProposalConditionAddress(firstRow.permissions || [], address)

  for (const applied of updates) {
    const prepared = await Models.LogPluginSetupProcessor.findOne({
      network,
      pluginAddress: address,
      daoAddress: applied.daoAddress,
      preparedSetupId: applied.preparedSetupId,
      event: IEventLogPluginType.UpdatePrepared,
    })

    if (!prepared) {
      logger.warn('Skipped plugin, an applied update has no preparation', llo({ address, network }))
      return false
    }

    if ((prepared.permissions || []).some(PluginHandler._isProposalGrantFor(address))) {
      condition = PluginHandler.findProposalConditionAddress(prepared.permissions, address)
    }
  }

  const saved = installed.proposalCreationConditionAddress
  if (saved === condition) return false

  await installed.update({ proposalCreationConditionAddress: condition })
  logger.info('Fixed proposal condition', llo({ address, network, from: saved, to: condition }))
  return true
}

export const fixUpdatedPluginProposalConditionMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      const updatedPlugins = await Models.LogPluginSetupProcessor.aggregate([
        { $match: { event: IEventLogPluginType.UpdateApplied } },
        { $group: { _id: { network: '$network', address: '$pluginAddress' } } },
      ])

      let fixed = 0
      let errored = 0
      for (const { _id } of updatedPlugins) {
        try {
          if (await fixProposalCondition(_id.address, _id.network)) fixed++
        } catch (error) {
          errored++
          logger.error('Failed to fix plugin', llo({ address: _id.address, network: _id.network, error }))
        }
      }

      logger.info(
        'Migration completed successfully',
        llo({ migration: MIGRATION, plugins: updatedPlugins.length, fixed, errored }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default fixUpdatedPluginProposalConditionMigration
