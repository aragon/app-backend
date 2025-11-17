import {
  EnumQueueName,
  type ILogPluginSetupProcessorParams,
  type IGetPluginsByDaoParams,
  type IPluginExtraParams,
} from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import config from '@config'
import logger from '@logger'
import { Models } from '@dbModels'

const llo = logger.logMeta.bind(null, { service: 'PluginsController' })

const PluginsController = {
  getInstallationData: async ({ pluginAddress, network }: IPluginExtraParams) => {
    try {
      return await RabbitMQHelper.sendMessage(
        EnumQueueName.pluginInstallationData,
        {
          id: `pluginInstallation-${pluginAddress}-${network}`,
          params: { address: pluginAddress, network },
        },
        { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
      )
    } catch (error) {
      logger.warn('Error while getting plugin installation data', llo({ error, pluginAddress, network }))
      throw error
    }
  },
  getPluginsByDao: async (params: IGetPluginsByDaoParams) => {
    return await Models.Plugin.findByDaoWithFilters(params)
  },

  getPluginsByDaoWithDetails: async (params: IGetPluginsByDaoParams) => {
    return await Models.Plugin.findByDaoWithDetails({
      daoAddress: params.daoAddress,
      network: params.network,
    })
  },

  getPluginsByDaoHierarchy: async (params: IGetPluginsByDaoParams) => {
    const dao = await Models.Dao.findByAddress(params.daoAddress, params.network)
    if (!dao || dao.subDaos?.length === 0) {
      return []
    }

    return await Models.Dao.findPluginsByDaoHierarchy({
      daoAddress: params.daoAddress,
      network: params.network,
    })
  },

  getLogPluginSetupProcessor: async (extraParams: ILogPluginSetupProcessorParams) => {
    return await Models.LogPluginSetupProcespsor.findOne(extraParams)
  },
}

export default PluginsController
