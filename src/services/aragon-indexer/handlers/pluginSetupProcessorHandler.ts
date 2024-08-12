import logger from '@logger'
import { IEventLogPluginMembership, IEventLogPluginType, type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import Utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import { TokenVoting } from '@artifacts/TokenVoting'
import { TokenProxy } from '@modules/tokenProxy'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:pluginSetupProcessorHandler' })

export const PluginSetupProcessorHandler = {
  installationApplied: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.dao
    const existingDao = await Models.LogDaoRegistry.findByAddress(daoAddress, info.network)

    if (!existingDao) {
      logger.warn('dao not found', llo({ ...info, parsedEvent }))
      return
    }

    try {
      const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
        transactionHash: info.transactionHash,
        event: IEventLogPluginType.InstallationApplied,
      })

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const pluginLog = {
            event: IEventLogPluginType.InstallationApplied,
            network: info.network,
            daoAddress,
            preparedSetupId: parsedEvent.args.preparedSetupId,
            appliedSetupId: parsedEvent.args.appliedSetupId,
            pluginAddress: parsedEvent.args.plugin,
            blockNumber: info.blockNumber,
            transactionHash: info.transactionHash,
          }
          const logDb = await Models.LogPluginSetupProcessor.create(pluginLog, { session } as any)

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New InstallationApplied', llo({ ...info, logId: logDb.id }))
        })
      }
    } catch (error) {
      logger.error('Error InstallationApplied', llo({ ...info, error }))
    }
  },

  installationPrepared: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.dao
    const existingDao = await Models.LogDaoRegistry.findByAddress(daoAddress, info.network)

    if (!existingDao) {
      logger.warn('dao not found', llo({ ...info, parsedEvent }))
      return
    }

    try {
      const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
        transactionHash: info.transactionHash,
        event: IEventLogPluginType.InstallationPrepared,
      })

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const rawPluginLog = {
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

          /**
           * If the plugin is tokenBased then we need to save the token address
           */
          const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, info.network)
          const pluginSetupLogs = Web3Helper.findLogsByName(
            txReceipt!,
            IEventLogPluginMembership.MembershipContractAnnounced,
            TokenVoting.abi,
          )

          if (pluginSetupLogs.length > 0) {
            const tokenAddress = pluginSetupLogs[0]?.parsed?.args?.[0]

            if (tokenAddress) {
              const tokenDb = await TokenProxy.saveAndGetToken(tokenAddress, info.network)
              rawPluginLog.tokenAddress = tokenDb?.address || tokenAddress
            }
          }

          const logDb = await Models.LogPluginSetupProcessor.create(rawPluginLog, { session } as any)

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New InstallationPrepared', llo({ ...info, logId: logDb.id }))
        })
      }
    } catch (error) {
      logger.error('Error InstallationPrepared', llo({ ...info, error }))
    }
  },

  uninstallationApplied: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.dao
    const existingDao = await Models.LogDaoRegistry.findByAddress(daoAddress, info.network)

    if (!existingDao) {
      logger.warn('dao not found', llo({ ...info, parsedEvent }))
      return
    }

    try {
      const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
        transactionHash: info.transactionHash,
        event: IEventLogPluginType.UninstallationApplied,
      })

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const pluginLog = {
            event: IEventLogPluginType.UninstallationApplied,
            network: info.network,
            daoAddress,
            preparedSetupId: parsedEvent.args.preparedSetupId,
            pluginAddress: parsedEvent.args.plugin,
            blockNumber: info.blockNumber,
            transactionHash: info.transactionHash,
          }
          const logDb = await Models.LogPluginSetupProcessor.create(pluginLog, { session } as any)

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New UninstallationApplied', llo({ ...info, logId: logDb.id }))
        })
      }
    } catch (error) {
      logger.error('Error UninstallationApplied', llo({ ...info, error }))
    }
  },

  uninstallationPrepared: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.dao
    const existingDao = await Models.LogDaoRegistry.findByAddress(daoAddress, info.network)

    if (!existingDao) {
      logger.warn('dao not found', llo({ ...info, parsedEvent }))
      return
    }

    try {
      const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
        transactionHash: info.transactionHash,
        event: IEventLogPluginType.UninstallationPrepared,
      })

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const pluginLog = {
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
          const logDb = await Models.LogPluginSetupProcessor.create(pluginLog, { session } as any)

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New UninstallationPrepared', llo({ ...info, logId: logDb.id }))
        })
      }
    } catch (error) {
      logger.error('Error UninstallationPrepared', llo({ ...info, error }))
    }
  },

  updateApplied: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.dao
    const existingDao = await Models.LogDaoRegistry.findByAddress(daoAddress, info.network)

    if (!existingDao) {
      logger.warn('dao not found', llo({ ...info, parsedEvent }))
      return
    }

    try {
      const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
        transactionHash: info.transactionHash,
        event: IEventLogPluginType.UpdateApplied,
      })

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const pluginLog = {
            event: IEventLogPluginType.UpdateApplied,
            network: info.network,
            daoAddress,
            preparedSetupId: parsedEvent.args.preparedSetupId,
            appliedSetupId: parsedEvent.args.appliedSetupId,
            pluginAddress: parsedEvent.args.plugin,
            blockNumber: info.blockNumber,
            transactionHash: info.transactionHash,
          }
          const logDb = await Models.LogPluginSetupProcessor.create(pluginLog, { session } as any)

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New UpdateApplied', llo({ ...info, logId: logDb.id }))
        })
      }
    } catch (error) {
      logger.error('Error UpdateApplied', llo({ ...info, error }))
    }
  },

  updatePrepared: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.dao
    const existingDao = await Models.LogDaoRegistry.findByAddress(daoAddress, info.network)

    if (!existingDao) {
      logger.warn('dao not found', llo({ ...info, parsedEvent }))
      return
    }

    try {
      const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
        transactionHash: info.transactionHash,
        event: IEventLogPluginType.UpdatePrepared,
      })

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const pluginLog = {
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
          const logDb = await Models.LogPluginSetupProcessor.create(pluginLog, { session } as any)

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New UpdatePrepared', llo({ ...info, logId: logDb.id }))
        })
      }
    } catch (error) {
      logger.error('Error UpdatePrepared', llo({ ...info, error }))
    }
  },
}
