import { Models } from '@dbModels'
import logger from '@logger'
import {
  type HexAddress,
  IEventLogPluginType,
  IPluginRawStatus,
  IPluginStatus,
  type IQueryGetPlugin,
  type NetworksEnum,
} from '@types'
import ProxyContractHelper from '@helpers/proxyContract'
import type LogPluginSetupProcessor from '@models/schema/logPluginSetupProcessor'
import type Plugin from '@models/schema/plugin'
import Web3Helper from '@helpers/web3'
import { AggregationQueryHelper } from '@models/utils/aggregation'
import DbOperations from '@models/utils/dbOperations'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:PluginHandler' })

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
    const query = [
      {
        $match: {
          network,
          daoAddress,
          pluginAddress,
          event: {
            $in: events,
          },
        },
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
          subdomain: '$pluginRepo.subdomain',
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

    if (existingLog) {
      return
    }

    const document: Partial<Plugin> = {
      status: IPluginStatus.installed,
      network: plugin.network,
      blockNumber: plugin.blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(plugin.blockNumber, plugin.network)) || undefined,
      transactionHash: plugin.transactionHash,
      address: plugin.address,
      daoAddress: plugin.daoAddress,
      tokenAddress: plugin.tokenAddress,
      pluginSetupRepoAddress: plugin.pluginSetupRepoAddress,
      sender: plugin.sender,
      release: plugin.release,
      build: plugin.build,
      permissions: plugin.permissions,
      subdomain: plugin.subdomain,
    }

    const implementationAddress = await ProxyContractHelper.getImplementationAddress(plugin.address, plugin.network)
    if (implementationAddress) {
      document.implementationAddress = implementationAddress
    }

    const info = {
      network: plugin.network,
      transactionHash: plugin.transactionHash,
      address: plugin.address,
    }
    return await DbOperations.createDocument(Models.Plugin, document, info, 'New Create Plugin', llo)
  },

  createPlugin: async (pluginLog: LogPluginSetupProcessor) => {
    const plugin = await PluginHandler._queryGetPlugin({
      daoAddress: pluginLog.daoAddress,
      pluginAddress: pluginLog.pluginAddress,
      network: pluginLog.network,
      ...{ events: [IEventLogPluginType.InstallationPrepared, IEventLogPluginType.InstallationApplied] },
    })

    if (!plugin) {
      logger.warn('Create Plugin - event not found', llo({ pluginLog }))
      return
    }

    const dao = await Models.Dao.findByAddress(plugin.daoAddress, plugin.network)
    if (!dao) {
      logger.warn('Create Plugin - dao not found', llo({ pluginLog }))
      return
    }

    await PluginHandler._createPlugin(plugin as any)
  },

  updatePlugin: async (pluginLog: LogPluginSetupProcessor) => {
    const plugin = await PluginHandler._queryGetPlugin({
      ...pluginLog,
      ...{ events: [IEventLogPluginType.UpdatePrepared, IEventLogPluginType.UpdateApplied] },
    })

    if (!plugin) {
      logger.warn('Update Plugin event not found', llo({ pluginLog }))
      return
    }

    const newPlugin = await PluginHandler._createPlugin(plugin as any)

    if (!newPlugin) return

    // we should be able to find out the plugin that was updated
    // newPlugin.release > actualPlugin.release | newPlugin.build > actualPlugin.build
    const actualPlugin = await Models.Plugin.find({
      network: pluginLog.network,
      daoAddress: plugin.daoAddress,
      pluginSetupRepoAddress: plugin.pluginSetupRepoAddress,
      address: plugin.address,
    })

    if (!actualPlugin) return

    const rawPlugin = {
      status: IPluginStatus.deprecated,
      uninstalled: {
        status: true,
        blockNumber: newPlugin.blockNumber,
        blockTimestamp: newPlugin.blockTimestamp,
        transactionHash: newPlugin.transactionHash,
      },
    }
    return await DbOperations.updateDocument(actualPlugin, rawPlugin, { logId: actualPlugin.id }, 'Update plugin', llo)
  },

  uninstallPlugin: async (pluginLog: LogPluginSetupProcessor) => {
    const plugin = await PluginHandler._queryGetPlugin({
      ...pluginLog,
      ...{ events: [IEventLogPluginType.UninstallationPrepared, IEventLogPluginType.UninstallationApplied] },
    })

    if (!plugin) {
      logger.warn('Uninstall Plugin event not found', llo({ pluginLog }))
      return
    }

    const existingLog = await Models.Plugin.findExistingLog({
      network: pluginLog.network,
      transactionHash: plugin.transactionHash,
      address: plugin.address,
    })

    if (!existingLog) return

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

    return await DbOperations.updateDocument(
      existingLog,
      updatePlugin,
      { logId: existingLog.id },
      'Uninstall plugin',
      llo,
    )
  },
}
