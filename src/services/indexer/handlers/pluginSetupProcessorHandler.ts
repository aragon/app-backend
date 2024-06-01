import logger from '@logger'
import { IEventLogPluginType, ITokenType, type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import Utils from '@helpers/utils'
import { UtilsIndexer } from '@models/utils/indexer'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:pluginSetupProcessorHandler' })

export const PluginSetupProcessorHandler = {
  installationApplied: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      blockNumber: txLog.blockNumber,
      network,
    }

    try {
      const existingLog = await Models.LogPluginSetupProcessor.findExistingLog(
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
            pluginAddress: parsedEvent.args.plugin,
            blockNumber: txLog.blockNumber,
            transactionHash: txLog.transactionHash,
          }
          const logDb = await Models.LogPluginSetupProcessor.create(pluginLog, { session })

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New InstallationApplied', llo({ logId: logDb.id, logInfo }))
        })
      }
    } catch (error) {
      logger.error('Error InstallationApplied', llo({ logInfo, error }))
    }
  },

  installationPrepared: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    /**
     * As the tx log can a transaction Object or transaction receipt,
     * We need to properly extract the transaction hash and block number
     *
     * This situation occurs when its is called from the daoRegistryHandler,
     * dao creation lifecycle
     */

    const logInfo: any = {
      txHash: txLog.transactionHash || txLog.hash,
      blockNumber: txLog.blockNumber,
      network,
    }

    try {
      const existingLog = await Models.LogPluginSetupProcessor.findExistingLog(
        logInfo.txHash,
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
            pluginAddress: parsedEvent.args.plugin,
            release: Number(parsedEvent.args.versionTag.release),
            build: Number(parsedEvent.args.versionTag.build),
            blockNumber: txLog.blockNumber,
            transactionHash: logInfo.txHash,
            tokenAddress: null,
          }

          /**
           * If the plugin is tokenBased then we need to save the token address
           * The token address is inside the preparedSetupData tuple (struct) and
           * in the helpers array. The first element of the helpers array is the token address
           * as per the findings
           */

          if (parsedEvent.args.preparedSetupData?.helpers && parsedEvent.args.preparedSetupData.helpers.length === 1) {
            const tokenAddress = parsedEvent.args.preparedSetupData.helpers[0]
            const token = await UtilsIndexer.saveAndGetToken(tokenAddress, network)

            /**
             * If Token type is GovernanceERC20 then we save the token address
             */
            if (token?.type === ITokenType.GovernanceERC20) {
              pluginLog.tokenAddress = tokenAddress
            }
          }

          const logDb = await Models.LogPluginSetupProcessor.create(pluginLog, { session })

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New InstallationPrepared', llo({ logId: logDb.id, logInfo }))
        })
      }
    } catch (error) {
      logger.error('Error InstallationPrepared', llo({ logInfo, error }))
    }
  },

  uninstallationApplied: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      blockNumber: txLog.blockNumber,
      network,
    }

    try {
      const existingLog = await Models.LogPluginSetupProcessor.findExistingLog(
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
            pluginAddress: parsedEvent.args.plugin,
            blockNumber: txLog.blockNumber,
            transactionHash: txLog.transactionHash,
          }
          const logDb = await Models.LogPluginSetupProcessor.create(pluginLog, { session })

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New UninstallationApplied', llo({ logId: logDb.id, logInfo }))
        })
      }
    } catch (error) {
      logger.error('Error UninstallationApplied', llo({ logInfo, error }))
    }
  },

  uninstallationPrepared: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      blockNumber: txLog.blockNumber,
      network,
    }

    try {
      const existingLog = await Models.LogPluginSetupProcessor.findExistingLog(
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
            pluginAddress: parsedEvent.args.plugin,
            release: Number(parsedEvent.args.versionTag.release),
            build: Number(parsedEvent.args.versionTag.build),
            blockNumber: txLog.blockNumber,
            transactionHash: txLog.transactionHash,
          }
          const logDb = await Models.LogPluginSetupProcessor.create(pluginLog, { session })

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New UninstallationPrepared', llo({ logId: logDb.id, logInfo }))
        })
      }
    } catch (error) {
      logger.error('Error UninstallationPrepared', llo({ logInfo, error }))
    }
  },

  updateApplied: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      blockNumber: txLog.blockNumber,
      network,
    }

    try {
      const existingLog = await Models.LogPluginSetupProcessor.findExistingLog(
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
            pluginAddress: parsedEvent.args.plugin,
            blockNumber: txLog.blockNumber,
            transactionHash: txLog.transactionHash,
          }
          const logDb = await Models.LogPluginSetupProcessor.create(pluginLog, { session })

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New UpdateApplied', llo({ logId: logDb.id, logInfo }))
        })
      }
    } catch (error) {
      logger.error('Error UpdateApplied', llo({ logInfo, error }))
    }
  },

  updatePrepared: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      blockNumber: txLog.blockNumber,
      network,
    }

    try {
      const existingLog = await Models.LogPluginSetupProcessor.findExistingLog(
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
            pluginAddress: parsedEvent.args.setupPayload.plugin,
            release: Number(parsedEvent.args.versionTag.release),
            build: Number(parsedEvent.args.versionTag.build),
            blockNumber: txLog.blockNumber,
            transactionHash: txLog.transactionHash,
          }
          const logDb = await Models.LogPluginSetupProcessor.create(pluginLog, { session })

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New UpdatePrepared', llo({ logId: logDb.id, logInfo }))
        })
      }
    } catch (error) {
      logger.error('Error UpdatePrepared', llo({ logInfo, error }))
    }
  },
}
