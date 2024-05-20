import logger from '@logger'
import Utils from '@helpers/utils'
import config from '@config'
import { EnumConnection, type IService } from '@types'
import { LogDao } from '@services/indexer/logDao'
import { LogDaoRegistry } from '@services/indexer/logDaoRegistry'
import { LogPluginRepoRegistry } from '@services/indexer/logPluginRepoRegistry'
import { LogPluginSetupProcessor } from '@services/indexer/logPluginSetupProcessor'
import { LogProposal } from '@services/indexer/logProposal'
import { LogPluginSetting } from '@services/indexer/logPluginSetting'
import { LogMember } from '@services/indexer/logMember'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

const IndexerService: IService & { repeaters: any } = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],
  repeaters: {},

  start: async function () {
    logger.info('IndexerService service start', llo({}))

    IndexerService.repeaters.daoRegistry = Utils.setIntervalAsync({
      fn: LogDaoRegistry.start,
      delay: config.SERVICES.SYNC_DATA.DAO_INTERVAL,
      onError: (error: any): void => {
        logger.error('Indexer DaoRegistry error', llo({ error }))
      },
    })

    IndexerService.repeaters.pluginRepoRegistry = Utils.setIntervalAsync({
      fn: LogPluginRepoRegistry.start,
      delay: config.SERVICES.SYNC_DATA.DAO_INTERVAL,
      onError: (error: any): void => {
        logger.error('Indexer PluginRepoRegistry error', llo({ error }))
      },
    })

    IndexerService.repeaters.pluginSetupProcessor = Utils.setIntervalAsync({
      fn: LogPluginSetupProcessor.start,
      delay: config.SERVICES.SYNC_DATA.DAO_INTERVAL,
      onError: (error: any): void => {
        logger.error('Indexer PluginSetupProcessor error', llo({ error }))
      },
    })

    IndexerService.repeaters.pluginSetting = Utils.setIntervalAsync({
      fn: LogPluginSetting.start,
      delay: config.SERVICES.SYNC_DATA.DAO_INTERVAL,
      onError: (error: any): void => {
        logger.error('Indexer LogPluginSetting error', llo({ error }))
      },
    })

    IndexerService.repeaters.member = Utils.setIntervalAsync({
      fn: LogMember.start,
      delay: config.SERVICES.SYNC_DATA.DAO_INTERVAL,
      onError: (error: any): void => {
        logger.error('Indexer member error', llo({ error }))
      },
    })

    IndexerService.repeaters.dao = Utils.setIntervalAsync({
      fn: LogDao.start,
      delay: config.SERVICES.SYNC_DATA.DAO_INTERVAL,
      onError: (error: any): void => {
        logger.error('Indexer Dao error', llo({ error }))
      },
    })

    IndexerService.repeaters.proposal = Utils.setIntervalAsync({
      fn: LogProposal.start,
      delay: config.SERVICES.SYNC_DATA.DAO_INTERVAL,
      onError: (error: any): void => {
        logger.error('Indexer LogProposal error', llo({ error }))
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
