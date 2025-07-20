import logger from '@logger'
import { EnumConnection, EnumQueueName, IndexerType, IPluginInterfaceType, type IService } from '@types'
import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import type ConfigIndexer from '@models/schema/configIndexer'
import RabbitMQHelper from '@helpers/rabbitMQ'

const llo = logger.logMeta.bind(null, { service: 'service:AragonReQueue' })

const AragonReQueueService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.RABBITMQ],

  start: async function () {
    logger.info('ReQueueService start', llo({}))

    const pluginTypes = Object.values(IPluginInterfaceType).join('|')
    // This matches: {pluginType}-{network}-{address}
    const serviceRegex = new RegExp(`^(${pluginTypes})-[^-]+-[^-]+$`)

    const crawler = new DBCrawler({
      model: Models.ConfigIndexer,
      onDocument: async (configIndexer: ConfigIndexer) => {
        const parsedService = configIndexer.extractInfoFromServiceName()

        if (parsedService?.indexerType === IndexerType.plugin) {
          await RabbitMQHelper.sendMessage(EnumQueueName.plugins, {
            id: parsedService.pluginAddress,
            params: { address: parsedService.pluginAddress, network: configIndexer.network },
          })
          logger.verbose('Processing plugin:', llo(parsedService))
        }
      },
      onError: (error: any, document: any) => {
        logger.error('Error re-queue', llo({ document, error }))
      },
      where: {
        end: false,
        service: { $regex: serviceRegex },
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
