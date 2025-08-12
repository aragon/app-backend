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
import { MemberGovernanceFactory } from '@modules/memberGovernance'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { IPermission } from '@src/types/permission'
import { PluginHandler } from '@handlers/pluginHandler'
import DbTx from '@modules/dbTx'
import Utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'handlers:PermissionHandler' })

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
      const { where, who, permissionId, condition } = parsedEvent.args
      const conditionAddress = PermissionHandler.validateAndGetConditionAddress(condition)

      const permissionEntity = {
        network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
        daoAddress: address,
      }

      const existingLog = await Models.DaoPermission.findExistingLog(permissionEntity)
      if (existingLog) return

      const permissionToCheck = ethers.id(IPermission.EXECUTE_PROPOSAL_PERMISSION)

      if (permissionToCheck === permissionId) {
        await PermissionHandler.handleForAdminPlugin(address, where, network, who)
      }

      if (permissionId === ethers.id(IPermission.EXECUTE_PERMISSION)) {
        await PluginHandler.installPluginOnPermissionGranted(where, who, info)
        if (conditionAddress) await PluginHandler.updateConditionAddress(who, where, network, conditionAddress)
      }

      await DbTx.executeTxFn(async ({ session }) => {
        const document = {
          whoAddress: who,
          whereAddress: where,
          blockNumber: info.blockNumber,
          permissionId,
          event: IEventLogPermission.Granted,
          conditionAddress,
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
      const { who, where, permissionId, condition } = parsedEvent.args
      const conditionAddress = PermissionHandler.validateAndGetConditionAddress(condition)

      const permissionEntity = {
        network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
        daoAddress: address,
      }

      const existingLog = await Models.DaoPermission.findExistingLog(permissionEntity)
      if (existingLog) return

      const permissionToCheck = ethers.id(IPermission.EXECUTE_PROPOSAL_PERMISSION)

      if (permissionToCheck === permissionId) {
        await PermissionHandler.handleForAdminPlugin(address, where, network, who, false)
      }

      if (permissionId === ethers.id(IPermission.EXECUTE_PERMISSION)) {
        await PluginHandler.uninstallPluginWithPermissionRevoke(who, where, network, info)
      }

      await DbTx.executeTxFn(async ({ session }) => {
        const document = {
          whoAddress: who,
          whereAddress: where,
          blockNumber: info.blockNumber,
          permissionId,
          event: IEventLogPermission.Revoked,
          conditionAddress,
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

    // Create admin governance instance
    const governance = MemberGovernanceFactory.create({
      address: pluginAddress,
      network,
      interfaceType: IPluginInterfaceType.admin,
    })

    if (!add) {
      // Use the governance instance to handle member removal
      await governance.delete(where)

      await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: pluginExisted.daoAddress,
        params: { address: pluginExisted.daoAddress, network: pluginExisted.network },
      })
      logger.info('Remove member from DAO', llo({ daoAddress, pluginAddress, network, where }))

      return
    }

    // Use the governance instance to handle member creation
    // This will handle both Member and PluginMember creation
    await governance.getOrCreate(where)

    await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
      id: pluginExisted.daoAddress,
      params: { address: pluginExisted.daoAddress, network: pluginExisted.network },
    })

    logger.info('Add member to DAO', llo({ daoAddress, pluginAddress, network, where }))
  },

  validateAndGetConditionAddress: (conditionAddress: HexAddress | undefined): HexAddress | undefined => {
    if (!conditionAddress) return undefined
    if (ethers.getAddress(conditionAddress) === Utils.zeroAddress) return undefined
    if (ethers.getAddress(conditionAddress) === ethers.getAddress('0x0000000000000000000000000000000000000002'))
      return undefined

    return ethers.getAddress(conditionAddress)
  },
}
