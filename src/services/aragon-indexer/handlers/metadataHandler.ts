import logger from '@logger'
import { type ILogInfo, type IMetadata, IMetadataType, IPluginInterfaceType } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import IPFSModule from '@modules/ipfs'
import type LogMetadata from '@models/schema/logMetadata'
import DbOperations from '@models/utils/dbOperations'
import type Dao from '@models/schema/dao'
import type Plugin from '@models/schema/plugin'
import { PluginSettingHandler } from '@indexer/handlers/pluginSettingHandler'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:handlers:MetadataHandler' })

export const MetadataHandler = {
  metadataSet: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, transactionHash, network, blockNumber, transactionIndex, logIndex } = info

    const daoExists = await Models.Dao.findByAddress(address, network)
    const pluginExists = await Models.Plugin.findByAddress(address, network)

    const existingDaoMetadata = await Models.LogMetadata.findExistingLog({
      network,
      transactionHash,
      transactionIndex,
      logIndex,
    })

    if (existingDaoMetadata) return

    if (!daoExists && !pluginExists) return

    const metadataUri = Web3Helper.extractMetadataUri(parsedEvent.args.metadata)
    const ipfsMetadata = await IPFSModule.fetchMetadata(metadataUri!, { retries: 1 })

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
      avatar: ipfsMetadata?.avatar!,
      links: ipfsMetadata?.links!,
      processKey: ipfsMetadata?.processKey!,
      stageNames: ipfsMetadata?.stageNames!,
    }

    if (daoExists) {
      await MetadataHandler._handleDaoMetadata(daoExists, logMetadata, info)
    } else if (pluginExists) {
      await MetadataHandler._handlePluginMetadata(pluginExists, logMetadata, ipfsMetadata, info)
    } else {
      logger.error('Metadata Set: Dao or Plugin not found', llo({ address, network }))
    }
  },

  _handleDaoMetadata: async (dao: Dao, logMetadata: Partial<LogMetadata>, info: ILogInfo) => {
    logMetadata.metadataType = IMetadataType.dao
    logMetadata.daoAddress = dao.address

    const logDb = await DbOperations.createDocument(Models.LogMetadata, logMetadata, info, 'Dao Metadata Set', llo)

    if (logDb) {
      await MetadataHandler._updateDaoMetadata(logDb)
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
    }
    await DbOperations.updateDocument(plugin, document, { logId: metadataLog.id }, 'Update Plugin Metadata', llo)
  },

  _updateDaoMetadata: async (metadataLog: LogMetadata) => {
    const dao = await Models.Dao.findExistingLog({
      network: metadataLog.network,
      address: metadataLog.daoAddress,
    })
    if (!dao || !metadataLog.fetchedMetadata) return

    const document = {
      metadataIpfs: metadataLog.metadataUri,
      name: metadataLog.name,
      description: metadataLog.description,
      avatar: metadataLog.avatar,
      links: metadataLog.links,
    }
    await DbOperations.updateDocument(dao, document, { logId: metadataLog.id }, 'Update Dao Metadata', llo)
  },
}
