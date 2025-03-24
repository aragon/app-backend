import logger from '@logger'
import { EnumConnection, EnumQueueName, type IService } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { NetworkHelper } from '@helpers/network'
import ProviderModule from '@modules/provider'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import type Plugin from '@models/schema/plugin'
import config from '@config'
import { PluginSlug } from '@helpers/pluginSlug'

const llo = logger.logMeta.bind(null, { service: 'service:SyncService' })

export interface IExtendedService extends IService {
  execute: () => Promise<void>
}

const AragonSyncService: IExtendedService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async function () {
    logger.info('SyncService service sync start', llo({}))

    const tasks = [[{ syncPlugins: { start: AragonSyncService.execute } }]]

    const taskOptions = {
      fn: () => [...tasks],
      interval: config.SERVICES.ARAGON_SYNC.SYNC_INTERVAL,
      runNow: true,
      stopOnError: false,
      onError: (error: any) => {
        logger.error('SyncService task error', llo({ error }))
      },
    }

    const scheduler = TaskSchedulerState.getInstance()
    await scheduler.startTask('aragon-sync', taskOptions)

    logger.info('SyncService service sync end', llo({}))
  },

  async execute() {
    const networks = NetworkHelper.supportedNetworks()

    for (const { networkName } of networks) {
      const provider = ProviderModule.getAnyRpcProvider(networkName)
      if (!provider) {
        logger.error('Sync provider not available for network', llo({ network: networkName }))
        return
      }

      const plugins = await Models.Plugin.find({ forceSync: true, network: networkName })

      await Promise.all(
        plugins.map(async (plugin: Plugin) => {
          const pluginSlug = await Models.PluginSlug.findOne({
            pluginAddress: plugin.address,
            network: plugin.network,
          })

          if (!pluginSlug) {
            await PluginSlug.generateSlug(plugin, plugin?.processKey)
            logger.verbose('Force sync generate slug plugin', llo({ address: plugin.address, network: networkName }))
          }

          await RabbitMQHelper.sendMessage(EnumQueueName.plugins, {
            id: plugin.address,
            params: { address: plugin.address, network: plugin.network },
          })

          logger.verbose('Force sync new plugin', llo({ address: plugin.address, network: networkName }))
        }),
      )
    }
  },

  async stop() {
    const scheduler = TaskSchedulerState.getInstance()
    scheduler.stopTask('aragon-sync')

    logger.info('SyncService service stopped', llo({}))
  },
}

export default AragonSyncService
