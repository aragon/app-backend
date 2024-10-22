import logger from '@logger'
import { IEventLogPluginMembership, IEventLogPluginType, type ILogInfo, IPluginInterfaceType } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import Utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import { TokenVoting } from '@artifacts/TokenVoting'
import { ProxyToken } from '@modules/proxyToken'
import { PluginHandler } from '@indexer/handlers/pluginHandler'
import type LogPluginSetupProcessor from '@models/schema/logPluginSetupProcessor'
import DbOperations from '@models/utils/dbOperations'
import { LogTokenVoting } from '@indexer/logTokenVoting'
import { LogMultiSig } from '@indexer/logMultisig'
import { LogAdmin } from '@indexer/logAdmin'
import { LogSpp } from '@indexer/logSPP'
import { PluginSettingHandler } from '@indexer/handlers/pluginSettingHandler'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:handlers:pluginSetupProcessorHandler' })

export enum IPluginActionType {
  preInstall = 'pre-install',
  installed = 'installed',
  updated = 'updated',
  uninstalled = 'uninstalled',
}

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

  installationApplied: async (parsedEvent: LogDescription, info: ILogInfo) => {
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
    await PluginSetupProcessorHandler.pluginHandler(IPluginActionType.installed, logDb)

    const pluginDb = await Models.Plugin.findByAddress(parsedEvent.args.plugin, info.network)

    if (pluginDb?.interfaceType === IPluginInterfaceType.spp) {
      const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, info.network)
      await PluginSettingHandler.handleFromReceipt(txReceipt!, info)
      await LogSpp.start(pluginDb)
    } else if (pluginDb?.interfaceType === IPluginInterfaceType.admin) {
      await LogAdmin.start(pluginDb)
      await PluginSettingHandler.isSupported(pluginDb, info)
    }
  },

  handleSingleInstallationPrepared: async ({ txLog, parsed }: any, logInfo: ILogInfo, tokenAddress?: any) => {
    const rawPluginLog: Partial<LogPluginSetupProcessor> = {
      event: IEventLogPluginType.InstallationPrepared,
      network: logInfo.network,
      transactionHash: txLog.transactionHash,
      transactionIndex: txLog.transactionIndex,
      logIndex: txLog.logIndex,
      permissions: Utils.parsePermissions(parsed.args?.preparedSetupData?.permissions),
      sender: parsed.args.sender,
      daoAddress: parsed.args.dao,
      preparedSetupId: parsed.args.preparedSetupId,
      pluginSetupRepo: parsed.args.pluginSetupRepo,
      pluginAddress: parsed.args.plugin,
      release: parsed.args.versionTag.release,
      build: parsed.args.versionTag.build,
      blockNumber: txLog.blockNumber,
      tokenAddress: undefined,
    }

    if (tokenAddress) {
      const tokenDb = await ProxyToken.saveAndGetToken(tokenAddress, logInfo.network)
      rawPluginLog.tokenAddress = tokenDb?.address || tokenAddress
    }

    const logDb = await DbOperations.createDocument(
      Models.LogPluginSetupProcessor,
      rawPluginLog,
      logInfo,
      'New InstallationPrepared',
      llo,
    )

    await PluginSetupProcessorHandler.pluginHandler(IPluginActionType.preInstall, logDb)
  },

  installationPrepared: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.dao
    const existingDao = await Models.Dao.findByAddress(daoAddress, info.network)

    if (!existingDao) {
      logger.warn('Dao not found', llo({ ...info, daoAddress }))
      return
    }

    const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, info.network)

    const installationPreparingLogs = Web3Helper.findLogsByName(
      txReceipt!,
      IEventLogPluginType.InstallationPrepared,
      PluginSetupProcessor.abi,
    )

    const memberShipAnnouncedLogs = Web3Helper.findLogsByName(
      txReceipt!,
      IEventLogPluginMembership.MembershipContractAnnounced,
      TokenVoting.abi,
    )

    const parsedMembershipAnnouncedLogs = memberShipAnnouncedLogs.reduce((parsed: any, log: any) => {
      parsed.push({
        [log.txLog.address]: log.parsed.args[0],
      })
      return parsed
    }, [])

    await Promise.all(
      installationPreparingLogs.map(async (installationPreparingLog: any) => {
        const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
          network: info.network,
          transactionHash: installationPreparingLog.txLog.transactionHash,
          transactionIndex: installationPreparingLog.txLog.transactionIndex,
          logIndex: installationPreparingLog.txLog.logIndex,
          event: IEventLogPluginType.InstallationPrepared,
        })
        if (!existingLog) {
          const logInfo = Web3Helper.parseInfoLog(installationPreparingLog.txLog, 'InstallationPrepared', info.network)
          const memberShipAnnouncedLog = parsedMembershipAnnouncedLogs.find(
            (parsed: any) => parsed[installationPreparingLog.parsed.args.plugin],
          )
          const tokenAddress = memberShipAnnouncedLog
            ? memberShipAnnouncedLog[installationPreparingLog.parsed.args.plugin]
            : undefined

          await PluginSetupProcessorHandler.handleSingleInstallationPrepared(
            installationPreparingLog,
            logInfo,
            tokenAddress,
          )
        }
      }),
    )

    const plugins = await PluginSettingHandler.handleFromReceipt(txReceipt!, info)

    await Promise.all([
      ...plugins.map(async (plugin: any) => {
        if (plugin.interfaceType === IPluginInterfaceType.tokenVoting) {
          await LogTokenVoting.start(plugin)
        } else if (plugin.interfaceType === IPluginInterfaceType.multisig) {
          await LogMultiSig.start(plugin)
        }
        // admin have no settings so it we need different way to support and fetch
        // as spp also has installation applied on another tx so we need to handle it differently
      }),
    ])
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
}
