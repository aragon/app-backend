import logger from '@logger'
import { IEventLogPluginMembership, IEventLogPluginType, type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import Utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import { TokenVoting } from '@artifacts/TokenVoting'
import { ProxyToken } from '@modules/proxyToken'
import { AggregatorPlugin } from '@services/aragon-indexer/aggregator/plugin'
import type LogPluginSetupProcessor from '@models/schema/logPluginSetupProcessor'
import DbOperations from '@models/utils/dbOperations'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:pluginSetupProcessorHandler' })

export enum IPluginActionType {
  installed = 'installed',
  updated = 'updated',
  uninstalled = 'uninstalled',
}

export const PluginSetupProcessorHandler = {
  aggregateLog: async (action: IPluginActionType, logDb: LogPluginSetupProcessor) => {
    switch (action) {
      case IPluginActionType.installed: {
        await AggregatorPlugin.createPlugin(logDb)
        break
      }
      case IPluginActionType.updated: {
        await AggregatorPlugin.updatePlugin(logDb)
        break
      }
      case IPluginActionType.uninstalled: {
        await AggregatorPlugin.uninstallPlugin(logDb)
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
      transactionHash: info.transactionHash,
      event: IEventLogPluginType.InstallationApplied,
    })
    if (existingLog) return

    const pluginLog: Partial<LogPluginSetupProcessor> = {
      event: IEventLogPluginType.InstallationApplied,
      network: info.network,
      daoAddress,
      preparedSetupId: parsedEvent.args.preparedSetupId,
      appliedSetupId: parsedEvent.args.appliedSetupId,
      pluginAddress: parsedEvent.args.plugin,
      blockNumber: info.blockNumber,
      transactionHash: info.transactionHash,
    }

    const logDb = await DbOperations.createDocument(
      Models.LogPluginSetupProcessor,
      pluginLog,
      info,
      'New InstallationApplied',
      llo,
    )
    await PluginSetupProcessorHandler.aggregateLog(IPluginActionType.installed, logDb)
  },

  installationPrepared: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.dao
    const existingDao = await Models.Dao.findByAddress(daoAddress, info.network)

    if (!existingDao) {
      logger.warn('Dao not found', llo({ ...info, daoAddress }))
      return
    }

    const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
      transactionHash: info.transactionHash,
      event: IEventLogPluginType.InstallationPrepared,
    })
    if (existingLog) return

    const rawPluginLog: Partial<LogPluginSetupProcessor> = {
      event: IEventLogPluginType.InstallationPrepared,
      network: info.network,
      permissions: Utils.parsePermissions(parsedEvent.args?.preparedSetupData?.permissions),
      sender: parsedEvent.args.sender,
      daoAddress,
      preparedSetupId: parsedEvent.args.preparedSetupId,
      pluginSetupRepo: parsedEvent.args.pluginSetupRepo,
      pluginAddress: parsedEvent.args.plugin,
      release: parsedEvent.args.versionTag.release,
      build: parsedEvent.args.versionTag.build,
      blockNumber: info.blockNumber,
      transactionHash: info.transactionHash,
      tokenAddress: undefined,
    }

    const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, info.network)
    const pluginSetupLogs = Web3Helper.findLogsByName(
      txReceipt!,
      IEventLogPluginMembership.MembershipContractAnnounced,
      TokenVoting.abi,
    )

    if (pluginSetupLogs.length > 0) {
      const tokenAddress = pluginSetupLogs[0]?.parsed?.args?.[0]
      if (tokenAddress) {
        const tokenDb = await ProxyToken.saveAndGetToken(tokenAddress, info.network)
        rawPluginLog.tokenAddress = tokenDb?.address || tokenAddress
      }
    }

    await DbOperations.createDocument(
      Models.LogPluginSetupProcessor,
      rawPluginLog,
      info,
      'New InstallationPrepared',
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
      transactionHash: info.transactionHash,
      event: IEventLogPluginType.UninstallationApplied,
    })
    if (existingLog) return

    const pluginLog: Partial<LogPluginSetupProcessor> = {
      event: IEventLogPluginType.UninstallationApplied,
      network: info.network,
      daoAddress,
      preparedSetupId: parsedEvent.args.preparedSetupId,
      pluginAddress: parsedEvent.args.plugin,
      blockNumber: info.blockNumber,
      transactionHash: info.transactionHash,
    }

    const logDb = await DbOperations.createDocument(
      Models.LogPluginSetupProcessor,
      pluginLog,
      info,
      'New UninstallationApplied',
      llo,
    )
    await PluginSetupProcessorHandler.aggregateLog(IPluginActionType.uninstalled, logDb)
  },

  uninstallationPrepared: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.dao
    const existingDao = await Models.Dao.findByAddress(daoAddress, info.network)

    if (!existingDao) {
      logger.warn('Dao not found', llo({ ...info, daoAddress }))
      return
    }

    const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
      transactionHash: info.transactionHash,
      event: IEventLogPluginType.UninstallationPrepared,
    })
    if (existingLog) return

    const pluginLog: Partial<LogPluginSetupProcessor> = {
      event: IEventLogPluginType.UninstallationPrepared,
      network: info.network,
      permissions: Utils.parsePermissions(parsedEvent.args?.preparedSetupData?.permissions),
      sender: parsedEvent.args.sender,
      daoAddress,
      preparedSetupId: parsedEvent.args.preparedSetupId,
      pluginSetupRepo: parsedEvent.args.pluginSetupRepo,
      pluginAddress: parsedEvent.args.plugin,
      release: parsedEvent.args.versionTag.release,
      build: parsedEvent.args.versionTag.build,
      blockNumber: info.blockNumber,
      transactionHash: info.transactionHash,
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
      transactionHash: info.transactionHash,
      event: IEventLogPluginType.UpdateApplied,
    })
    if (existingLog) return

    const pluginLog: Partial<LogPluginSetupProcessor> = {
      event: IEventLogPluginType.UpdateApplied,
      network: info.network,
      daoAddress,
      preparedSetupId: parsedEvent.args.preparedSetupId,
      appliedSetupId: parsedEvent.args.appliedSetupId,
      pluginAddress: parsedEvent.args.plugin,
      blockNumber: info.blockNumber,
      transactionHash: info.transactionHash,
    }

    const logDb = await DbOperations.createDocument(
      Models.LogPluginSetupProcessor,
      pluginLog,
      info,
      'New UpdateApplied',
      llo,
    )
    await PluginSetupProcessorHandler.aggregateLog(IPluginActionType.updated, logDb)
  },

  updatePrepared: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.dao
    const existingDao = await Models.Dao.findByAddress(daoAddress, info.network)

    if (!existingDao) {
      logger.warn('Dao not found', llo({ ...info, daoAddress }))
      return
    }

    const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
      transactionHash: info.transactionHash,
      event: IEventLogPluginType.UpdatePrepared,
    })
    if (existingLog) return

    const pluginLog: Partial<LogPluginSetupProcessor> = {
      event: IEventLogPluginType.UpdatePrepared,
      network: info.network,
      permissions: Utils.parsePermissions(parsedEvent.args?.preparedSetupData?.permissions),
      sender: parsedEvent.args.sender,
      daoAddress,
      preparedSetupId: parsedEvent.args.preparedSetupId,
      pluginSetupRepo: parsedEvent.args.pluginSetupRepo,
      pluginAddress: parsedEvent.args.setupPayload.plugin,
      release: parsedEvent.args.versionTag.release,
      build: parsedEvent.args.versionTag.build,
      blockNumber: info.blockNumber,
      transactionHash: info.transactionHash,
    }

    await DbOperations.createDocument(Models.LogPluginSetupProcessor, pluginLog, info, 'New UpdatePrepared', llo)
  },
}
