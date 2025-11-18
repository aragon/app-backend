import logger from '@logger'
import {
  type ILogInfo,
  type IMetadata,
  IMetadataTargetField,
  IMetadataType,
  IPluginInterfaceType,
  IPluginStatus,
  type HexAddress,
} from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import IPFSModule from '@modules/ipfs'
import type LogMetadata from '@models/schema/logMetadata'
import DbOperations from '@models/utils/dbOperations'
import type Dao from '@models/schema/dao'
import type Plugin from '@models/schema/plugin'
import { PluginSettingHandler } from '@src/handlers/pluginSettingHandler'
import { PluginSlug } from '@helpers/pluginSlug'
import Utils from '@helpers/utils'
import Web3Utils from '@helpers/web3Utils'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'handlers:MetadataHandler' })

export const MetadataHandler = {
  metadataSet: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, transactionHash, network, blockNumber, transactionIndex, logIndex } = info

    const daoExists = await Models.Dao.findByAddress(address, network)
    const pluginExists = await Models.Plugin.findByAddress(address, network)
    if (!daoExists && !pluginExists) return

    const existingDaoMetadata = await Models.LogMetadata.findExistingLog({
      network,
      transactionHash,
      transactionIndex,
      logIndex,
    })

    if (existingDaoMetadata) return

    try {
      const metadataUri = Web3Utils.extractMetadataUri(parsedEvent.args.metadata)
      const ipfsMetadata = await IPFSModule.fetchMetadata(metadataUri!, { retries: 4 })

      const logMetadata = {
        network,
        transactionHash,
        transactionIndex,
        logIndex,
        metadataUri: metadataUri!,
        fetchedMetadata: !!ipfsMetadata,
        blockNumber,
        name: ipfsMetadata?.name!,
        description: ipfsMetadata?.description!,
        avatar: Utils.parseAvatar(ipfsMetadata?.avatar),
        links: ipfsMetadata?.links!,
        processKey: ipfsMetadata?.processKey!,
        stageNames: ipfsMetadata?.stageNames!,
        blockedCountries: ipfsMetadata?.blockedCountries || [],
        termsConditionsUrl: ipfsMetadata?.termsConditionsUrl || null,
        enableOfacCheck: ipfsMetadata?.enableOfacCheck || null,
        parentDao: ipfsMetadata?.parentDao || null,
        subDaos: ipfsMetadata?.subDaos || [],
      }

      if (daoExists) {
        await MetadataHandler._handleDaoMetadata(daoExists, logMetadata, info)
      } else if (pluginExists) {
        await MetadataHandler._handlePluginMetadata(pluginExists, logMetadata, ipfsMetadata, info)
      }
    } catch (error) {
      logger.error('Error create metadataSet', llo({ error, info }))
    }
  },

  _handleDaoMetadata: async (dao: Dao, logMetadata: Partial<LogMetadata>, info: ILogInfo) => {
    logMetadata.metadataType = IMetadataType.dao
    logMetadata.daoAddress = dao.address

    const logDb = await DbOperations.createDocument(Models.LogMetadata, logMetadata, info, 'Dao Metadata Set', llo)

    if (logDb) {
      await MetadataHandler._updateDaoMetadata(logDb, info)
    }
  },

  _handlePluginMetadata: async (
    plugin: Plugin,
    logMetadata: Partial<LogMetadata>,
    ipfsMetadata: IMetadata | null,
    info: ILogInfo,
  ) => {
    logMetadata.metadataType = IMetadataType.plugin
    logMetadata.pluginAddress = plugin.address

    const logDb = await DbOperations.createDocument(Models.LogMetadata, logMetadata, info, 'Plugin Metadata Set', llo)

    if (logDb) {
      await MetadataHandler._updatePluginMetadata(logDb)

      if (plugin.isSupported && plugin.status === IPluginStatus.installed) {
        await PluginSlug.updateSlug(plugin, logMetadata.processKey)
      }

      if (plugin.interfaceType === IPluginInterfaceType.spp && ipfsMetadata) {
        await PluginSettingHandler.updateStageNamesOnSppSettings(plugin, logMetadata.stageNames!, info)
      }
    }
  },

  _updatePluginMetadata: async (metadataLog: LogMetadata) => {
    const plugin = await Models.Plugin.findByAddress(metadataLog.pluginAddress, metadataLog.network)
    if (!plugin || !metadataLog.fetchedMetadata) return

    const document = {
      metadataIpfs: metadataLog.metadataUri,
      name: metadataLog.name,
      description: metadataLog.description,
      links: metadataLog.links,
      processKey: metadataLog?.processKey,
      blockedCountries: metadataLog?.blockedCountries || [],
      termsConditionsUrl: metadataLog?.termsConditionsUrl || null,
      enableOfacCheck: metadataLog?.enableOfacCheck || null,
    }

    await DbOperations.updateDocument(plugin, document, { logId: metadataLog.id }, 'Update Plugin Metadata', llo)
  },

  /**
   * Updates DAO metadata and handles parent-child relationships
   *
   * Relationship Rules:
   * 1. A child DAO can have only ONE parent
   * 2. A parent DAO can have MULTIPLE sub-DAOs
   * 3. Relationships are validated against LogMetadata (event audit log)
   * 4. Both sides of the relationship must agree (bidirectional validation)
   */
  _updateDaoMetadata: async (metadataLog: LogMetadata, info: ILogInfo) => {
    const dao = await Models.Dao.findExistingLog({
      network: metadataLog.network,
      address: metadataLog.daoAddress,
    })
    if (!dao || !metadataLog.fetchedMetadata) return

    const { network } = metadataLog
    const currentDaoAddress = dao.address

    const document: Partial<Dao> = {
      metadataIpfs: metadataLog.metadataUri,
      name: metadataLog.name,
      description: metadataLog.description,
      avatar: metadataLog.avatar,
      links: metadataLog.links,
    }

    const newParentAddress = metadataLog.parentDao
    const oldParentAddress = dao.parentDao

    await DbTx.executeTxFn(async ({ session }) => {
      let validatedParent: string | null = null

      if (newParentAddress && newParentAddress !== currentDaoAddress) {
        const parentMetadata = await Models.LogMetadata.getLatestMetadata(
          network,
          newParentAddress,
          IMetadataTargetField.daoAddress,
          { session },
        )
        const isValidParent = parentMetadata?.id && parentMetadata.subDaos?.includes(currentDaoAddress)

        if (isValidParent) {
          validatedParent = newParentAddress
        }
      }

      const parentChanged = validatedParent !== oldParentAddress

      if (parentChanged && oldParentAddress) {
        const oldParentDao = await Models.Dao.findByAddress(oldParentAddress, network, { session })
        if (oldParentDao?.subDaos) {
          const updatedSubDaos = oldParentDao.subDaos.filter((addr: HexAddress) => addr !== currentDaoAddress)
          await oldParentDao.update({ subDaos: updatedSubDaos }, { session })
        }
      }

      if (parentChanged && validatedParent) {
        const parentDao = await Models.Dao.findByAddress(validatedParent, network, { session })
        if (parentDao) {
          const currentSubDaos = parentDao.subDaos || []
          const updatedSubDaos = [...new Set([...currentSubDaos, currentDaoAddress])]
          await parentDao.update({ subDaos: updatedSubDaos }, { session })
        }
      }

      document.parentDao = validatedParent

      const newSubDaoAddresses = metadataLog.subDaos || []
      const oldSubDaoAddresses = dao.subDaos || []
      const uniqueNewSubDaos = [...new Set(newSubDaoAddresses)].filter((addr: string) => addr !== currentDaoAddress)

      const validatedSubDaos: HexAddress[] = []

      for (const subDaoAddress of uniqueNewSubDaos) {
        const subDaoMetadata = await Models.LogMetadata.getLatestMetadata(
          network,
          subDaoAddress,
          IMetadataTargetField.daoAddress,
          { session },
        )
        const isValidChild = subDaoMetadata?.id && subDaoMetadata.parentDao === currentDaoAddress

        if (isValidChild) {
          validatedSubDaos.push(subDaoAddress)

          const subDao = await Models.Dao.findByAddress(subDaoAddress, network, { session })
          if (subDao && subDao.parentDao !== currentDaoAddress) {
            await subDao.update({ parentDao: currentDaoAddress }, { session })
          }
        }
      }

      const removedSubDaos = oldSubDaoAddresses.filter((addr: string) => !validatedSubDaos.includes(addr))

      for (const subDaoAddress of removedSubDaos) {
        const subDao = await Models.Dao.findByAddress(subDaoAddress, network, { session })
        if (subDao && subDao.parentDao === currentDaoAddress) {
          await subDao.update({ parentDao: null }, { session })
        }
      }

      document.subDaos = validatedSubDaos
      await dao.update(document, { session })
      await DbTx.safeCommit(session)

      logger.info('Updated dao metadata', llo({ daoAddress: dao.address, network, info }))
    })
  },
}
