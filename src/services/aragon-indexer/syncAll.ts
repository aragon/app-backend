import logger from '@logger'
import { EnumQueueName, ICollectionNames, IPluginInterfaceType, IPluginStatus } from '@types'
import { Models } from '@dbModels'
import { NetworkHelper } from '@helpers/network'
import RabbitMQHelper from '@helpers/rabbitMQ'
import type Plugin from '@models/schema/plugin'
import Web3Helper from '@helpers/web3'
import utils from '@helpers/utils'
import DBCrawler from '@models/utils/crawler'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:SyncAll' })

export const SyncAll = {
  start: async () => {
    logger.verbose('Start SyncAll', llo())

    const networks = NetworkHelper.supportedNetworks()

    await Promise.all(
      networks.map(async ({ networkName }) => {
        const blockNumber = await Web3Helper.getBlockNumber(undefined, networkName)
        if (!blockNumber) return

        const crawler = new DBCrawler({
          model: Models.Plugin,
          onDocument: SyncAll.onDocument,
          useAggregate: true,
          onError: (error: any, document: any) => {
            logger.error('Error Sync all', { document, error })
          },
          batchSize: 500,
          concurrency: 10,
          aggregate: (_skip: number | undefined, _limit: number | undefined) => {
            return [
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
                    net: '$network',
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
                $skip: _skip ?? 0,
              },
              {
                $limit: _limit ?? 500,
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
            ]
          },
        })

        await crawler.crawl()
      }),
    )

    logger.verbose('End SyncAll', llo())
  },

  onDocument: async (plugin: Plugin) => {
    const maxQueueSize = 50
    const retryDelay = 1000 // 1 second

    while (true) {
      const count = await RabbitMQHelper.getQueueMessageCount(EnumQueueName.requeue)

      if (count === null) {
        logger.error(
          `Unable to get message count for queue "${EnumQueueName.requeue}". Retrying...`,
          llo({ pluginId: plugin.id }),
        )
        await utils.wait(retryDelay)
        continue
      }

      if (count < maxQueueSize) {
        await RabbitMQHelper.sendMessage(EnumQueueName.requeue, {
          id: plugin.address,
          params: { address: plugin.address, network: plugin.network },
        })
        logger.verbose(
          `Message sent to queue "${EnumQueueName.requeue}"`,
          llo({ queueName: EnumQueueName.requeue, address: plugin.address, count: count + 1 }),
        )
        break
      } else {
        logger.warn(
          `Queue "${EnumQueueName.requeue}" has reached the limit. Waiting...`,
          llo({ queueName: EnumQueueName.requeue, waitingPlugin: plugin.address, count }),
        )
        await utils.wait(retryDelay)
      }
    }
  },
}
