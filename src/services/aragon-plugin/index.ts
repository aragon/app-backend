import logger from '@logger'
import { EnumConnection, type IService } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import type Plugin from '@models/schema/plugin'
import { LogGovernanceErc20 } from '@indexer/logGovernanceErc20'
import { LogTokenVoting } from '@indexer/logTokenVoting'
import { LogMultisig } from '@indexer/logMultisig'

const llo = logger.logMeta.bind(null, { service: 'service:PluginService' })

const PluginService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async function () {
    logger.info('PluginService started', llo({}))

    const crawler = new DBCrawler({
      model: Models.Plugin,
      onDocument: async (plugin: Plugin) => {
        const dao = await Models.Dao.findByAddress(plugin.daoAddress, plugin.network)
        if (!dao?.isSupported) return

        if (plugin.tokenAddress) {
          // tokenVoting
          await Promise.all([LogGovernanceErc20.start(plugin), LogTokenVoting.start(plugin)])
        } else {
          // multisig
          await Promise.all([LogMultisig.start(plugin)])
        }
      },
      onError: (error: any, document: any) => {
        logger.error('Error PluginService', llo({ error, document }))
      },
      where: {},
      batchSize: 1000,
      concurrency: 20,
    })

    await crawler.crawl()
  },

  async stop() {
    const scheduler = TaskSchedulerState.getInstance()
    scheduler.stopTask('indexer')

    logger.info('PluginService service stopped', llo({}))
  },
}

export default PluginService
