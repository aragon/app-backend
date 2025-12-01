import logger from '@logger'
import { type LogDescription, ethers } from 'ethers'
import { type HexAddress, IEventLogPermission, type ILogInfo, IPluginInterfaceType, type NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { MemberGovernanceFactory } from '@src/governance'
import { IPermission } from '@src/types/permission'
import { PluginHandler } from '@handlers/pluginHandler'
import DbTx from '@modules/dbTx'
import Utils from '@helpers/utils'
import type Dao from '@models/schema/dao'

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

      const parentToSubPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)
      const subToParentPermissionId = ethers.id(IPermission.SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID)

      if (permissionId === parentToSubPermissionId || permissionId === subToParentPermissionId) {
        await PermissionHandler.handleDaoLinkingOnGrant(where, who, permissionId, network)
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

      const parentToSubPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)
      const subToParentPermissionId = ethers.id(IPermission.SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID)

      if (permissionId === parentToSubPermissionId || permissionId === subToParentPermissionId) {
        await PermissionHandler.handleDaoUnlinkingOnRevoke(where, who, permissionId, network)
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
        logger.verbose('Created new document - Permission revoked', llo({ ...info, documentId: logDb.id }))
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

      await governance.updateDaoMetrics()
      logger.verbose('Remove member from DAO', llo({ daoAddress, pluginAddress, network, where }))

      return
    }

    // Use the governance instance to handle member creation
    // This will handle both Member and PluginMember creation
    await governance.getOrCreate(where)

    await governance.updateDaoMetrics()

    logger.verbose('Add member to DAO', llo({ daoAddress, pluginAddress, network, where }))
  },

  validateAndGetConditionAddress: (conditionAddress: HexAddress | undefined): HexAddress | undefined => {
    if (!conditionAddress) return undefined
    if (ethers.getAddress(conditionAddress) === Utils.zeroAddress) return undefined
    if (ethers.getAddress(conditionAddress) === ethers.getAddress('0x0000000000000000000000000000000000000002'))
      return undefined

    return ethers.getAddress(conditionAddress)
  },

  /**
   * Handle DAO linking when acknowledgement permission is granted
   *
   * Permission Rules:
   * - PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID: where=parentDao, who=childDao
   * - SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID: where=childDao, who=parentDao
   *
   * Link only when both permissions exist (bidirectional acknowledgement)
   * Constraint: A parent cannot be attached as a child (no role inversion)
   */
  handleDaoLinkingOnGrant: async (where: HexAddress, who: HexAddress, permissionId: string, network: NetworksEnum) => {
    const parentToSubPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)
    const subToParentPermissionId = ethers.id(IPermission.SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID)

    let parentDaoAddress: HexAddress
    let childDaoAddress: HexAddress

    if (permissionId === parentToSubPermissionId) {
      parentDaoAddress = where
      childDaoAddress = who
    } else {
      parentDaoAddress = who
      childDaoAddress = where
    }

    const [parentDao, childDao] = await Promise.all([
      Models.Dao.findByAddress(parentDaoAddress, network),
      Models.Dao.findByAddress(childDaoAddress, network),
    ])

    if (!parentDao || !childDao) {
      logger.verbose(
        'DAO linking skipped - one or both DAOs not found',
        llo({ parentDaoAddress, childDaoAddress, network }),
      )
      return
    }

    // Constraint: A DAO that is already a child cannot become a parent
    if (parentDao.parentDao) {
      logger.warn(
        'DAO linking rejected - parent DAO is already a child of another DAO',
        llo({ parentDaoAddress, childDaoAddress, network }),
      )
      return
    }

    // Constraint: A DAO that already has children cannot become a child
    if (childDao.subDaos && childDao.subDaos.length > 0) {
      logger.warn(
        'DAO linking rejected - child DAO already has sub-DAOs (is a parent)',
        llo({ parentDaoAddress, childDaoAddress, network }),
      )
      return
    }

    // Constraint: A child can only have one parent
    if (childDao.parentDao && childDao.parentDao !== parentDaoAddress) {
      logger.warn(
        'DAO linking rejected - child DAO already has a different parent',
        llo({ parentDaoAddress, childDaoAddress, existingParent: childDao.parentDao, network }),
      )
      return
    }

    const counterpartPermissionId =
      permissionId === parentToSubPermissionId ? subToParentPermissionId : parentToSubPermissionId
    const counterpartDaoAddress = permissionId === parentToSubPermissionId ? childDaoAddress : parentDaoAddress
    const counterpartWhoAddress = permissionId === parentToSubPermissionId ? parentDaoAddress : childDaoAddress

    const counterpartPermission = await Models.DaoPermission.findActiveAcknowledgementPermission(
      network,
      counterpartDaoAddress,
      counterpartWhoAddress,
      counterpartPermissionId,
    )

    if (!counterpartPermission) {
      logger.verbose(
        'DAO linking pending - waiting for counterpart permission',
        llo({ parentDaoAddress, childDaoAddress, network, permissionId }),
      )
      return
    }

    await PermissionHandler.linkDaos(parentDao, childDao, network)
  },

  /**
   * Link parent and child DAOs bidirectionally
   */
  linkDaos: async (parentDao: Dao, childDao: Dao, network: NetworksEnum) => {
    await DbTx.executeTxFn(async ({ session }) => {
      if (childDao.parentDao !== parentDao.address) {
        await childDao.update({ parentDao: parentDao.address }, { session })
      }

      const currentSubDaos = parentDao.subDaos || []
      if (!currentSubDaos.includes(childDao.address)) {
        const updatedSubDaos = [...new Set([...currentSubDaos, childDao.address])]
        await parentDao.update({ subDaos: updatedSubDaos }, { session })
      }

      await DbTx.safeCommit(session)
      logger.info(
        'DAOs linked via permission',
        llo({ parentDao: parentDao.address, childDao: childDao.address, network }),
      )
    })
  },

  /**
   * Handle DAO unlinking when acknowledgement permission is revoked
   */
  handleDaoUnlinkingOnRevoke: async (
    where: HexAddress,
    who: HexAddress,
    permissionId: string,
    network: NetworksEnum,
  ) => {
    const parentToSubPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

    let parentDaoAddress: HexAddress
    let childDaoAddress: HexAddress

    if (permissionId === parentToSubPermissionId) {
      parentDaoAddress = where
      childDaoAddress = who
    } else {
      parentDaoAddress = who
      childDaoAddress = where
    }

    const [parentDao, childDao] = await Promise.all([
      Models.Dao.findByAddress(parentDaoAddress, network),
      Models.Dao.findByAddress(childDaoAddress, network),
    ])

    if (!parentDao || !childDao) return

    // Check if link exists
    if (childDao.parentDao !== parentDaoAddress) return

    // Unlink the DAOs
    await PermissionHandler.unlinkDaos(parentDao, childDao, network)
  },

  /**
   * Unlink parent and child DAOs bidirectionally
   */
  unlinkDaos: async (parentDao: Dao, childDao: Dao, network: NetworksEnum) => {
    await DbTx.executeTxFn(async ({ session }) => {
      // Remove child's parentDao
      await childDao.update({ parentDao: null }, { session })

      // Remove child from parent's subDaos
      const currentSubDaos = parentDao.subDaos || []
      const updatedSubDaos = currentSubDaos.filter((addr: string) => addr !== childDao.address)
      await parentDao.update({ subDaos: updatedSubDaos }, { session })

      await DbTx.safeCommit(session)
      logger.info(
        'DAOs unlinked via permission revoke',
        llo({ parentDao: parentDao.address, childDao: childDao.address, network }),
      )
    })
  },
}
