import logger from '@logger'
import { IEventLogPluginType, type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import Utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:pluginSetupProcessorHandler' })

export const PluginSetupProcessorHandler = {
  installationApplied: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('installationApplied', llo({ parsedEvent }))

    const existingLog = await Models.LogPluginSetupProcessor.findTxHashAndEvent(
      txLog.transactionHash,
      IEventLogPluginType.InstallationApplied,
    )

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const pluginLog = {
          event: IEventLogPluginType.InstallationApplied,
          network,
          daoAddress: parsedEvent.args.dao,
          preparedSetupId: parsedEvent.args.preparedSetupId,
          appliedSetupId: parsedEvent.args.appliedSetupId,
          plugin: parsedEvent.args.plugin,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }
        await Models.LogPluginSetupProcessor.create(pluginLog, { session })

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New InstallationApplied', llo({ pluginLog }))
      })
    }
  },

  installationPrepared: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('installationPrepared', llo({ parsedEvent }))

    const existingLog = await Models.LogPluginSetupProcessor.findTxHashAndEvent(
      txLog.transactionHash,
      IEventLogPluginType.InstallationPrepared,
    )

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const pluginLog = {
          event: IEventLogPluginType.InstallationPrepared,
          network,
          permissions: Utils.parsePermissions(parsedEvent.args.preparedSetupData.permissions),
          sender: parsedEvent.args.sender,
          daoAddress: parsedEvent.args.dao,
          preparedSetupId: parsedEvent.args.preparedSetupId,
          pluginSetupRepo: parsedEvent.args.pluginSetupRepo,
          plugin: parsedEvent.args.plugin,
          release: Number(parsedEvent.args.versionTag.release),
          build: Number(parsedEvent.args.versionTag.build),
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }
        await Models.LogPluginSetupProcessor.create(pluginLog, { session })

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New InstallationPrepared', llo({ pluginLog }))
      })
    }
  },

  uninstallationApplied: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('uninstallationApplied', llo({ parsedEvent }))

    const existingLog = await Models.LogPluginSetupProcessor.findTxHashAndEvent(
      txLog.transactionHash,
      IEventLogPluginType.UninstallationApplied,
    )

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const pluginLog = {
          event: IEventLogPluginType.UninstallationApplied,
          network,
          daoAddress: parsedEvent.args.dao,
          preparedSetupId: parsedEvent.args.preparedSetupId,
          plugin: parsedEvent.args.plugin,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }
        await Models.LogPluginSetupProcessor.create(pluginLog, { session })

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New UninstallationApplied', llo({ pluginLog }))
      })
    }
  },

  uninstallationPrepared: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('uninstallationPrepared', llo({ parsedEvent }))

    const existingLog = await Models.LogPluginSetupProcessor.findTxHashAndEvent(
      txLog.transactionHash,
      IEventLogPluginType.UninstallationPrepared,
    )

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const pluginLog = {
          event: IEventLogPluginType.UninstallationPrepared,
          network,
          permissions: Utils.parsePermissions(parsedEvent.args.preparedSetupData.permissions),
          sender: parsedEvent.args.sender,
          daoAddress: parsedEvent.args.dao,
          preparedSetupId: parsedEvent.args.preparedSetupId,
          pluginSetupRepo: parsedEvent.args.pluginSetupRepo,
          plugin: parsedEvent.args.plugin,
          release: Number(parsedEvent.args.versionTag.release),
          build: Number(parsedEvent.args.versionTag.build),
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }
        await Models.LogPluginSetupProcessor.create(pluginLog, { session })

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New UninstallationPrepared', llo({ pluginLog }))
      })
    }
  },

  updateApplied: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('updateApplied', llo({ parsedEvent }))

    const existingLog = await Models.LogPluginSetupProcessor.findTxHashAndEvent(
      txLog.transactionHash,
      IEventLogPluginType.UpdateApplied,
    )

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const pluginLog = {
          event: IEventLogPluginType.UpdateApplied,
          network,
          daoAddress: parsedEvent.args.dao,
          preparedSetupId: parsedEvent.args.preparedSetupId,
          appliedSetupId: parsedEvent.args.appliedSetupId,
          plugin: parsedEvent.args.plugin,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }
        await Models.LogPluginSetupProcessor.create(pluginLog, { session })

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New UpdateApplied', llo({ pluginLog }))
      })
    }
  },

  updatePrepared: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('updatePrepared', llo({ parsedEvent }))

    const existingLog = await Models.LogPluginSetupProcessor.findTxHashAndEvent(
      txLog.transactionHash,
      IEventLogPluginType.UpdatePrepared,
    )

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const pluginLog = {
          event: IEventLogPluginType.UpdatePrepared,
          network,
          permissions: Utils.parsePermissions(parsedEvent.args.preparedSetupData.permissions),
          sender: parsedEvent.args.sender,
          daoAddress: parsedEvent.args.dao,
          preparedSetupId: parsedEvent.args.preparedSetupId,
          pluginSetupRepo: parsedEvent.args.pluginSetupRepo,
          plugin: parsedEvent.args.setupPayload.plugin,
          release: Number(parsedEvent.args.versionTag.release),
          build: Number(parsedEvent.args.versionTag.build),
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }
        await Models.LogPluginSetupProcessor.create(pluginLog, { session })

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New UpdatePrepared', llo({ pluginLog }))
      })
    }
  },
}
