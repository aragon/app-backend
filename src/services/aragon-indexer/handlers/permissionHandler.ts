import logger from '@logger'
import { type LogDescription, ethers } from 'ethers'
import { EnumQueueName, type HexAddress, type ILogInfo, IPluginInterfaceType, type NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { ProxyMember } from '@modules/proxyMember'
import { RabbitMQHelper } from '@helpers/redditMQ'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:handlers:PermissionHandler' })

export const PermissionHandler = {
  /**
   * Check if the permission is EXECUTE_PROPOSAL_PERMISSION
   * As this is the permission that we are interested in now
   * To say the owner of the admin plugin has the permission to execute a proposal
   * So we can save the owner as the member of the DAO
   */

  handleGrantOnDao: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network } = info
    const { who, here, permissionId } = parsedEvent.args

    const permissionToCheck = ethers.id('EXECUTE_PROPOSAL_PERMISSION')

    if (permissionToCheck === permissionId) {
      await PermissionHandler._handleForAdminPlugin(address, here, network, who)
    }
  },
  handleRevokeOnDao: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network } = info
    const { who, here, permissionId } = parsedEvent.args

    const permissionToCheck = ethers.id('EXECUTE_PROPOSAL_PERMISSION')

    if (permissionToCheck === permissionId) {
      await PermissionHandler._handleForAdminPlugin(address, here, network, who, false)
    }
  },

  _handleForAdminPlugin: async (
    daoAddress: HexAddress,
    pluginAddress: HexAddress,
    network: NetworksEnum,
    here: HexAddress,
    add: boolean = true,
  ) => {
    const pluginExisted = await Models.Plugin.find({
      daoAddress,
      network,
      pluginAddress,
      interfaceType: IPluginInterfaceType.admin,
    })

    if (!pluginExisted) {
      return
    }

    if (!add) {
      await Promise.all([
        ProxyMember.removeFromDao({
          memberAddress: here,
          daoAddress: pluginExisted.daoAddress,
          pluginAddress,
          network,
        }),
        RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
          id: pluginExisted.daoAddress,
          params: { address: pluginExisted.daoAddress, network: pluginExisted.network },
        }),
      ])

      logger.info('Remove member from DAO', llo({ daoAddress, pluginAddress, network, here }))

      return
    }

    await Promise.all([
      ProxyMember.addToDao({
        memberAddress: here,
        daoAddress: pluginExisted.daoAddress,
        pluginAddress,
        network,
      }),
      RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: pluginExisted.daoAddress,
        params: { address: pluginExisted.daoAddress, network: pluginExisted.network },
      }),
    ])

    logger.info('Add member to DAO', llo({ daoAddress, pluginAddress, network, here }))
  },
}
