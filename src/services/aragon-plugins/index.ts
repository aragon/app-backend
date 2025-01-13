import logger from '@logger'
import { EnumConnection, EnumQueueName, IPluginInterfaceType, type IQueueDao, type IService } from '@types'
import { RabbitMQHelper } from '@helpers/radditMQ'
import { LogAdmin } from '@services/aragon-plugins/logAdmin'
import { Models } from '@dbModels'
import { LogDao } from '@services/aragon-plugins/logDao'
import { LogMultiSig } from '@services/aragon-plugins/logMultisig'
import { LogSpp } from '@services/aragon-plugins/logSPP'
import { LogTokenVoting } from '@services/aragon-plugins/logTokenVoting'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'service:PluginSyncService' })

const AragonPluginsService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  async start() {
    await RabbitMQHelper.process(EnumQueueName.logDao, config.RABBITMQ.DEFAULT_CONCURRENCY, async job => {
      const { address, network } = job.params as IQueueDao
      const dao = await Models.Dao.findByAddress(address, network)
      if (!dao) return
      await LogDao.start(dao)
    })

    await RabbitMQHelper.process(EnumQueueName.plugins, config.RABBITMQ.DEFAULT_CONCURRENCY, async job => {
      const { address, network } = job.params as IQueueDao
      const plugin = await Models.Plugin.findByAddress(address, network)

      if (!plugin?.interfaceType) {
        logger.error('PluginSyncService: plugin not found', llo({ plugin, address, network }))
        return
      }

      switch (plugin.interfaceType) {
        case IPluginInterfaceType.admin:
          await LogAdmin.start(plugin)
          break
        case IPluginInterfaceType.multisig:
          await LogMultiSig.start(plugin)
          break
        case IPluginInterfaceType.tokenVoting:
          await LogTokenVoting.start(plugin)
          break
        case IPluginInterfaceType.spp:
          await LogSpp.start(plugin)
          break
        default:
          logger.error('PluginSyncService: interfaceType not found', llo({ plugin }))
          break
      }
    })

    logger.info('PluginSyncService service started', llo({}))
  },

  async stop() {
    logger.info('PluginSyncService service stopped', llo({}))
  },
}

export default AragonPluginsService
