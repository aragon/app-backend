import { EnumConnection, type IService } from '@types'
import { DaoLogs } from '@services/indexer/daoLogs'
import { MetadataLogs } from '@services/indexer/metadataLogs'
import logger from '@logger'
import Utils from '@helpers/utils'
import config from '@config'
import { PluginRepoLogs } from '@services/indexer/pluginRepoLogs'
import { PluginSetupProcessorLogs } from '@services/indexer/pluginSetupProcessorLogs'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

const IndexerService: IService & { repeaters: any } = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],
  repeaters: {},

  start: async function () {
    logger.info('IndexerService service start', llo({}))

    // await InitialData.start()

    IndexerService.repeaters.daos = Utils.setIntervalAsync({
      fn: DaoLogs.start,
      interval: config.SERVICES.SYNC_DATA.DAO_INTERVAL,
      onError: (error: any): void => {
        logger.error('Indexer DaoLogs error', llo({ error }))
      },
    })

    IndexerService.repeaters.metadata = Utils.setIntervalAsync({
      fn: MetadataLogs.start,
      interval: config.SERVICES.SYNC_DATA.DAO_INTERVAL,
      onError: (error: any): void => {
        logger.error('Indexer MetadataLogs error', llo({ error }))
      },
    })

    IndexerService.repeaters.pluginRepo = Utils.setIntervalAsync({
      fn: PluginRepoLogs.start,
      interval: config.SERVICES.SYNC_DATA.DAO_INTERVAL,
      onError: (error: any): void => {
        logger.error('Indexer PluginRepoLogs error', llo({ error }))
      },
    })

    IndexerService.repeaters.pluginSetupProcessor = Utils.setIntervalAsync({
      fn: PluginSetupProcessorLogs.start,
      interval: config.SERVICES.SYNC_DATA.DAO_INTERVAL,
      onError: (error: any): void => {
        logger.error('Indexer PluginSetupProcessorLogs', llo({ error }))
      },
    })
  },

  async stop() {
    await Promise.all(
      Object.keys(IndexerService.repeaters).map(async key => {
        if (typeof IndexerService.repeaters[key] === 'function') {
          await IndexerService.repeaters[key](true)
          delete IndexerService.repeaters[key]
        }
      }),
    )

    logger.info('IndexerService service stopped', llo({}))
  },
}

export default IndexerService
