import logger from '@logger'
import {
  EnumConnection,
  EnumQueueName,
  IndexerType,
  IPluginInterfaceType,
  type IService,
  type IServiceName,
  type NetworksEnum,
} from '@types'
import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import type ConfigIndexer from '@models/schema/configIndexer'
import RabbitMQHelper from '@helpers/rabbitMQ'

const llo = logger.logMeta.bind(null, { service: 'service:AragonReQueue' })

const AragonReQueueService: IService & { extractInfoFromServiceName: any } = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.RABBITMQ],

  start: async function () {
    logger.info('ReQueueService start', llo({}))

    const pluginTypes = Object.values(IPluginInterfaceType).join('|')
    // This matches: {pluginType}-{network}-{address}-{address} or
    // {pluginType}-{network}-{address}-{address}-{address}
    const serviceRegex = new RegExp(`^(${pluginTypes})-[a-zA-Z0-9-]+-0x[a-fA-F0-9]{40}(-0x[a-fA-F0-9]{40})?$`)

    const crawler = new DBCrawler({
      model: Models.ConfigIndexer,
      onDocument: async (configIndexer: ConfigIndexer) => {
        const parsedService = AragonReQueueService.extractInfoFromServiceName(configIndexer.service)

        if (!parsedService) {
          logger.error(
            'Migration ConfigIndexer service does not match expected pattern',
            llo({ service: configIndexer.service }),
          )
          return
        }

        if ([IndexerType.plugin, IndexerType.token].includes(parsedService?.indexerType)) {
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
        $or: [{ end: false }, { end: { $exists: false } }],
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

  extractInfoFromServiceName(service: string): IServiceName | null {
    if (!service || typeof service !== 'string') return null

    const parts = service.split('-')
    if (parts.length < 3) return null // Minimum: pluginType-network-address

    const firstPart = parts[0]

    // Check if it's a plugin type
    const pluginTypes = Object.values(IPluginInterfaceType)
    if (!pluginTypes.includes(firstPart as IPluginInterfaceType)) {
      return null
    }

    // Helper function to validate Ethereum address
    const isValidAddress = (address: string): boolean => {
      if (!address?.startsWith('0x')) return false
      if (address.length !== 42) return false // 0x + 40 hex chars

      // Check if all characters after 0x are valid hex
      const hexPart = address.slice(2)
      return /^[a-fA-F0-9]{40}$/.test(hexPart)
    }

    // Find addresses (they start with 0x and are valid)
    const addresses = parts.filter(part => part.startsWith('0x') && isValidAddress(part))

    if (addresses.length === 0) return null

    // Verify that addresses appear in the correct order in the original string
    const firstAddressIndex = parts.indexOf(addresses[0])
    if (firstAddressIndex < 2) return null // Must have at least pluginType and network before address

    // Find the network (between plugin type and first address)
    const network = parts.slice(1, firstAddressIndex).join('-')
    if (!network) return null

    if (addresses.length === 1) {
      // Plugin pattern: {pluginType}-{network}-{pluginAddress}
      return {
        indexerType: IndexerType.plugin,
        interfaceType: firstPart as IPluginInterfaceType,
        network: network as NetworksEnum,
        pluginAddress: addresses[0],
      }
    }

    if (addresses.length === 2) {
      // Token pattern: {pluginType}-{network}-{pluginAddress}-{tokenAddress}
      // Verify the second address comes after the first in the parts array
      const secondAddressIndex = parts.indexOf(addresses[1])
      if (secondAddressIndex <= firstAddressIndex) return null

      return {
        indexerType: IndexerType.token,
        interfaceType: firstPart as IPluginInterfaceType,
        network: network as NetworksEnum,
        pluginAddress: addresses[0],
        tokenAddress: addresses[1],
      }
    }

    // More than 2 addresses is invalid
    return null
  },
}

export default AragonReQueueService
