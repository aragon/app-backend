import logger from '@logger'
import { EnumQueueName, IPluginInterfaceType, IPluginStatus } from '@types'
import { Models } from '@dbModels'
import { NetworkHelper } from '@helpers/network'
import { RabbitMQHelper } from '@helpers/radditMQ'
import type Plugin from '@models/schema/plugin'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:SyncAll' })

export const SyncAll = {
  start: async () => {
    logger.verbose('Start SyncAll', llo())

    const networks = NetworkHelper.supportedNetworks()

    await Promise.all(
      networks.map(async ({ networkName }) => {
        const plugins = await Models.Plugin.find({
          network: networkName,
          interfaceType: { $ne: IPluginInterfaceType.unknown },
          status: IPluginStatus.installed,
        }).sort({ blockNumber: -1 })

        await Promise.all(
          plugins.map(async (plugin: Plugin) => {
            await RabbitMQHelper.sendMessage(EnumQueueName.plugins, {
              id: plugin.address,
              params: { address: plugin.address, network: plugin.network },
            })
          }),
        )
      }),
    )

    logger.verbose('End SyncAll', llo())
  },
}
