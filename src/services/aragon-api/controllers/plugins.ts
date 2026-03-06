import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { TotalSupplyRefresh } from '@services/aragon-api/helpers/totalSupplyRefresh'
import {
  EnumQueueName,
  type IGetPluginsByDaoParams,
  type ILogPluginSetupProcessorParams,
  type IPluginExtraParams,
} from '@types'

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
    const daoDetails = await Models.Dao.findByAddress(params.daoAddress, params.network)
    const daoAddresses = [params.daoAddress, ...(daoDetails?.linkedAccounts || [])]

    const results = await Models.Plugin.findByDaoAddressesWithDetails({
      daoAddresses,
      network: params.network,
    })

    TotalSupplyRefresh.refreshAggregationResults(results, (plugin: any) => plugin?.settings?.token)

    return results
  },

  getLogPluginSetupProcessor: async (extraParams: ILogPluginSetupProcessorParams) => {
    return await Models.LogPluginSetupProcessor.findOne(extraParams)
  },
}

export default PluginsController
