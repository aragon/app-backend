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
import RabbitMQHelper from '@helpers/rabbitMQ'
import { IPermission } from '@src/types/permission'
import { PluginHandler } from '@handlers/pluginHandler'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:handlers:PermissionHandler' })

export const PermissionHandler = {
  /**
   * Check if the permission is EXECUTE_PROPOSAL_PERMISSION
   * As this is the permission that we are interested in now
   * To say the owner of the admin plugin has the permission to execute a proposal
   * So we can save the owner as the member of the DAO
   */
  handleGrantOnDao: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
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

      await DbTx.executeTxFn(async ({ session }) => {
        const existingLog = await Models.DaoPermission.findExistingLog(permissionEntity, { session })
        if (existingLog) return

        const document = {
          whoAddress: who,
          whereAddress: where,
          blockNumber: info.blockNumber,
          permissionId,
          event: IEventLogPermission.Granted,
          ...permissionEntity,
        }

        const logDb = await Models.DaoPermission.create(document, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Created new document - Permission granted', llo({ ...info, documentId: logDb.id }))
      })
    } catch (error) {
      logger.error('Error creating document - Permission granted', llo({ ...info, error }))
    }
  },

  handleRevokeOnDao: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
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

      await DbTx.executeTxFn(async ({ session }) => {
        const existingLog = await Models.DaoPermission.findExistingLog(entityId, { session })
        if (existingLog) return

        const document = {
          whoAddress: who,
          whereAddress: where,
          blockNumber: info.blockNumber,
          permissionId,
          event: IEventLogPermission.Revoked,
          ...permissionEntity,
        }

        const logDb = await Models.DaoPermission.create(document, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Created new document - Permission granted', llo({ ...info, documentId: logDb.id }))
      })
    } catch (error) {
      logger.error('Error creating document - Permission revoked', llo({ ...info, error }))
    }
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
      await ProxyMember.removeFromDao({
        memberAddress: where,
        daoAddress: pluginExisted.daoAddress,
        pluginAddress,
        network,
      })
      await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: pluginExisted.daoAddress,
        params: { address: pluginExisted.daoAddress, network: pluginExisted.network },
      })
      logger.info('Remove member from DAO', llo({ daoAddress, pluginAddress, network, where }))

      return
    }

    await ProxyMember.addToDao({
      memberAddress: where,
      daoAddress: pluginExisted.daoAddress,
      pluginAddress,
      network,
    })
    await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
      id: pluginExisted.daoAddress,
      params: { address: pluginExisted.daoAddress, network: pluginExisted.network },
    })

    logger.info('Add member to DAO', llo({ daoAddress, pluginAddress, network, where }))
  },
}
