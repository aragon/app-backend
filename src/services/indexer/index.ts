import { EnumConnection, type IService } from '@types'
import { DaoLogs } from '@services/indexer/daoLogs'
// import { MetadataLogs } from '@services/indexer/metadataLogs'
// import { PluginLogs } from '@services/indexer/pluginLogs'
// import { PluginRepoLogs } from '@services/indexer/pluginRepoLogs'
import logger from '@logger'
import Utils from '@helpers/utils'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

const IndexerService: IService & { repeaters: any } = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],
  repeaters: {},

  start: async function () {
    logger.info('IndexerService service start', llo({}))

      IndexerService.repeaters.daos = Utils.setIntervalAsync(
        DaoLogs.start,
        config.SERVICES.SYNC_DATA.DAO_INTERVAL,
        (error: any): void => {
          logger.error('Indexer DaoLogs error', llo({ error }))
        },
      )

    //   IndexerService.repeaters.metadata = Utils.setIntervalAsync(
    //     MetadataLogs.start,
    //     config.SERVICES.SYNC_DATA.DAO_INTERVAL,
    //     (error: any): void => {
    //       logger.error('Indexer MetadataLogs error', llo({ error }))
    //     },
    //   )
    //
    //   IndexerService.repeaters.pluginRepo = Utils.setIntervalAsync(
    //     PluginRepoLogs.start,
    //     config.SERVICES.SYNC_DATA.DAO_INTERVAL,
    //     (error: any): void => {
    //       logger.error('Indexer PluginRepoLogs error', llo({ error }))
    //     },
    //   )
    //
    //   IndexerService.repeaters.plugins = Utils.setIntervalAsync(
    //     PluginLogs.start,
    //     config.SERVICES.SYNC_DATA.DAO_INTERVAL,
    //     (error: any): void => {
    //       logger.error('Indexer PluginLogs cccccbkdglldkirchedjkjrnutdbcifjljnbfhkkfvtg' + 'error', llo({ error }))
    //     },
    //   )
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
