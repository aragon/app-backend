import logger from '@logger'
import {
  EnumConnection,
  EnumQueueName,
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

    const crawler = new DBCrawler({
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
            await RabbitMQHelper.sendMessage(EnumQueueName.requeue, {
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
              await RabbitMQHelper.sendMessage(EnumQueueName.requeue, {
                id: plugin.address,
                params: { address: plugin.address, network: configIndexer.network },
              })
              logger.verbose(
                'Processing token service - found plugin:',
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
                  $regex: `^(${Object.values(IPluginInterfaceType).join('|')})-[a-zA-Z0-9-]+-0x[a-fA-F0-9]{40}$`,
                },
              },
              {
                service: {
                  $regex: `^(${Object.values(ITokenType)
                    .filter(type => type !== ITokenType.native && type !== ITokenType.unknown)
                    .join('|')})-[a-zA-Z0-9-]+-0x[a-fA-F0-9]{40}$`,
                },
              },
            ],
          },
        ],
      },
      batchSize: 2000,
      concurrency: 200,
    })

    await crawler.crawl()

    logger.info('ReQueueService end', llo({}))
  },

  async stop() {
    logger.info('ReQueueService stopped', llo({}))
  },
}

export default AragonReQueueService
