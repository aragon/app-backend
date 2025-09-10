import logger from '@logger'
import {
  EnumConnection,
  EnumQueueName,
  ICollectionNames,
  IndexerType,
  IPluginInterfaceType,
  ITokenType,
  NetworksEnum,
  type IService,
} from '@types'
import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import type ConfigIndexer from '@models/schema/configIndexer'
import RabbitMQHelper from '@helpers/rabbitMQ'
import ConfigIndexerHelper from '@src/helpers/configIndexer'

const llo = logger.logMeta.bind(null, { service: 'service:AragonReQueue' })

const AragonReQueueService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.RABBITMQ],

  start: async function () {
    logger.info('ReQueueService start', llo({}))

    const pluginCrawler = new DBCrawler({
      model: Models.ConfigIndexer,
      onDocument: async (configIndexer: ConfigIndexer) => {
        const parsedService = ConfigIndexerHelper.parser.parse(configIndexer.service)

        if (!parsedService || !Object.values(NetworksEnum).includes(parsedService.network)) {
          logger.error(
            'Migration ConfigIndexer service does not match expected pattern',
            llo({ service: configIndexer.service }),
          )
          return
        }

        if (parsedService.type === IndexerType.plugin) {
          const pluginAddress = parsedService.address
          if (pluginAddress) {
            await RabbitMQHelper.sendMessageWithThrottle(EnumQueueName.requeue, {
              id: pluginAddress,
              params: { address: pluginAddress, network: configIndexer.network },
            })
            logger.verbose(
              'Processing plugin service:',
              llo({ address: pluginAddress, network: configIndexer.network }),
            )
          }
        } else if (parsedService.type === IndexerType.token) {
          const tokenAddress = parsedService.address
          if (tokenAddress) {
            const plugin = await Models.Plugin.findByTokenAddress(tokenAddress, configIndexer.network)
            if (plugin?.address) {
              await RabbitMQHelper.sendMessageWithThrottle(EnumQueueName.requeue, {
                id: plugin.address,
                params: { address: plugin.address, network: configIndexer.network },
              })
              logger.verbose(
                'Processing token service - found plugin',
                llo({
                  tokenAddress,
                  pluginAddress: plugin.address,
                  network: configIndexer.network,
                }),
              )
            }
          }
        }
      },
      onError: (error: any, document: any) => {
        logger.error('Error re-queue', llo({ document, error }))
      },
      where: {
        $and: [
          { $or: [{ end: false }, { end: { $exists: false } }] },
          {
            $or: [
              {
                service: {
                  $regex: `^(${Object.values(IPluginInterfaceType).join('|')})-(${Object.values(NetworksEnum).join('|')})-0x[a-fA-F0-9]{40}$`,
                },
              },
              {
                service: {
                  $regex: `^(${Object.values(ITokenType)
                    .filter(type => type !== ITokenType.native && type !== ITokenType.unknown)
                    .join('|')})-(${Object.values(NetworksEnum).join('|')})-0x[a-fA-F0-9]{40}$`,
                },
              },
            ],
          },
        ],
      },
      batchSize: 2000,
      concurrency: 200,
    })

    // Find DAOs without deposit/withdraw config and push them to daoTransactions queue
    logger.info('Looking for DAOs without deposit/withdraw config', llo({}))

    const daoCrawler = new DBCrawler({
      model: Models.Dao,
      onDocument: async (dao: any) => {
        await RabbitMQHelper.sendMessageWithThrottle(EnumQueueName.daoTransactions, {
          id: dao.address,
          params: { address: dao.address, network: dao.network },
        })

        logger.verbose(
          'Pushing DAO to daoTransactions queue - missing configs',
          llo({
            daoAddress: dao.address,
            network: dao.network,
            missingConfigsCount: dao.missingConfigsCount,
            missingConfigs: dao.missingConfigs,
          }),
        )
      },
      onError: (error: any, document: any) => {
        logger.error('Error checking DAO deposit/withdraw configs', llo({ document, error }))
      },
      batchSize: 100,
      concurrency: 10,
      useAggregate: true,
      aggregate: (_skip: number | undefined, _limit: number | undefined) => {
        return [
          // First, create all 4 required config service names for each DAO
          {
            $addFields: {
              requiredConfigs: [
                { $concat: ['nativeDeposit-', '$network', '-', '$address'] },
                { $concat: ['nativeWithdraw-', '$network', '-', '$address'] },
                { $concat: ['tokenDeposit-', '$network', '-', '$address'] },
                { $concat: ['tokenWithdraw-', '$network', '-', '$address'] },
              ],
            },
          },
          // Lookup ConfigIndexer to find which configs exist
          {
            $lookup: {
              from: ICollectionNames.ConfigIndexer,
              let: {
                configs: '$requiredConfigs',
                net: '$network',
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $in: ['$service', '$$configs'] },
                        { $eq: ['$network', '$$net'] },
                        {
                          $or: [{ $eq: ['$end', false] }, { $eq: [{ $type: '$end' }, 'missing'] }],
                        },
                      ],
                    },
                  },
                },
                {
                  $project: { service: 1, _id: 0 },
                },
              ],
              as: 'existingConfigs',
            },
          },
          // Calculate which configs are missing
          {
            $addFields: {
              existingConfigServices: {
                $map: {
                  input: '$existingConfigs',
                  as: 'config',
                  in: '$$config.service',
                },
              },
            },
          },
          {
            $addFields: {
              missingConfigs: {
                $filter: {
                  input: '$requiredConfigs',
                  as: 'config',
                  cond: { $not: { $in: ['$$config', '$existingConfigServices'] } },
                },
              },
            },
          },
          {
            $addFields: {
              missingConfigsCount: { $size: '$missingConfigs' },
            },
          },
          // Only return DAOs that are missing at least one config
          {
            $match: {
              missingConfigsCount: { $gt: 0 },
            },
          },
          // Pagination
          {
            $skip: _skip ?? 0,
          },
          {
            $limit: _limit ?? 100,
          },
          // Sort by most missing configs first
          {
            $sort: {
              missingConfigsCount: -1,
              blockNumber: -1,
            },
          },
          // Return only necessary fields
          {
            $project: {
              address: 1,
              network: 1,
              missingConfigsCount: 1,
              missingConfigs: 1,
            },
          },
        ]
      },
    })

    const crawlers: DBCrawler[] = [pluginCrawler, daoCrawler]
    await Promise.all(crawlers.map(async (crawler: DBCrawler) => crawler.crawl()))

    logger.info('ReQueueService end', llo({}))
  },

  async stop() {
    logger.info('ReQueueService stopped', llo({}))
  },
}

export default AragonReQueueService
