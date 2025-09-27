import { EnumQueueName, type IGetPluginsByDaoParams, type IPluginExtraParams } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import config from '@config'
import logger from '@logger'
import { Models } from '@src/models'

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
    try {
      const filter: any = {
        daoAddress: params.daoAddress,
        network: params.network,
      }

      // Filter by plugin interface type (e.g., 'spp' for processes)
      if (params.interfaceType) {
        filter.interfaceType = params.interfaceType
      }

      // Filter by installation status
      if (params.status && params.status !== 'all') {
        filter.status = params.status
      }

      // Filter by process flag
      if (params.isProcess !== undefined) {
        filter.isProcess = params.isProcess
      }

      // Filter by supported flag
      if (params.isSupported !== undefined) {
        filter.isSupported = params.isSupported
      }

      const plugins = await Models.Plugin.find(filter).sort({ blockNumber: -1 }).lean().exec()

      logger.info(
        'Retrieved plugins by DAO',
        llo({
          daoAddress: params.daoAddress,
          network: params.network,
          count: plugins.length,
          filters: {
            interfaceType: params.interfaceType,
            status: params.status,
            isProcess: params.isProcess,
            isSupported: params.isSupported,
          },
        }),
      )

      return plugins
    } catch (error) {
      logger.warn('Error while getting plugins by DAO', llo({ error, params }))
      throw error
    }
  },
}

export default PluginsController
