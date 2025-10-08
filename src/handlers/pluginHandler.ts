import { Models } from '@dbModels'
import logger from '@logger'
import {
  type HexAddress,
  IEventLogPluginType,
  type ILogInfo,
  IMetadataTargetField,
  IPluginInterfaceType,
  IPluginRawStatus,
  IPluginStatus,
  type IQueryGetPlugin,
  type NetworksEnum,
  EnumQueueName,
} from '@types'
import type LogPluginSetupProcessor from '@models/schema/logPluginSetupProcessor'
import type Plugin from '@models/schema/plugin'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import { AggregationQueryHelper } from '@models/utils/aggregation'
import DbOperations from '@models/utils/dbOperations'
import PluginDetector from '@helpers/pluginDetector'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { PluginSlug } from '@helpers/pluginSlug'
import DbTx from '@modules/dbTx'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import { MetadataHandler } from '@handlers/metadataHandler'
import RabbitMQHelper from '@src/helpers/rabbitMQ'
import { ethers, Interface } from 'ethers'
import { DAO } from '@artifacts/dao'
import { IPermission } from '@src/types/permission'

const llo = logger.logMeta.bind(null, { service: 'handlers:PluginHandler' })

const InstallationAppliedTopicHash = new Interface(PluginSetupProcessor.abi).getEvent('InstallationApplied')?.topicHash!
const GrantedTopicHash = new Interface(DAO.abi).getEvent('Granted')?.topicHash!
const RevokeTopicHash = new Interface(DAO.abi).getEvent('Revoke')?.topicHash!

export const PluginHandler = {
  async _queryGetPlugin({
    daoAddress,
    pluginAddress,
    network,
    events = [],
  }: {
    daoAddress: HexAddress
    pluginAddress: HexAddress
    network: NetworksEnum
    events: IEventLogPluginType[]
  }): Promise<IQueryGetPlugin | undefined> {
    const filter: any = { event: { $in: events } }

    if (pluginAddress) {
      filter.pluginAddress = pluginAddress
    }
    if (daoAddress) {
      filter.daoAddress = daoAddress
    }
    if (network) {
      filter.network = network
    }

    const query = [
      {
        $match: filter,
      },
      {
        $sort: {
          preparedSetupId: 1,
          event: 1,
        },
      },
      {
        $group: {
          _id: {
            preparedSetupId: '$preparedSetupId',
            network: '$network',
          },
          events: {
            $push: {
              eventType: '$event',
              document: '$$ROOT',
            },
          },
        },
      },
      {
        $match: {
          $expr: {
            $gte: [{ $size: '$events' }, 2],
          },
        },
      },
      {
        $project: {
          mergedEvent: {
            $reduce: {
              input: '$events.document',
              initialValue: {},
              in: {
                $mergeObjects: [
                  '$$value',
                  {
                    eventCombination: {
                      $concat: [{ $ifNull: ['$$this.event', ''] }, '|', { $ifNull: ['$$value.event', ''] }],
                    },
                    event: '$$this.event',
                    transactionHash: { $ifNull: ['$$value.transactionHash', '$$this.transactionHash'] },
                    blockNumber: { $ifNull: ['$$value.blockNumber', '$$this.blockNumber'] },
                    network: { $ifNull: ['$$this.network', '$$value.network'] },
                    address: { $ifNull: ['$$this.pluginAddress', '$$value.pluginAddress'] },
                    daoAddress: { $ifNull: ['$$this.daoAddress', '$$value.daoAddress'] },
                    preparedSetupId: { $ifNull: ['$$this.preparedSetupId', '$$value.preparedSetupId'] },
                    appliedSetupId: { $ifNull: ['$$this.appliedSetupId', '$$value.appliedSetupId'] },
                    pluginSetupRepoAddress: { $ifNull: ['$$this.pluginSetupRepo', '$$value.pluginSetupRepo'] },
                    sender: { $ifNull: ['$$this.sender', '$$value.sender'] },
                    release: { $ifNull: ['$$this.release', '$$value.release'] },
                    build: { $ifNull: ['$$this.build', '$$value.build'] },
                    tokenAddress: { $ifNull: ['$$this.tokenAddress', '$$value.tokenAddress'] },
                    permissions: {
                      $cond: {
                        if: {
                          $or: [
                            {
                              $gt: [
                                { $size: { $ifNull: ['$$this.permissions', []] } },
                                { $size: { $ifNull: ['$$value.permissions', []] } },
                              ],
                            },
                            { $eq: [{ $size: { $ifNull: ['$$value.permissions', []] } }, 0] },
                          ],
                        },
                        then: '$$this.permissions',
                        else: '$$value.permissions',
                      },
                    },
                    action: {
                      $switch: {
                        branches: [
                          {
                            case: {
                              $and: [
                                { $in: ['InstallationPrepared', ['$$this.event']] },
                                { $in: ['InstallationApplied', ['$$value.event']] },
                              ],
                            },
                            then: IPluginRawStatus.install,
                          },
                          {
                            case: {
                              $and: [
                                { $in: ['UpdatePrepared', ['$$this.event']] },
                                { $in: ['UpdateApplied', ['$$value.event']] },
                              ],
                            },
                            then: IPluginRawStatus.update,
                          },
                          {
                            case: {
                              $and: [
                                { $in: ['UninstallationPrepared', ['$$this.event']] },
                                { $in: ['UninstallationApplied', ['$$value.event']] },
                              ],
                            },
                            then: IPluginRawStatus.uninstall,
                          },
                        ],
                        default: null,
                      },
                    },
                  },
                ],
              },
            },
          },
          eventType: { $arrayElemAt: ['$events.eventType', 1] },
        },
      },
      {
        $replaceRoot: { newRoot: '$mergedEvent' },
      },
      {
        $match: { action: { $ne: null } },
      },
      AggregationQueryHelper.pluginRepo('$pluginSetupRepoAddress', '$network'),
      {
        $unwind: {
          path: '$pluginRepo',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          action: 1,
          transactionHash: 1,
          blockNumber: 1,
          network: 1,
          address: 1,
          daoAddress: 1,
          tokenAddress: 1,
          preparedSetupId: 1,
          appliedSetupId: 1,
          pluginSetupRepoAddress: 1,
          sender: 1,
          release: 1,
          build: 1,
          permissions: 1,
          subdomain: {
            $ifNull: ['$pluginRepo.subdomain', null],
          },
        },
      },

      // uninstall
      //        {
      //            $group: {
      //                _id: {
      //                    address: "$address",
      //                    network: "$network",
      //                },
      //                documents: { $push: "$$ROOT" },
      //                hasUninstall: {
      //                    $max: {
      //                        $cond: [{ $eq: ["$action", "uninstall"] }, 1, 0],
      //                    },
      //                },
      //                maxBlockNumber: { $max: "$blockNumber" },
      //            },
      //        },
      //        {
      //            $match: {
      //                hasUninstall: 0, // Exclude groups that have an uninstall action
      //            },
      //        },
      //        {
      //            $project: {
      //                document: {
      //                    $filter: {
      //                        input: "$documents",
      //                        as: "doc",
      //                        cond: {
      //                            $eq: ["$$doc.blockNumber", "$maxBlockNumber"],
      //                        },
      //                    },
      //                },
      //            },
      //        },
      //        {
      //            $unwind: "$document",
      //        },
      //        {
      //            $replaceRoot: {
      //                newRoot: "$document",
      //            },
      //        },
    ]
    const plugins = await Models.LogPluginSetupProcessor.aggregate(query)

    if (!plugins || plugins.length === 0) {
      return
    }

    return plugins[0]
  },

  _createPlugin: async (plugin: IQueryGetPlugin): Promise<Plugin | undefined> => {
    const existingLog = await Models.Plugin.findExistingLog({
      network: plugin.network,
      transactionHash: plugin.transactionHash,
      address: plugin.address,
    })

    if (existingLog) return

    const document: Partial<Plugin> = {
      status: IPluginStatus.installed,
      network: plugin.network,
      blockNumber: plugin.blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(plugin.blockNumber, plugin.network)) || undefined,
      transactionHash: plugin.transactionHash,
      address: plugin.address,
      daoAddress: plugin.daoAddress,
      pluginSetupRepoAddress: plugin.pluginSetupRepoAddress,
      sender: plugin.sender,
      release: plugin.release,
      build: plugin.build,
      permissions: plugin.permissions,
      subdomain: plugin.subdomain,
      tokenAddress: plugin.tokenAddress,
      proposalCreationConditionAddress: PluginHandler.findProposalConditionAddress(plugin.permissions || []),
    }

    const pluginInfo = await PluginDetector.detectPluginType(plugin.address, plugin.network)
    document.interfaceType = pluginInfo?.type

    if (document.interfaceType === IPluginInterfaceType.tokenVoting) {
      // maybe the token is not a erc20 governance
      document.tokenAddress = plugin.tokenAddress
    }

    if (pluginInfo?.implementationAddress) {
      document.implementationAddress = pluginInfo.implementationAddress
    }

    if (document.interfaceType === IPluginInterfaceType.spp) {
      document.isProcess = true
      document.isBody = false
      document.isSubPlugin = false
    } else if (document.interfaceType === IPluginInterfaceType.capitalDistributor) {
      document.isProcess = false
      document.isBody = false
      document.isSubPlugin = false
    } else {
      document.isProcess = true
      document.isBody = true
      document.isSubPlugin = false
    }

    const info = {
      network: plugin.network,
      transactionHash: plugin.transactionHash,
      address: plugin.address,
    }
    return await DbOperations.createDocument(Models.Plugin, document, info, 'New Create Plugin', llo)
  },

  preInstallPlugin: async (pluginLog: LogPluginSetupProcessor) => {
    const dao = await Models.Dao.findByAddress(pluginLog.daoAddress, pluginLog.network)
    if (!dao) {
      logger.warn('Create Plugin - dao not found', llo({ pluginLog }))
      return
    }

    try {
      await DbTx.executeTxFn(async ({ session }) => {
        const existingLog = await Models.Plugin.findExistingLog(
          {
            network: pluginLog.network,
            transactionHash: pluginLog.transactionHash,
            address: pluginLog.pluginAddress,
          },
          { session },
        )

        if (existingLog) return

        const pluginRepo = await Models.PluginRepo.findSubdomain(pluginLog.pluginSetupRepo, pluginLog.network, {
          session,
        })
        const document: Partial<Plugin> = {
          status: IPluginStatus.preInstall,
          network: pluginLog.network,
          blockNumber: pluginLog.blockNumber,
          blockTimestamp: (await Web3Helper.getBlockTimestamp(pluginLog.blockNumber, pluginLog.network)) || undefined,
          transactionHash: pluginLog.transactionHash,
          address: pluginLog.pluginAddress,
          daoAddress: pluginLog.daoAddress,
          pluginSetupRepoAddress: pluginLog.pluginSetupRepo,
          sender: pluginLog.sender,
          release: pluginLog.release,
          build: pluginLog.build,
          permissions: pluginLog.permissions,
          subdomain: pluginRepo?.subdomain,
          proposalCreationConditionAddress: PluginHandler.findProposalConditionAddress(pluginLog.permissions || []),
        }

        const pluginInfo = await PluginDetector.detectPluginType(pluginLog.pluginAddress, pluginLog.network)
        document.interfaceType = pluginInfo?.type

        if (
          document.interfaceType === IPluginInterfaceType.tokenVoting ||
          document.interfaceType === IPluginInterfaceType.gauge
        ) {
          document.tokenAddress = pluginLog.tokenAddress
        }

        if (pluginInfo?.implementationAddress) {
          document.implementationAddress = pluginInfo.implementationAddress
        }

        if (document.interfaceType === IPluginInterfaceType.spp) {
          document.isProcess = true
          document.isBody = false
          document.isSubPlugin = false
        } else if (document.interfaceType === IPluginInterfaceType.capitalDistributor) {
          document.isProcess = false
          document.isBody = false
          document.isSubPlugin = false
        } else {
          document.isProcess = true
          document.isBody = true
          document.isSubPlugin = false
        }

        const info = {
          network: pluginLog.network,
          transactionHash: pluginLog.transactionHash,
          address: pluginLog.pluginAddress,
        }

        const logDb = await Models.Plugin.create(document, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose(
          'Created new document - New PreInstall Plugin',
          llo({ info, documentId: logDb.id, pluginId: pluginLog.id }),
        )
      })
    } catch (error) {
      logger.error('Error PreInstall Plugin', llo({ pluginId: pluginLog.id, error }))
    }
  },

  installPlugin: async (pluginLog: LogPluginSetupProcessor) => {
    const rawPlugin = await PluginHandler._queryGetPlugin({
      daoAddress: pluginLog.daoAddress,
      pluginAddress: pluginLog.pluginAddress,
      network: pluginLog.network,
      ...{ events: [IEventLogPluginType.InstallationPrepared, IEventLogPluginType.InstallationApplied] },
    })

    try {
      const plugin = await DbTx.executeTxFn(async ({ session }) => {
        const preInstalledPlugin = await Models.Plugin.findOne(
          {
            network: pluginLog.network,
            address: pluginLog.pluginAddress,
          },
          null,
          { session },
        )

        if (!preInstalledPlugin) {
          logger.error('PreInstalledPlugin not found', llo({ pluginLog }))
          return
        }

        if (preInstalledPlugin.status !== IPluginStatus.preInstall) {
          logger.warn('Plugin not in preInstall status', llo({ pluginLog, pluginStatus: preInstalledPlugin.status }))
          return
        }

        const document = {
          status: IPluginStatus.installed,
          pluginSetupRepoAddress: rawPlugin?.pluginSetupRepoAddress,
        }

        const plugin = await preInstalledPlugin.update(document, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Updated document - Installed plugin', llo({ documentId: plugin.id }))
        return plugin
      })

      if (!plugin) return

      await PluginSlug.generateSlug(plugin, plugin?.processKey)
    } catch (error) {
      logger.error('Error Install Plugin', llo({ pluginLog, error }))
    }
  },

  updatePlugin: async (pluginLog: LogPluginSetupProcessor) => {
    const rawPlugin = await PluginHandler._queryGetPlugin({
      daoAddress: pluginLog.daoAddress,
      pluginAddress: pluginLog.pluginAddress,
      network: pluginLog.network,
      ...{ events: [IEventLogPluginType.UpdatePrepared, IEventLogPluginType.UpdateApplied] },
    })

    if (!rawPlugin) {
      logger.warn('Update Plugin event not found', llo({ pluginLog }))
      return
    }

    try {
      const newPlugin = await PluginHandler._createPlugin(rawPlugin as any)
      if (!newPlugin) return

      const previousPlugin = await Models.Plugin.findOne({
        network: pluginLog.network,
        daoAddress: rawPlugin.daoAddress,
        pluginSetupRepoAddress: rawPlugin.pluginSetupRepoAddress,
        address: rawPlugin.address,
        status: IPluginStatus.installed,
        blockNumber: { $lt: newPlugin.blockNumber },
      })

      const lastSavedMetadata = await Models.LogMetadata.getLatestMetadata(
        newPlugin.network,
        newPlugin.address,
        IMetadataTargetField.pluginAddress,
      )

      if (!previousPlugin) {
        logger.warn('Previous plugin not found for update', llo({ pluginLog }))
        return
      }

      await DaoRegistryHandler.handleVersionUpgrade(newPlugin.daoAddress, {
        network: newPlugin.network,
        transactionHash: newPlugin.transactionHash,
        blockNumber: newPlugin.blockNumber,
      })

      await DbTx.executeTxFn(async ({ session }) => {
        const inheritedProperties = PluginHandler._getInheritedProperties(previousPlugin, newPlugin)

        await previousPlugin.update(
          {
            status: IPluginStatus.deprecated,
            isSupported: false,
            uninstalled: {
              status: true,
              blockNumber: newPlugin.blockNumber,
              blockTimestamp: newPlugin.blockTimestamp,
              transactionHash: newPlugin.transactionHash,
            },
          },
          { session },
        )

        if (Object.keys(inheritedProperties).length > 0) {
          await newPlugin.update(inheritedProperties, { session })
        }

        await session.commitTransaction()
        await session.endSession()

        logger.verbose('Updated document - Deprecated plugin', llo({ documentId: previousPlugin.id }))
        if (Object.keys(inheritedProperties).length > 0) {
          logger.verbose('Updated document - Inherited properties', llo({ documentId: newPlugin.id }))
        }
      })

      if (lastSavedMetadata) {
        await MetadataHandler._updatePluginMetadata(lastSavedMetadata)
      }
    } catch (error) {
      logger.error('Error UpdatePlugin', llo({ pluginLog, error }))
    }
  },

  _getInheritedProperties: (previousPlugin: Plugin, newPlugin: Plugin): Partial<Plugin> => {
    const inheritedProps: any = {
      isBody: previousPlugin.isBody,
      isProcess: previousPlugin.isProcess,
      isSubPlugin: previousPlugin.isSubPlugin,
      parentPlugin: previousPlugin.parentPlugin,
      isSupported: previousPlugin.isSupported,
      stageIndex: previousPlugin.stageIndex,
    }

    if (
      newPlugin.interfaceType === IPluginInterfaceType.tokenVoting &&
      previousPlugin.interfaceType === IPluginInterfaceType.tokenVoting &&
      !newPlugin.tokenAddress &&
      previousPlugin.tokenAddress
    ) {
      inheritedProps.tokenAddress = previousPlugin.tokenAddress
    }

    if (previousPlugin.votingEscrow) {
      inheritedProps.votingEscrow = previousPlugin.votingEscrow
    }

    if (
      newPlugin.interfaceType === IPluginInterfaceType.lockToVote &&
      previousPlugin.interfaceType === IPluginInterfaceType.lockToVote &&
      !newPlugin.lockManagerAddress &&
      previousPlugin.lockManagerAddress
    ) {
      inheritedProps.lockManagerAddress = previousPlugin.lockManagerAddress
      inheritedProps.tokenAddress = previousPlugin.tokenAddress
    }

    return inheritedProps
  },

  uninstallPluginWithPermissionRevoke: async (
    pluginAddress: string,
    daoAddress: string,
    network: NetworksEnum,
    info: ILogInfo,
  ) => {
    try {
      const plugin = await Models.Plugin.findOne({
        address: pluginAddress,
        daoAddress,
        network,
      })

      if (!plugin || plugin.status === IPluginStatus.uninstalled) {
        return
      }

      const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, network)
      const uninstallationAppliedLogs = Web3Utils.findLogsByName(
        txReceipt!,
        IEventLogPluginType.UninstallationApplied,
        PluginSetupProcessor.abi,
      )

      const installationPreparedLogs = Web3Utils.findLogsByName(
        txReceipt!,
        IEventLogPluginType.InstallationPrepared,
        PluginSetupProcessor.abi,
      )

      if (uninstallationAppliedLogs.length > 0 || installationPreparedLogs.length > 0) {
        return
      }

      const pluginInfo = await PluginDetector.detectPluginType(pluginAddress, network)
      if (pluginInfo.hasTarget) {
        const targetConfig = await Web3Helper.getTargetConfig(network, plugin.address)
        if (targetConfig && targetConfig !== plugin.daoAddress) {
          return
        }
      }

      const updatedDocument = {
        status: IPluginStatus.uninstalled,
        uninstalled: {
          status: true,
          transactionHash: info.transactionHash,
          blockNumber: info.blockNumber,
          blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, network)) || undefined,
        },
      }

      const uninstalledPlugin = await DbOperations.updateDocument(
        plugin,
        updatedDocument,
        { logId: plugin.id, info },
        'Uninstall plugin',
        llo,
      )

      await PluginSlug.deleteSlug(uninstalledPlugin)

      return uninstalledPlugin
    } catch (error) {
      logger.error('Error Uninstall Plugin', llo({ pluginAddress, daoAddress, network, info, error }))
    }
  },

  installPluginOnPermissionGranted: async (whereAddress: HexAddress, whoAddress: HexAddress, info: ILogInfo) => {
    try {
      const [daoDb, pluginDb, txReceipt] = await Promise.all([
        Models.Dao.findByAddress(whereAddress, info.network),
        Models.Plugin.findByAddress(whoAddress, info.network),
        Web3Helper.getTransactionReceipt(info.transactionHash, info.network),
      ])

      if (!daoDb || !pluginDb || !txReceipt) {
        return
      }

      const installationAppliedLogs = txReceipt.logs.filter(log => InstallationAppliedTopicHash === log.topics[0])

      const executePermissionId = ethers.id('EXECUTE_PERMISSION')

      if (pluginDb.status !== IPluginStatus.uninstalled) {
        return
      }

      // After the applied log, we need to check if there is a next execute permission event
      // So we can be sure that we need to install the plugin

      if (installationAppliedLogs.length > 0) {
        const lastAppliedLog = Web3Utils.parseInfoLog(
          installationAppliedLogs[installationAppliedLogs.length - 1],
          IEventLogPluginType.InstallationApplied,
          info.network,
        )
        const lastAppliedLogIndex = lastAppliedLog.logIndex

        const nextPermissionEvent = txReceipt.logs.find((log: any) => {
          const parsedLog = Web3Utils.parseInfoLog(log, 'Event', info.network)
          const isPermissionEvent =
            parsedLog.address === daoDb.address &&
            (log.topics[0] === GrantedTopicHash || log.topics[0] === RevokeTopicHash) &&
            log.topics[1] === executePermissionId
          return isPermissionEvent && parsedLog.logIndex > lastAppliedLogIndex
        })

        if (!nextPermissionEvent) {
          return
        }
      }

      const pluginInfo = await PluginDetector.detectPluginType(pluginDb.address, info.network)
      if (pluginInfo.hasTarget) {
        const targetConfig = await Web3Helper.getTargetConfig(info.network, pluginDb.address)
        if (targetConfig && targetConfig !== daoDb.address) {
          return
        }
      }

      const updatedDocument = {
        status: IPluginStatus.installed,
        uninstalled: {
          status: false,
          transactionHash: info.transactionHash,
          blockNumber: info.blockNumber,
          blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
        },
      }

      const installedPlugin = await DbOperations.updateDocument(
        pluginDb,
        updatedDocument,
        { logId: pluginDb.id, info },
        'Installed plugin',
        llo,
      )

      await PluginSlug.generateSlug(installedPlugin, installedPlugin.processKey)

      return installedPlugin
    } catch (error) {
      logger.error('Error Install Plugin On Permission Granted', llo({ whereAddress, whoAddress, error }))
    }
  },

  uninstallPlugin: async (pluginLog: LogPluginSetupProcessor) => {
    try {
      const plugin = await PluginHandler._queryGetPlugin({
        daoAddress: pluginLog.daoAddress,
        pluginAddress: pluginLog.pluginAddress,
        network: pluginLog.network,
        ...{ events: [IEventLogPluginType.UninstallationPrepared, IEventLogPluginType.UninstallationApplied] },
      })

      if (!plugin) {
        logger.warn('Uninstall Plugin event not found', llo({ pluginLog }))
        return
      }

      const existingPlugin = await Models.Plugin.findOne({
        network: pluginLog.network,
        daoAddress: plugin.daoAddress,
        pluginSetupRepoAddress: plugin.pluginSetupRepoAddress,
        address: plugin.address,
        status: IPluginStatus.installed,
      })

      if (!existingPlugin) return

      const blockTimestamp = (await Web3Helper.getBlockTimestamp(plugin.blockNumber, plugin.network)) || undefined
      const updatePlugin: Partial<Plugin> = {
        status: IPluginStatus.uninstalled,
        uninstalled: {
          status: true,
          transactionHash: plugin.transactionHash,
          blockNumber: plugin.blockNumber,
          blockTimestamp: blockTimestamp!,
        },
      }

      const uninstalledPlugin = await DbOperations.updateDocument(
        existingPlugin,
        updatePlugin,
        { logId: existingPlugin.id },
        'Uninstall plugin',
        llo,
      )

      await PluginSlug.deleteSlug(uninstalledPlugin)

      return uninstalledPlugin
    } catch (error) {
      logger.error('Error Uninstall Plugin', llo({ pluginLog, error }))
    }
  },

  updateConditionAddress: async (
    pluginAddress: HexAddress,
    daoAddress: HexAddress,
    network: NetworksEnum,
    conditionAddress: HexAddress | null,
  ): Promise<void> => {
    const plugin = await Models.Plugin.findOne({
      address: pluginAddress,
      daoAddress,
      network,
    })

    if (!plugin) {
      logger.warn('Plugin not found for updating condition address', llo({ pluginAddress, daoAddress, network }))
      return
    }

    if (plugin.conditionAddress === conditionAddress) {
      return
    }

    await DbOperations.updateDocument(
      plugin,
      { conditionAddress },
      { logId: plugin.id, conditionAddress },
      'Update Plugin Condition Address',
      llo,
    )

    await RabbitMQHelper.sendMessage(EnumQueueName.logSelectorPermission, {
      id: plugin.id,
      params: {
        address: plugin.address,
        network: plugin.network,
        conditionAddress,
      },
    })
  },

  findProposalConditionAddress(permissions: any[]): HexAddress {
    const proposalPermissionId = ethers.id(IPermission.CREATE_PROPOSAL_PERMISSION)
    const permission = permissions.find(p => p.permissionId === proposalPermissionId)
    if (permission) {
      return permission.condition
    }
    return ethers.ZeroAddress
  },
}
