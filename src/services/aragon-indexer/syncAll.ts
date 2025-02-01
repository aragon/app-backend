import logger from '@logger'
import { EnumQueueName, ICollectionNames, IPluginInterfaceType, IPluginStatus } from '@types'
import { Models } from '@dbModels'
import { NetworkHelper } from '@helpers/network'
import { RabbitMQHelper } from '@helpers/radditMQ'
import type Plugin from '@models/schema/plugin'
import Web3Helper from '@helpers/web3'
import RabbitMQ from '@modules/rabbitMQ'
import utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:SyncAll' })

export const SyncAll = {
  start: async () => {
    logger.verbose('Start SyncAll', llo())

    const networks = NetworkHelper.supportedNetworks()

    await Promise.all(
      networks.map(async ({ networkName }) => {
        const blockNumber = await Web3Helper.getBlockNumber(undefined, networkName)
        if (!blockNumber) return

        const plugins = await Models.Plugin.aggregate([
          {
            $match: {
              network: networkName,
              status: IPluginStatus.installed,
              interfaceType: { $ne: IPluginInterfaceType.unknown },
            },
          },
          {
            $lookup: {
              from: ICollectionNames.ConfigIndexer,
              let: {
                svc: { $concat: ['$interfaceType', '-', '$network', '-', '$address'] },
                net: '$network', // pass the plugin's network too
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [{ $eq: ['$service', '$$svc'] }, { $eq: ['$network', '$$net'] }],
                    },
                  },
                },
                {
                  $project: { _id: 0, lastSync: 1 },
                },
              ],
              as: 'indexer',
            },
          },
          {
            $addFields: {
              lastSync: {
                $ifNull: [{ $arrayElemAt: ['$indexer.lastSync', 0] }, 0],
              },
              distance: {
                $subtract: [
                  blockNumber,
                  {
                    $ifNull: [{ $arrayElemAt: ['$indexer.lastSync', 0] }, 0],
                  },
                ],
              },
            },
          },

          {
            $sort: {
              distance: -1,
              blockNumber: -1,
            },
          },

          {
            $project: {
              id: 1,
              transactionHash: 1,
              blockNumber: 1,
              blockTimestamp: 1,
              network: 1,
              address: 1,
              lastSync: 1,
              distance: 1,
            },
          },
        ])

        const pluginNotSynced = plugins.filter((plugin: Plugin) => plugin.lastSync === 0)
        logger.verbose('SyncAll: pluginNotSynced list', llo({ count: pluginNotSynced.length }))
        let counter = 0
        for (const plugin of pluginNotSynced) {
          counter++
          await SyncAll.sendWithQueueLimit(plugin, pluginNotSynced.length - counter)
        }

        logger.verbose('SyncAll: Synced list', llo({ count: pluginNotSynced.length }))
        const pluginSynced = plugins.filter((plugin: Plugin) => plugin.lastSync > 0)
        counter = 0
        for (const plugin of pluginSynced) {
          await SyncAll.sendWithQueueLimit(plugin, pluginSynced.length - counter)
        }
      }),
    )

    logger.verbose('End SyncAll', llo())
  },

  sendWithQueueLimit: async (plugin: Plugin, remaining: number) => {
    const maxQueueSize = 100
    const retryDelay = 1000 // 1 second

    while (true) {
      const count = await RabbitMQ.getMessageCount(EnumQueueName.plugins)

      if (count === null) {
        logger.error(
          `Unable to get message count for queue "${EnumQueueName.plugins}". Retrying...`,
          llo({ pluginId: plugin.id }),
        )
        await utils.wait(retryDelay)
        continue
      }

      if (count < maxQueueSize) {
        await RabbitMQHelper.sendMessage(EnumQueueName.plugins, {
          id: plugin.address,
          params: { address: plugin.address, network: plugin.network },
        })
        logger.verbose(
          `Message sent to queue "${EnumQueueName.plugins}". Current count: ${count + 1}`,
          llo({ queueName: EnumQueueName.plugins, address: plugin.address, remaining }),
        )
        break // Exit the loop after successful send
      } else {
        logger.warn(
          `Queue "${EnumQueueName.plugins}" has reached the limit (${count} messages). Waiting...`,
          llo({ queueName: EnumQueueName.plugins, waitingPlugin: plugin.address, remaining }),
        )
        await utils.wait(retryDelay) // Wait before retrying
      }
    }
  },
}
