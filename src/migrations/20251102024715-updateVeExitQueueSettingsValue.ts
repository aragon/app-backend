import { type IMigration, IPluginInterfaceType, ISettingStatus, NetworksEnum } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'

const llo = logger.logMeta.bind(null, { service: 'Migration: updateVeExitQueueSettingsValue' })

export const updateVeExitQueueSettingsValueMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20251102024715-updateVeExitQueueSettingsValue' }))

    try {
      const plugins = await Models.Plugin.find({
        votingEscrow: { $ne: null },
        interfaceType: IPluginInterfaceType.tokenVoting,
        network: NetworksEnum.ethereumSepolia,
        blockNumber: { $gt: 9332876 },
      })

      for (const plugin of plugins) {
        const settings = await Models.Setting.findOne({
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          status: ISettingStatus.active,
        })

        const votingEscrowSettings = await PluginSettingHandler.votingEscrowSettings(plugin, {
          network: plugin.network,
        } as any)

        if (settings) {
          settings.votingEscrow = votingEscrowSettings
          await settings.save()
          logger.info(
            'Updated votingEscrow settings for plugin',
            llo({ pluginAddress: plugin.address, daoAddress: plugin.daoAddress }),
          )
        }
      }

      logger.info(
        'Migration completed successfully',
        llo({ migration: '20251102024715-updateVeExitQueueSettingsValue' }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20251102024715-updateVeExitQueueSettingsValue', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default updateVeExitQueueSettingsValueMigration
