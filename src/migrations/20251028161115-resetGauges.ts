import { EnumQueueName, type IMigration, IPluginInterfaceType } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import type Plugin from '@models/schema/plugin'
import utils from '@helpers/utils'
import GaugeHelper from '@helpers/gauge'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import RabbitMQHelper from '@helpers/rabbitMQ'
import ConfigIndexerHelper from '@helpers/configIndexer'

const llo = logger.logMeta.bind(null, { service: 'Migration: resetGauges' })

export const resetGaugesMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20251028161115-resetGauges' }))

    try {
      logger.info('Migration completed successfully', llo({ migration: '20251028161115-resetGauges' }))

      const plugins = await Models.Plugin.find({
        interfaceType: IPluginInterfaceType.gauge,
      })

      await utils.asyncParallel(
        plugins.map((plugin: Plugin) => async () => {
          await Models.ConfigIndexer.deleteOne({
            service: ConfigIndexerHelper.builders.plugin(plugin.interfaceType, plugin.network, plugin.address),
          })

          if (!plugin.iVotesAddress) {
            // fetch iVotesAddress if missing
            const iVotesAddress = await GaugeHelper.getIVotesAdapterAddress(plugin.address, plugin.network)
            await plugin.update({
              iVotesAddress: iVotesAddress!,
            })
          }

          // fetch gauge settings
          await PluginSettingHandler.gaugeSettings(plugin, {
            blockNumber: plugin.blockNumber,
            transactionHash: plugin.transactionHash,
          } as any)

          // delete all data
          await Models.Gauge.deleteMany({ pluginAddress: plugin.address, network: plugin.network })
          await Models.GaugeMetrics.deleteMany({ pluginAddress: plugin.address, network: plugin.network })
          await Models.VoteGauge.deleteMany({ pluginAddress: plugin.address, network: plugin.network })

          await plugin.update({
            isBody: false,
            isProcess: false,
            isSubPlugin: false,
          })
          // re-sync
          await RabbitMQHelper.sendMessage(EnumQueueName.plugins, {
            id: plugin.address,
            params: { address: plugin.address, network: plugin.network },
          })
        }),
        (error: any) => {
          logger.error('Migration reset error', llo({ migration: '20251028161115-resetGauges', error }))
        },
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20251028161115-resetGauges', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default resetGaugesMigration
