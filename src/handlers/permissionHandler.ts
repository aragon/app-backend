import { Models } from '@dbModels'
import { PluginHandler } from '@handlers/pluginHandler'
import Utils from '@helpers/utils'
import logger from '@logger'
import type Dao from '@models/schema/dao'
import DbTx from '@modules/dbTx'
import { MemberGovernanceFactory } from '@src/governance'
import { IPermission } from '@src/types/permission'
import { type HexAddress, IEventLogPermission, type ILogInfo, IPluginInterfaceType, type NetworksEnum } from '@types'
import { ethers, type LogDescription } from 'ethers'

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

      const parentToLinkedPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)
      const linkedToParentPermissionId = ethers.id(IPermission.SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID)

      if (permissionId === parentToLinkedPermissionId || permissionId === linkedToParentPermissionId) {
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

      const parentToLinkedPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)
      const linkedToParentPermissionId = ethers.id(IPermission.SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID)

      if (permissionId === parentToLinkedPermissionId || permissionId === linkedToParentPermissionId) {
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
   * - PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID: where=parentAccount, who=linkedAccount
   * - SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID: where=linkedAccount, who=parentAccount
   *
   * Link only when both permissions exist (bidirectional acknowledgement)
   * Constraint: A parent cannot be attached as a child (no role inversion)
   */
  handleDaoLinkingOnGrant: async (where: HexAddress, who: HexAddress, permissionId: string, network: NetworksEnum) => {
    const parentToLinkedPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)
    const linkedToParentPermissionId = ethers.id(IPermission.SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID)

    let parentAccountAddress: HexAddress
    let linkedAccountAddress: HexAddress

    if (permissionId === parentToLinkedPermissionId) {
      parentAccountAddress = where
      linkedAccountAddress = who
    } else {
      parentAccountAddress = who
      linkedAccountAddress = where
    }

    const [parentAccount, linkedAccount] = await Promise.all([
      Models.Dao.findByAddress(parentAccountAddress, network),
      Models.Dao.findByAddress(linkedAccountAddress, network),
    ])

    if (!parentAccount || !linkedAccount) {
      logger.verbose(
        'DAO linking skipped - one or both DAOs not found',
        llo({ parentAccountAddress, linkedAccountAddress, network }),
      )
      return
    }

    // Constraint: A DAO that is already a child cannot become a parent
    if (parentAccount.parentAccount) {
      logger.warn(
        'DAO linking rejected - parent DAO is already a child of another DAO',
        llo({ parentAccountAddress, linkedAccountAddress, network }),
      )
      return
    }

    // Constraint: A DAO that already has children cannot become a child
    if (linkedAccount.linkedAccounts && linkedAccount.linkedAccounts.length > 0) {
      logger.warn(
        'DAO linking rejected - linked account already has linked accounts (is a parent)',
        llo({ parentAccountAddress, linkedAccountAddress, network }),
      )
      return
    }

    // Constraint: A child can only have one parent
    if (linkedAccount.parentAccount && linkedAccount.parentAccount !== parentAccountAddress) {
      logger.warn(
        'DAO linking rejected - linked account already has a different parent',
        llo({ parentAccountAddress, linkedAccountAddress, existingParent: linkedAccount.parentAccount, network }),
      )
      return
    }

    const counterpartPermissionId =
      permissionId === parentToLinkedPermissionId ? linkedToParentPermissionId : parentToLinkedPermissionId
    const counterpartDaoAddress =
      permissionId === parentToLinkedPermissionId ? linkedAccountAddress : parentAccountAddress
    const counterpartWhoAddress =
      permissionId === parentToLinkedPermissionId ? parentAccountAddress : linkedAccountAddress

    const counterpartPermission = await Models.DaoPermission.findActiveAcknowledgementPermission(
      network,
      counterpartDaoAddress,
      counterpartWhoAddress,
      counterpartPermissionId,
    )

    if (!counterpartPermission) {
      logger.verbose(
        'DAO linking pending - waiting for counterpart permission',
        llo({ parentAccountAddress, linkedAccountAddress, network, permissionId }),
      )
      return
    }

    await PermissionHandler.linkDaos(parentAccount, linkedAccount, network)
  },

  /**
   * Link parent account and linked account bidirectionally
   */
  linkDaos: async (parentAccount: Dao, linkedAccount: Dao, network: NetworksEnum) => {
    await DbTx.executeTxFn(async ({ session }) => {
      if (linkedAccount.parentAccount !== parentAccount.address) {
        await linkedAccount.update({ parentAccount: parentAccount.address }, { session })
      }

      const currentLinkedAccounts = parentAccount.linkedAccounts || []
      if (!currentLinkedAccounts.includes(linkedAccount.address)) {
        const updatedLinkedAccounts = [...new Set([...currentLinkedAccounts, linkedAccount.address])]
        await parentAccount.update({ linkedAccounts: updatedLinkedAccounts }, { session })
      }

      await DbTx.safeCommit(session)
      logger.info(
        'DAOs linked via permission',
        llo({ parentAccount: parentAccount.address, linkedAccount: linkedAccount.address, network }),
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
    const parentToLinkedPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

    let parentAccountAddress: HexAddress
    let linkedAccountAddress: HexAddress

    if (permissionId === parentToLinkedPermissionId) {
      parentAccountAddress = where
      linkedAccountAddress = who
    } else {
      parentAccountAddress = who
      linkedAccountAddress = where
    }

    const [parentAccount, linkedAccount] = await Promise.all([
      Models.Dao.findByAddress(parentAccountAddress, network),
      Models.Dao.findByAddress(linkedAccountAddress, network),
    ])

    if (!parentAccount || !linkedAccount) return

    // Check if link exists
    if (linkedAccount.parentAccount !== parentAccountAddress) return

    // Unlink the DAOs
    await PermissionHandler.unlinkDaos(parentAccount, linkedAccount, network)
  },

  /**
   * Unlink parent account and linked account bidirectionally
   */
  unlinkDaos: async (parentAccount: Dao, linkedAccount: Dao, network: NetworksEnum) => {
    await DbTx.executeTxFn(async ({ session }) => {
      // Remove child's parentAccount
      await linkedAccount.update({ parentAccount: null }, { session })

      // Remove child from parent's linkedAccounts
      const currentLinkedAccounts = parentAccount.linkedAccounts || []
      const updatedLinkedAccounts = currentLinkedAccounts.filter((addr: string) => addr !== linkedAccount.address)
      await parentAccount.update({ linkedAccounts: updatedLinkedAccounts }, { session })

      await DbTx.safeCommit(session)
      logger.info(
        'DAOs unlinked via permission revoke',
        llo({ parentAccount: parentAccount.address, linkedAccount: linkedAccount.address, network }),
      )
    })
  },
}
