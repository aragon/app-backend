import logger from '@logger'
import { type LogDescription, ethers } from 'ethers'
import {
  EnumQueueName,
  type HexAddress,
  IEventLogPermission,
  type ILogInfo,
  IPluginInterfaceType,
  type NetworksEnum,
} from '@types'
import { Models } from '@dbModels'
import { ProxyMember } from '@modules/proxyMember'
import { RabbitMQHelper } from '@helpers/redditMQ'
import DbOperations from '@models/utils/dbOperations'
import { IPermission } from '@src/types/permission'
import { PluginHandler } from '@handlers/pluginHandler'

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
    const { where, who, permissionId } = parsedEvent.args

    const permissionToCheck = ethers.id(IPermission.EXECUTE_PROPOSAL_PERMISSION)

    if (permissionToCheck === permissionId) {
      await PermissionHandler.handleForAdminPlugin(address, where, network, who)
    }

    const permissionEntity = {
      network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      daoAddress: address,
    }

    const entityId = Models.DaoPermission.getEntityId(permissionEntity)
    const existingLog = await Models.DaoPermission.findExistingLog(entityId)

    if (existingLog) return

    const document = {
      whoAddress: who,
      whereAddress: where,
      blockNumber: info.blockNumber,
      permissionId,
      event: IEventLogPermission.Granted,
      ...permissionEntity,
    }

    await DbOperations.createDocument(Models.DaoPermission, document, info, 'Permission granted', llo)
  },

  handleRevokeOnDao: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network } = info
    const { who, where, permissionId } = parsedEvent.args

    const permissionToCheck = ethers.id(IPermission.EXECUTE_PROPOSAL_PERMISSION)

    if (permissionToCheck === permissionId) {
      await PermissionHandler.handleForAdminPlugin(address, where, network, who, false)
    }

    if (permissionId === ethers.id(IPermission.EXECUTE_PERMISSION)) {
      await PluginHandler.uninstallPluginWithPermissionRevoke(who, where, network, info)
    }

    const permissionEntity = {
      network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      daoAddress: address,
    }

    const entityId = Models.DaoPermission.getEntityId(permissionEntity)
    const existingLog = await Models.DaoPermission.findExistingLog(entityId)
    if (existingLog) return

    const document = {
      whoAddress: who,
      whereAddress: where,
      blockNumber: info.blockNumber,
      permissionId,
      event: IEventLogPermission.Revoked,
      ...permissionEntity,
    }

    await DbOperations.createDocument(Models.DaoPermission, document, info, 'Permission revoked', llo)
  },

  handleForAdminPlugin: async (
    daoAddress: HexAddress,
    pluginAddress: HexAddress,
    network: NetworksEnum,
    where: HexAddress,
    add: boolean = true,
  ) => {
    const pluginExisted = await Models.Plugin.findOne({
      daoAddress,
      network,
      address: pluginAddress,
      interfaceType: IPluginInterfaceType.admin,
    })

    if (!pluginExisted) {
      return
    }

    if (!add) {
      await Promise.all([
        ProxyMember.removeFromDao({
          memberAddress: where,
          daoAddress: pluginExisted.daoAddress,
          pluginAddress,
          network,
        }),
        RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
          id: pluginExisted.daoAddress,
          params: { address: pluginExisted.daoAddress, network: pluginExisted.network },
        }),
      ])

      logger.info('Remove member from DAO', llo({ daoAddress, pluginAddress, network, where }))

      return
    }

    await Promise.all([
      ProxyMember.addToDao({
        memberAddress: where,
        daoAddress: pluginExisted.daoAddress,
        pluginAddress,
        network,
      }),
      RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: pluginExisted.daoAddress,
        params: { address: pluginExisted.daoAddress, network: pluginExisted.network },
      }),
    ])

    logger.info('Add member to DAO', llo({ daoAddress, pluginAddress, network, where }))
  },
}
