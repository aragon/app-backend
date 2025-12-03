import logger from '@logger'
import {
  EnumQueueName,
  type HexAddress,
  IEventLogPluginType,
  type ILogInfo,
  IPluginActionType,
  IPluginInterfaceType,
  IPluginStatus,
  ISPPLogs,
} from '@types'
import { Interface, type LogDescription, type TransactionReceipt } from 'ethers'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import { ProxyToken } from '@modules/proxyToken'
import { PluginHandler } from '@src/handlers/pluginHandler'
import type LogPluginSetupProcessor from '@models/schema/logPluginSetupProcessor'
import DbOperations from '@models/utils/dbOperations'
import { PluginSettingHandler } from '@src/handlers/pluginSettingHandler'
import RabbitMQHelper from '@helpers/rabbitMQ'
import GaugeHelper from '@helpers/gauge'
import type Plugin from '@models/schema/plugin'
import { MetadataHandler } from '@handlers/metadataHandler'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import DbTx from '@modules/dbTx'
import Web3Utils from '@helpers/web3Utils'
import VotingEscrowDetector from '@helpers/votingEscrowDetector'
import GovernanceVeHelper from '@helpers/governanceVe'
import LockToVoteHelper from '@helpers/lockToVoteHelper'
import { PluginSlug } from '@helpers/pluginSlug'
import utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'handlers:pluginSetupProcessorHandler' })

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
    try {
      const daoAddress = parsedEvent.args.dao
      const pluginAddress = parsedEvent.args.plugin

      const logPlugin = await DbTx.executeTxFn(async ({ session }) => {
        const existingDao = await Models.Dao.findByAddress(daoAddress, info.network, { session })

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
          permissions: utils.parsePermissions(parsedEvent.args?.preparedSetupData?.permissions),
          sender: parsedEvent.args.sender,
          daoAddress,
          preparedSetupId: parsedEvent.args.preparedSetupId,
          pluginSetupRepo: parsedEvent.args.pluginSetupRepo,
          pluginAddress,
          release: parsedEvent.args.versionTag.release,
          build: parsedEvent.args.versionTag.build,
          blockNumber: info.blockNumber,
          tokenAddress: undefined,
        }

        const logDb = await Models.LogPluginSetupProcessor.create(rawPluginLog, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Created new document - New InstallationPrepared', llo({ ...info, logId: logDb.id }))

        return logDb
      })

      if (!logPlugin) return

      // create the plugin as preInstall
      await PluginSetupProcessorHandler.pluginHandler(IPluginActionType.preInstall, logPlugin)
      const pluginDb = await Models.Plugin.findByAddress(parsedEvent.args.plugin, info.network)
      if (!pluginDb) {
        logger.error('Plugin preInstall error', llo({ pluginAddress, info }))
        return
      }

      const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, info.network)
      // check and update token
      await PluginSetupProcessorHandler.findAndUpdateTokenAddress(pluginDb, info)
      // check and handle metadata
      await PluginSetupProcessorHandler.updateMetadataOnPreInstall(pluginDb, txReceipt!)
      // find settings
      await PluginSettingHandler.handlePluginSettingByType(pluginDb, txReceipt!, info)
    } catch (error) {
      logger.error('Error in installationPrepared', llo({ error, info }))
    }
  },

  updateMetadataOnPreInstall: async (plugin: Plugin, txReceipt: TransactionReceipt) => {
    const iFace = new Interface(StagedProposalProcessor.abi)
    const metadataLogTopics = iFace.getEvent('MetadataSet')?.topicHash!

    const metadataLog = txReceipt?.logs.find(
      log => log.topics[0] === metadataLogTopics && log.address === plugin.address,
    )

    if (metadataLog) {
      try {
        const parsedEvent = Web3Utils.parseLog(metadataLog, iFace)
        if (parsedEvent) {
          const logInfo = Web3Utils.parseInfoLog(metadataLog, ISPPLogs.MetadataSet, plugin.network)

          await MetadataHandler.metadataSet(parsedEvent, logInfo)
        }
      } catch (_) {
        logger.error('Error parsing metadata log', llo({ pluginAddress: plugin.address }))
      }
    }
  },

  installationApplied: async (parsedEvent: LogDescription, info: ILogInfo, isHistorical?: boolean) => {
    const daoAddress = parsedEvent.args.dao
    const pluginAddress = parsedEvent.args.plugin
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
      pluginAddress,
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
    const pluginDb = await Models.Plugin.findByAddress(pluginAddress, info.network)
    if (!pluginDb) {
      logger.error('Plugin preInstall error', llo({ pluginAddress, info }))
      return
    }

    await PluginSettingHandler.handlePluginSettingByType(pluginDb, txReceipt!, info)

    if (pluginDb?.interfaceType === IPluginInterfaceType.gauge) {
      // create manual settings for gauge
      await PluginSettingHandler.gaugeSettings(pluginDb, info)
    }

    if (
      pluginDb?.interfaceType === IPluginInterfaceType.admin ||
      pluginDb?.interfaceType === IPluginInterfaceType.gauge ||
      pluginDb.interfaceType === IPluginInterfaceType.capitalDistributor
    ) {
      // mark as an active plugin with no settings
      await PluginSettingHandler.isSupported(pluginDb, info)
    }

    if (
      pluginDb?.interfaceType === IPluginInterfaceType.router ||
      pluginDb?.interfaceType === IPluginInterfaceType.claimer
    ) {
      const linkStatus = await PluginSettingHandler.linkPolicySourceAndModel(pluginDb, info)
      if (linkStatus) {
        await PluginSettingHandler.isSupported(pluginDb, info)
      }
    }

    await RabbitMQHelper.sendMessage(EnumQueueName.plugins, {
      id: pluginDb.address,
      params: { address: pluginDb.address, network: pluginDb.network, isHistorical },
    })
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
      permissions: utils.parsePermissions(parsedEvent.args?.preparedSetupData?.permissions),
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
      permissions: utils.parsePermissions(
        parsedEvent.args?.preparedSetupData?.permissions || parsedEvent?.args?.permissions,
      ),
      sender: parsedEvent.args.sender,
      daoAddress,
      preparedSetupId: parsedEvent.args.preparedSetupId,
      pluginSetupRepo: parsedEvent.args.pluginSetupRepo,
      pluginAddress: parsedEvent.args.plugin || parsedEvent.args.setupPayload.plugin,
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

    const logDb = await Models.LogPluginSetupProcessor.create({
      event: IEventLogPluginType.UninstallationApplied,
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      daoAddress,
      preparedSetupId: parsedEvent.args.preparedSetupId,
      pluginAddress: parsedEvent.args.plugin,
      blockNumber: info.blockNumber,
    })

    await PluginSetupProcessorHandler.pluginHandler(IPluginActionType.uninstalled, logDb)

    const plugin = await Models.Plugin.findOne({
      network: logDb.network,
      daoAddress: logDb.daoAddress,
      address: logDb.pluginAddress,
      status: IPluginStatus.uninstalled,
    })

    if (plugin?.subPlugins?.length) {
      const addresses = [...new Set(plugin.subPlugins.flatMap(w => w.addresses))]

      await utils.asyncParallel(
        addresses.map(pluginAddress => async () => {
          const existingPlugin = await Models.Plugin.findOne({
            network: info.network,
            address: pluginAddress,
          })

          if (!existingPlugin) return // nothing to update

          // check if its used by any other plugins
          const otherPlugin = await Models.Plugin.findOne({
            'subPlugins.addresses': pluginAddress,
            network: info.network,
            address: { $ne: plugin.address },
          })

          if (otherPlugin) return

          const uninstalledPlugin = await DbOperations.updateDocument(
            existingPlugin,
            {
              status: IPluginStatus.abandoned,
              uninstalled: {
                status: true,
                transactionHash: plugin.transactionHash,
                blockNumber: plugin.blockNumber,
                blockTimestamp: 0,
              },
            },
            { logId: existingPlugin.id },
            'Uninstall plugin',
            llo,
          )

          await PluginSlug.deleteSlug(uninstalledPlugin)
        }),
        (error: { message: any }) => {
          logger.error(`Failed to uninstall subPlugin: ${error.message}`, { error })
        },
      )
    }
  },

  findAndUpdateTokenAddress: async (pluginDb: Plugin, info: ILogInfo) => {
    let tokenAddress: any = null
    switch (pluginDb.interfaceType) {
      case IPluginInterfaceType.tokenVoting:
        tokenAddress = await Web3Helper.getVotingToken(pluginDb.address, info.network)
        break
      case IPluginInterfaceType.gauge:
        tokenAddress = await GaugeHelper.getIVotesAdapterAddress(pluginDb.address, info.network)

        break
      case IPluginInterfaceType.lockToVote:
        tokenAddress = await LockToVoteHelper.getVotingToken(info.network, pluginDb.address)
        break
      default:
        break
    }

    if (tokenAddress) {
      const result = await PluginSetupProcessorHandler.findVotingEscrow(tokenAddress, info)
      const lockManagerAddress = await LockToVoteHelper.getLockManager(info.network, pluginDb.address)
      const votingEscrow = result || null

      await DbOperations.updateDocument(
        pluginDb,
        { tokenAddress, votingEscrow, lockManagerAddress },
        info,
        'Update Voting plugin token',
        llo,
      )
      await ProxyToken.saveAndGetToken(tokenAddress, info.network)
    }
  },

  findVotingEscrow: async (
    tokenAddress: HexAddress,
    info: ILogInfo,
  ): Promise<{
    curveAddress: HexAddress
    exitQueueAddress: HexAddress
    escrowAddress: HexAddress
    clockAddress: HexAddress
    nftLockAddress: HexAddress
    underlying: HexAddress
  } | null> => {
    // check if the token is a tokenVotesAdapter
    const escrowAddress = await GovernanceVeHelper.getEscrowAddress(tokenAddress, info.network)

    if (escrowAddress) {
      // check if the escrowAddress is following our spec
      const result = await VotingEscrowDetector.isVotingEscrow(escrowAddress, info.network)
      if (result.status) {
        const clockAddress = await GovernanceVeHelper.getClockAddress(tokenAddress, info.network)
        const curveAddress = await GovernanceVeHelper.getCurveAddress(escrowAddress, info.network)
        const exitQueueAddress = await GovernanceVeHelper.getExitQueueAddress(escrowAddress, info.network)
        const nftLockAddress = await GovernanceVeHelper.getNftLockAddress(escrowAddress, info.network)
        const erc20TokenAddress = await GovernanceVeHelper.getErc20TokenAddress(escrowAddress, info.network)

        if (clockAddress && curveAddress && exitQueueAddress && nftLockAddress && erc20TokenAddress) {
          await ProxyToken.saveAndGetToken(nftLockAddress, info.network)

          return {
            curveAddress,
            exitQueueAddress,
            escrowAddress,
            clockAddress,
            nftLockAddress,
            underlying: erc20TokenAddress, // take the real erc20 token address from the voting escrow
          }
        }
      }
    }

    return null
  },
}
