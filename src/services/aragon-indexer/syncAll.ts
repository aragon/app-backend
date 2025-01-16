import logger from '@logger'
import { EnumQueueName, ICollectionNames, IPluginInterfaceType, IPluginStatus } from '@types'
import { Models } from '@dbModels'
import { NetworkHelper } from '@helpers/network'
import { RabbitMQHelper } from '@helpers/radditMQ'
import type Plugin from '@models/schema/plugin'
import Web3Helper from '@helpers/web3'

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

        await Promise.all(
          pluginNotSynced.map(async (plugin: Plugin) => {
            await RabbitMQHelper.sendMessage(EnumQueueName.plugins, {
              id: plugin.address,
              params: { address: plugin.address, network: plugin.network },
            })
          }),
        )

        const pluginSynced = plugins.filter((plugin: Plugin) => plugin.lastSync > 0)

        await Promise.all(
          pluginSynced.map(async (plugin: Plugin) => {
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
