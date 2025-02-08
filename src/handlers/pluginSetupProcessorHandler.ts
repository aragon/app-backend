import logger from '@logger'
import {
  EnumQueueName,
  type HexAddress,
  IEventLogPluginMembership,
  IEventLogPluginType,
  type ILogInfo,
  IPluginActionType,
  IPluginInterfaceType,
} from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import Utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import { TokenVoting } from '@artifacts/TokenVoting'
import { ProxyToken } from '@modules/proxyToken'
import { PluginHandler } from '@src/handlers/pluginHandler'
import type LogPluginSetupProcessor from '@models/schema/logPluginSetupProcessor'
import DbOperations from '@models/utils/dbOperations'
import { PluginSettingHandler } from '@src/handlers/pluginSettingHandler'
import { RabbitMQHelper } from '@helpers/radditMQ'
import GaugeHelper from '@helpers/gauge'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:handlers:pluginSetupProcessorHandler' })

export const PluginSetupProcessorHandler = {
  pluginHandler: async (action: IPluginActionType, logDb: LogPluginSetupProcessor) => {
    switch (action) {
      case IPluginActionType.preInstall: {
        await PluginHandler.preInstallPlugin(logDb)
        break
      }
      case IPluginActionType.installed: {
        await PluginHandler.installPlugin(logDb)
        break
      }
      case IPluginActionType.updated: {
        await PluginHandler.updatePlugin(logDb)
        break
      }
      case IPluginActionType.uninstalled: {
        await PluginHandler.uninstallPlugin(logDb)
        break
      }
      default: {
        logger.error('Plugin action type not found', llo({ action, logDb }))
      }
    }
  },

  installationPrepared: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.dao
    const pluginAddress = parsedEvent.args.plugin
    const existingDao = await Models.Dao.findByAddress(daoAddress, info.network)

    if (!existingDao) {
      logger.warn('Dao not found', llo({ ...info, daoAddress }))
      return
    }

    const rawPluginLog: Partial<LogPluginSetupProcessor> = {
      event: IEventLogPluginType.InstallationPrepared,
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      permissions: Utils.parsePermissions(parsedEvent.args?.preparedSetupData?.permissions),
      sender: parsedEvent.args.sender,
      daoAddress: parsedEvent.args.dao,
      preparedSetupId: parsedEvent.args.preparedSetupId,
      pluginSetupRepo: parsedEvent.args.pluginSetupRepo,
      pluginAddress: parsedEvent.args.plugin,
      release: parsedEvent.args.versionTag.release,
      build: parsedEvent.args.versionTag.build,
      blockNumber: info.blockNumber,
      tokenAddress: undefined,
    }

    const tokenAddress = await PluginSetupProcessorHandler.findTokenFromLog(pluginAddress, info)
    if (tokenAddress) {
      const tokenDb = await ProxyToken.saveAndGetToken(tokenAddress, info.network)
      rawPluginLog.tokenAddress = tokenDb?.address || tokenAddress
    }

    const logDb = await DbOperations.createDocument(
      Models.LogPluginSetupProcessor,
      rawPluginLog,
      info,
      'New InstallationPrepared',
      llo,
    )

    // create the plugin as preInstall
    await PluginSetupProcessorHandler.pluginHandler(IPluginActionType.preInstall, logDb)

    // find settings
    const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, info.network)
    await PluginSettingHandler.handleFromReceipt(txReceipt!, info)
  },

  installationApplied: async (parsedEvent: LogDescription, info: ILogInfo, isHistorical?: boolean) => {
    const daoAddress = parsedEvent.args.dao
    const existingDao = await Models.Dao.findByAddress(daoAddress, info.network)

    if (!existingDao) {
      logger.warn('Dao not found', llo({ ...info, daoAddress }))
      return
    }

    const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      event: IEventLogPluginType.InstallationApplied,
    })
    if (existingLog) return

    const pluginLog: Partial<LogPluginSetupProcessor> = {
      event: IEventLogPluginType.InstallationApplied,
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      daoAddress,
      preparedSetupId: parsedEvent.args.preparedSetupId,
      appliedSetupId: parsedEvent.args.appliedSetupId,
      pluginAddress: parsedEvent.args.plugin,
      blockNumber: info.blockNumber,
    }

    const logDb = await DbOperations.createDocument(
      Models.LogPluginSetupProcessor,
      pluginLog,
      info,
      'New InstallationApplied',
      llo,
    )
    // update the plugin as install
    await PluginSetupProcessorHandler.pluginHandler(IPluginActionType.installed, logDb)

    // find settings
    const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, info.network)
    const pluginFromSettings = await PluginSettingHandler.handleFromReceipt(txReceipt!, info)

    const pluginDb = await Models.Plugin.findByAddress(parsedEvent.args.plugin, info.network)

    if (
      pluginDb?.interfaceType === IPluginInterfaceType.admin ||
      pluginDb?.interfaceType === IPluginInterfaceType.gauge
    ) {
      // mark as active plugin with no settings
      await PluginSettingHandler.isSupported(pluginDb, info)
    }

    if (pluginDb?.interfaceType === IPluginInterfaceType.spp) {
      // When spp re-sync all plugins related to the dao
      await Promise.all([
        pluginFromSettings.map(async (plugin: any) => {
          await RabbitMQHelper.sendMessage(EnumQueueName.plugins, {
            id: plugin.address,
            params: { address: plugin.address, network: plugin.network },
          })
        }),
      ])
    } else {
      // Sync single plugin
      await RabbitMQHelper.sendMessage(EnumQueueName.plugins, {
        id: pluginDb.address,
        params: { address: pluginDb.address, network: pluginDb.network, isHistorical },
      })
    }
  },

  updatePrepared: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.dao
    const existingDao = await Models.Dao.findByAddress(daoAddress, info.network)

    if (!existingDao) {
      logger.warn('Dao not found', llo({ ...info, daoAddress }))
      return
    }

    const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      event: IEventLogPluginType.UpdatePrepared,
    })
    if (existingLog) return

    const pluginLog: Partial<LogPluginSetupProcessor> = {
      event: IEventLogPluginType.UpdatePrepared,
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      permissions: Utils.parsePermissions(parsedEvent.args?.preparedSetupData?.permissions),
      sender: parsedEvent.args.sender,
      daoAddress,
      preparedSetupId: parsedEvent.args.preparedSetupId,
      pluginSetupRepo: parsedEvent.args.pluginSetupRepo,
      pluginAddress: parsedEvent.args.setupPayload.plugin,
      release: parsedEvent.args.versionTag.release,
      build: parsedEvent.args.versionTag.build,
      blockNumber: info.blockNumber,
    }

    await DbOperations.createDocument(Models.LogPluginSetupProcessor, pluginLog, info, 'New UpdatePrepared', llo)
  },

  updateApplied: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.dao
    const existingDao = await Models.Dao.findByAddress(daoAddress, info.network)

    if (!existingDao) {
      logger.warn('Dao not found', llo({ ...info, daoAddress }))
      return
    }

    const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      event: IEventLogPluginType.UpdateApplied,
    })
    if (existingLog) return

    const pluginLog: Partial<LogPluginSetupProcessor> = {
      event: IEventLogPluginType.UpdateApplied,
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      daoAddress,
      preparedSetupId: parsedEvent.args.preparedSetupId,
      appliedSetupId: parsedEvent.args.appliedSetupId,
      pluginAddress: parsedEvent.args.plugin,
      blockNumber: info.blockNumber,
    }

    const logDb = await DbOperations.createDocument(
      Models.LogPluginSetupProcessor,
      pluginLog,
      info,
      'New UpdateApplied',
      llo,
    )
    await PluginSetupProcessorHandler.pluginHandler(IPluginActionType.updated, logDb)
  },

  uninstallationPrepared: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.dao
    const existingDao = await Models.Dao.findByAddress(daoAddress, info.network)

    if (!existingDao) {
      logger.warn('Dao not found', llo({ ...info, daoAddress }))
      return
    }

    const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      event: IEventLogPluginType.UninstallationPrepared,
    })
    if (existingLog) return

    const pluginLog: Partial<LogPluginSetupProcessor> = {
      event: IEventLogPluginType.UninstallationPrepared,
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      permissions: Utils.parsePermissions(parsedEvent.args?.preparedSetupData?.permissions),
      sender: parsedEvent.args.sender,
      daoAddress,
      preparedSetupId: parsedEvent.args.preparedSetupId,
      pluginSetupRepo: parsedEvent.args.pluginSetupRepo,
      pluginAddress: parsedEvent.args.plugin,
      release: parsedEvent.args.versionTag.release,
      build: parsedEvent.args.versionTag.build,
      blockNumber: info.blockNumber,
    }

    await DbOperations.createDocument(
      Models.LogPluginSetupProcessor,
      pluginLog,
      info,
      'New UninstallationPrepared',
      llo,
    )
  },

  uninstallationApplied: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.dao
    const existingDao = await Models.Dao.findByAddress(daoAddress, info.network)

    if (!existingDao) {
      logger.warn('Dao not found', llo({ ...info, daoAddress }))
      return
    }

    const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      event: IEventLogPluginType.UninstallationApplied,
    })
    if (existingLog) return

    const pluginLog: Partial<LogPluginSetupProcessor> = {
      event: IEventLogPluginType.UninstallationApplied,
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      daoAddress,
      preparedSetupId: parsedEvent.args.preparedSetupId,
      pluginAddress: parsedEvent.args.plugin,
      blockNumber: info.blockNumber,
    }

    const logDb = await DbOperations.createDocument(
      Models.LogPluginSetupProcessor,
      pluginLog,
      info,
      'New UninstallationApplied',
      llo,
    )
    await PluginSetupProcessorHandler.pluginHandler(IPluginActionType.uninstalled, logDb)
  },

  findTokenFromLog: async (pluginAddress: HexAddress, info: ILogInfo): Promise<HexAddress | null> => {
    try {
      const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, info.network)

      const memberShipAnnouncedLogs = Web3Helper.findLogsByName(
        txReceipt!,
        IEventLogPluginMembership.MembershipContractAnnounced,
        TokenVoting.abi,
      )

      let tokenAddress: any = null
      const memberShipLog = memberShipAnnouncedLogs.find(log => log.txLog.address === pluginAddress)
      if (memberShipLog) {
        tokenAddress = memberShipLog?.parsed?.args[0]
      }

      if (!tokenAddress) {
        // try to get token address from gauge plugin
        tokenAddress = await GaugeHelper.getTokenAddress(pluginAddress, info.network)
      }

      if (tokenAddress) {
        const web3TokenInfo = await Web3Helper.getTokenDetails(tokenAddress, info.network)

        tokenAddress = web3TokenInfo.decimals === 0 ? null : tokenAddress
        return tokenAddress
      }
    } catch (error) {
      logger.error('Error finding token from log', llo({ pluginAddress, info, error }))
    }

    return null
  },
}
