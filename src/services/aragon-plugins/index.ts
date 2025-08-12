import logger from '@logger'
import {
  EnumConnection,
  EnumQueueName,
  IPluginInterfaceType,
  type IQueueDao,
  type IQueuePlugin,
  type IService,
  ITokenType,
} from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { LogAdmin } from '@services/aragon-plugins/logAdmin'
import { Models } from '@dbModels'
import { LogDao } from '@services/aragon-plugins/logDao'
import { LogMultiSig } from '@services/aragon-plugins/logMultisig'
import { LogSpp } from '@services/aragon-plugins/logSPP'
import { LogTokenVoting } from '@services/aragon-plugins/logTokenVoting'
import { LogGauge } from '@plugins/logGauge'
import { LogSelectorPermission } from '@services/aragon-plugins/logSelectorPermission'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'service:PluginSyncService' })

const AragonPluginsService: IService & { pluginQueue: (params: IQueuePlugin) => Promise<void> } = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],
  options: { mongoSync: config.MONGO_DB.SYNC_MODELS },

  async start() {
    await RabbitMQHelper.process(EnumQueueName.logDao, async job => {
      const { address, network } = job.params as IQueueDao
      const dao = await Models.Dao.findByAddress(address, network)
      if (!dao) return
      await LogDao.start(dao)
    })

    await RabbitMQHelper.process(EnumQueueName.logSelectorPermission, async job => {
      const { address, network, conditionAddress } = job.params as IQueuePlugin
      const plugin = await Models.Plugin.findOne({
        address,
        network,
        conditionAddress,
      })
      if (!plugin) {
        logger.error('PluginSyncService: plugin not found', llo({ address, network }))
        return
      }
      await LogSelectorPermission.start(plugin)
    })

    await RabbitMQHelper.process(EnumQueueName.plugins, async job => {
      await AragonPluginsService.pluginQueue(job.params as IQueuePlugin)
    })

    await RabbitMQHelper.process(EnumQueueName.requeue, async job => {
      await AragonPluginsService.pluginQueue(job.params as IQueuePlugin)
    })

    logger.info('PluginSyncService service started', llo({}))
  },

  async stop() {
    logger.info('PluginSyncService service stopped', llo({}))
  },

  pluginQueue: async (params: IQueuePlugin) => {
    const { address, network, isHistorical } = params
    const plugin = await Models.Plugin.findByAddress(address, network)

    if (!plugin?.interfaceType) {
      logger.error('PluginSyncService: plugin not found', llo({ address, network }))
      return
    }

    switch (plugin.interfaceType) {
      case IPluginInterfaceType.admin: {
        await LogAdmin.start(plugin)
        break
      }
      case IPluginInterfaceType.multisig: {
        await LogMultiSig.start(plugin)
        break
      }
      case IPluginInterfaceType.tokenVoting: {
        const token = await Models.Token.findOne({
          address: plugin.tokenAddress,
          network: plugin.network,
        })

        if ((token?.type === ITokenType.ERC20 || token?.type === ITokenType.escrowAdapter) && token.isGovernance) {
          logger.info(
            'Sync plugin: token is ERC20 or escrowAdapter',
            llo({ plugin: plugin.address, token: token.address, tokenTye: token.type }),
          )

          await LogTokenVoting.start(plugin, token, isHistorical)
        } else {
          logger.warn(
            'Sync plugin: token not governance erc20 or escrowAdapter',
            llo({ plugin: plugin.address, token: token?.address }),
          )
        }
        break
      }
      case IPluginInterfaceType.spp: {
        await LogSpp.start(plugin)
        break
      }
      case IPluginInterfaceType.gauge: {
        const token = await Models.Token.findOne({
          address: plugin.tokenAddress,
          network: plugin.network,
        })
        if (token?.type === ITokenType.ERC721) {
          logger.info('Sync plugin: token is ERC721', llo({ plugin: plugin.address, token: token.address }))
          await LogGauge.start(plugin, token, isHistorical)
        } else {
          logger.warn('Sync plugin: token not ERC721', llo({ plugin: plugin.address, token: token.address }))
        }
        break
      }
      default: {
        break
      }
    }
  },
}

export default AragonPluginsService
