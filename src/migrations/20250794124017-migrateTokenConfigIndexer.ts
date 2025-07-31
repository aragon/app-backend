import { IEnumIndexerService, type IMigration, IndexerType, IPluginInterfaceType, type NetworksEnum } from '@types'
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
  interfaceType?: IPluginInterfaceType
  network?: NetworksEnum
  pluginAddress?: string
  tokenAddress?: string
  daoAddress?: string
}

export const migrateTokenConfigIndexerMigration: IMigration & {
  extractInfoFromServiceName: (service: string) => TokenConfig | null
  deleteUnused: () => Promise<void>
  deleteDuplicated: () => Promise<void>
} = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250794124017-migrateTokenConfigIndexer' }))

    try {
      await migrateTokenConfigIndexerMigration.deleteUnused()
      await migrateTokenConfigIndexerMigration.deleteDuplicated()

      const crawlerTokens = new DBCrawler({
        model: Models.ConfigIndexer,
        onDocument: async (configIndexer: ConfigIndexer) => {
          const config = migrateTokenConfigIndexerMigration.extractInfoFromServiceName(configIndexer.service as string)

          if (!config) {
            logger.error(
              'Migration ConfigIndexer service does not match expected pattern token',
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
            const service = ConfigIndexerHelper.builders.token(token.type, token.network, token.address)
            await configIndexer.update({
              id: Models.ConfigIndexer.getEntityId({ network: configIndexer.network, service }),
              service,
            })
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

      const crawlerTransferList = new DBCrawler({
        model: Models.ConfigIndexer,
        onDocument: async (configIndexer: ConfigIndexer) => {
          const config = migrateTokenConfigIndexerMigration.extractInfoFromServiceName(configIndexer.service as string)

          if (!config) {
            logger.error(
              'Migration ConfigIndexer service does not match expected pattern transferList',
              llo({ service: configIndexer.service }),
            )
            return
          }
          if (config.indexerType === IndexerType.transferList) {
            const service = ConfigIndexerHelper.builders.transferList(config.network!, config.daoAddress!)
            await configIndexer.update({
              id: Models.ConfigIndexer.getEntityId({ network: configIndexer.network, service }),
              service,
            })
          } else {
            logger.error('Error to check', llo({ service: configIndexer.service }))
          }
        },
        onError: (error: any, document: any) => {
          logger.error('Error migrate transferList config indexer', llo({ error, document }))
        },
        where: { service: /transferList/ },
        batchSize: 2000,
        concurrency: 200,
      })

      const crawlerWithdrawList = new DBCrawler({
        model: Models.ConfigIndexer,
        onDocument: async (configIndexer: ConfigIndexer) => {
          const config = migrateTokenConfigIndexerMigration.extractInfoFromServiceName(configIndexer.service as string)

          if (!config) {
            logger.error(
              'Migration ConfigIndexer service does not match expected pattern withdraw',
              llo({ service: configIndexer.service }),
            )
            return
          }
          if (config.indexerType === IndexerType.withdraw) {
            const service = ConfigIndexerHelper.builders.withdraw(configIndexer.network, config.daoAddress!)
            await configIndexer.update({
              id: Models.ConfigIndexer.getEntityId({ network: configIndexer.network, service }),
              service,
            })
          } else {
            logger.error('Error to check', llo({ service: configIndexer.service }))
          }
        },
        onError: (error: any, document: any) => {
          logger.error('Error migrate withdraw config indexer', llo({ error, document }))
        },
        where: { service: { $regex: '^withdraw-0x[a-fA-F0-9]+-withdrawTxs$' } },
        batchSize: 2000,
        concurrency: 200,
      })

      const crawlerDepositList = new DBCrawler({
        model: Models.ConfigIndexer,
        onDocument: async (configIndexer: ConfigIndexer) => {
          const config = migrateTokenConfigIndexerMigration.extractInfoFromServiceName(configIndexer.service as string)

          if (!config) {
            logger.error(
              'Migration ConfigIndexer service does not match expected pattern deposit',
              llo({ service: configIndexer.service }),
            )
            return
          }
          if (config.indexerType === IndexerType.deposit) {
            const service = ConfigIndexerHelper.builders.deposit(configIndexer.network, config.daoAddress!)
            await configIndexer.update({
              id: Models.ConfigIndexer.getEntityId({ network: configIndexer.network, service }),
              service,
            })
          } else {
            logger.error('Error to check', llo({ service: configIndexer.service }))
          }
        },
        onError: (error: any, document: any) => {
          logger.error('Error migrate deposit config indexer', llo({ error, document }))
        },
        where: { service: { $regex: '^deposit-0x[a-fA-F0-9]+-depositTxs$' } },
        batchSize: 2000,
        concurrency: 200,
      })

      await Promise.all([
        crawlerTokens.crawl(),
        crawlerTransferList.crawl(),
        crawlerWithdrawList.crawl(),
        crawlerDepositList.crawl(),
      ])

      logger.info('Migration completed successfully', llo({ migration: '20250794124017-migrateTokenConfigIndexer' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250794124017-migrateTokenConfigIndexer', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },

  deleteDuplicated: async () => {
    // Find all documents to delete (duplicates with lower lastSync)
    const toDelete = await Models.ConfigIndexer.aggregate([
      {
        $match: {
          service: { $regex: '^(tokenVoting|gauge).*-0x[a-fA-F0-9]+-0x[a-fA-F0-9]+$' },
        },
      },
      {
        $addFields: {
          addresses: {
            $filter: {
              input: { $split: ['$service', '-'] },
              cond: { $regexMatch: { input: '$$this', regex: '^0x[a-fA-F0-9]+$' } },
            },
          },
        },
      },
      {
        $addFields: {
          tokenAddress: { $arrayElemAt: ['$addresses', 1] },
        },
      },
      // Sort by network, token, and lastSync DESC
      {
        $sort: {
          network: 1,
          tokenAddress: 1,
          lastSync: -1,
        },
      },
      // Group and keep all documents
      {
        $group: {
          _id: {
            network: '$network',
            tokenAddress: { $toLower: '$tokenAddress' },
          },
          allDocs: { $push: { _id: '$_id', lastSync: '$lastSync', service: '$service' } },
          count: { $sum: 1 },
        },
      },
      // Only process groups with duplicates
      {
        $match: {
          count: { $gt: 1 },
        },
      },
      // Project to get all except the first (highest lastSync)
      {
        $project: {
          toDelete: { $slice: ['$allDocs', 1, { $size: '$allDocs' }] }, // Skip first, take rest
        },
      },
      // Unwind to get individual documents to delete
      {
        $unwind: '$toDelete',
      },
      {
        $replaceRoot: { newRoot: '$toDelete' },
      },
    ])

    logger.info(
      'Found duplicates to delete',
      llo({
        documentsToDelete: toDelete.length,
      }),
    )

    const idsToDelete = toDelete.map(doc => doc._id)
    const deleteResult = await Models.ConfigIndexer.deleteMany({
      _id: { $in: idsToDelete },
    })

    logger.info(
      'Deleted duplicate documents',
      llo({
        deletedCount: deleteResult.deletedCount,
      }),
    )
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

    // Check if it's a transferList pattern
    if (firstPart === IndexerType.transferList && parts.length === 4 && parts[1].startsWith('0x')) {
      const network = parts.slice(2).join('-') as NetworksEnum
      return {
        indexerType: IndexerType.transferList,
        daoAddress: parts[1],
        network,
      }
    }

    if (
      firstPart === IndexerType.withdraw &&
      parts.length === 3 &&
      parts[1].startsWith('0x') &&
      parts[2] === IEnumIndexerService.withdrawTxs
    ) {
      return {
        indexerType: IndexerType.withdraw,
        daoAddress: parts[1],
      }
    }

    if (
      firstPart === IndexerType.deposit &&
      parts.length === 3 &&
      parts[1].startsWith('0x') &&
      parts[2] === IEnumIndexerService.depositTxs
    ) {
      return {
        indexerType: IndexerType.deposit,
        daoAddress: parts[1],
      }
    }

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
