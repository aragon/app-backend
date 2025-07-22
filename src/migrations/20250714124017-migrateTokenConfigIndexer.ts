import { type IMigration, IndexerType, IPluginInterfaceType, ITokenType, type NetworksEnum } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import type ConfigIndexer from '@models/schema/configIndexer'
import ConfigIndexerHelper from '@helpers/configIndexer'

const llo = logger.logMeta.bind(null, { service: 'Migration: migrateTokenConfigIndexer' })

enum TokenSyncTagName {
  Default = 'default',
  Delegation = 'delegation-event',
  Transfer = 'transfer-event',
  TokenHolders = 'token-holders',
}

interface TokenConfig {
  indexerType: IndexerType
  interfaceType: IPluginInterfaceType
  network: NetworksEnum
  pluginAddress: string
  tokenAddress: string
}

export const migrateTokenConfigIndexerMigration: IMigration & {
  extractInfoFromServiceName: (service: string) => TokenConfig | null
  deleteUnused: () => Promise<void>
} = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250714124017-migrateTokenConfigIndexer' }))

    try {
      await migrateTokenConfigIndexerMigration.deleteUnused()

      const crawler = new DBCrawler({
        model: Models.ConfigIndexer,
        onDocument: async (configIndexer: ConfigIndexer) => {
          const config = migrateTokenConfigIndexerMigration.extractInfoFromServiceName(configIndexer.service)

          if (!config) {
            logger.error(
              'Migration ConfigIndexer service does not match expected pattern',
              llo({ service: configIndexer.service }),
            )
            return
          }
          const token = await Models.Token.findByTokenAddressAndNetwork(config.tokenAddress, config.network)
          if (!token) {
            logger.error('Migration ConfigIndexer token not found', llo({ service: configIndexer.service }))
            return
          }

          if (
            config.interfaceType === IPluginInterfaceType.tokenVoting ||
            config.interfaceType === IPluginInterfaceType.gauge
          ) {
            if (token?.type === ITokenType.ERC20 || token?.type === ITokenType.ERC721) {
              const service = ConfigIndexerHelper.builders.token(token.type, token.network, token.address)
              await configIndexer.update({
                id: Models.ConfigIndexer.getEntityId({ network: configIndexer.network, service }),
                service,
              })
            } else if (token?.type === ITokenType.escrowAdapter) {
              const service = ConfigIndexerHelper.builders.token(ITokenType.escrowAdapter, token.network, token.address)
              await configIndexer.update({
                id: Models.ConfigIndexer.getEntityId({ network: configIndexer.network, service }),
                service,
              })
            }
          } else {
            logger.error('Error to check', llo({ service: configIndexer.service }))
          }
        },
        onError: (error: any, document: any) => {
          logger.error('Error migrate token config indexer', llo({ error, document }))
        },
        where: { service: { $regex: '^(tokenVoting|gauge).*-0x[a-fA-F0-9]+-0x[a-fA-F0-9]+$' } },
        batchSize: 2000,
        concurrency: 200,
      })

      await crawler.crawl()

      logger.info('Migration completed successfully', llo({ migration: '20250714124017-migrateTokenConfigIndexer' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250714124017-migrateTokenConfigIndexer', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },

  deleteUnused: async () => {
    await Promise.all([
      Models.ConfigIndexer.deleteMany({
        service: { $regex: TokenSyncTagName.Default },
      }),
      Models.ConfigIndexer.deleteMany({
        service: { $regex: TokenSyncTagName.Delegation },
      }),
      Models.ConfigIndexer.deleteMany({
        service: { $regex: TokenSyncTagName.Transfer },
      }),
      Models.ConfigIndexer.deleteMany({
        service: { $regex: TokenSyncTagName.TokenHolders },
      }),
    ])
  },

  extractInfoFromServiceName(service: string) {
    const parts = service.split('-')
    const firstPart = parts[0]

    // Check if it's a plugin type
    const pluginTypes = Object.values(IPluginInterfaceType)
    if (pluginTypes.includes(firstPart as IPluginInterfaceType)) {
      // Find addresses (they start with 0x)
      const addresses = parts.filter(part => part.startsWith('0x'))

      if (addresses.length === 0) return null

      // Find the network (between plugin type and first address)
      const firstAddressIndex = parts.indexOf(addresses[0])
      const network = parts.slice(1, firstAddressIndex).join('-')

      if (addresses.length === 2) {
        // Token pattern: {pluginType}-{network}-{pluginAddress}-{tokenAddress}
        return {
          indexerType: IndexerType.token,
          interfaceType: firstPart as IPluginInterfaceType,
          network: network as NetworksEnum,
          pluginAddress: addresses[0],
          tokenAddress: addresses[1],
        }
      }
    }

    return null
  },
}

export default migrateTokenConfigIndexerMigration
