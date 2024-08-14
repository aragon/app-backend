import {Models} from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import {HexAddress, IEventLogPluginType, IPluginStatus, IQueryGetPlugin, type NetworksEnum} from '@types'
import ProxyContractHelper from '@helpers/proxyContract'
import LogPluginSetupProcessor from '@models/schema/logPluginSetupProcessor'
import Plugin from '@models/schema/plugin'
import Web3Helper from '@helpers/web3'
import {AggregationQueryHelper} from '@models/utils/aggregation'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorPlugin' })

export const AggregatorPlugin = {
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
          _id: '$preparedSetupId',
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
                    // event: { $ifNull: ['$$this.event', '$$value.event'] },
                    transactionHash: { $ifNull: ['$$this.transactionHash', '$$value.transactionHash'] },
                    blockNumber: { $ifNull: ['$$this.blockNumber', '$$value.blockNumber'] },
                    network: { $ifNull: ['$$this.network', '$$value.network'] },
                    address: { $ifNull: ['$$this.pluginAddress', '$$value.pluginAddress'] },
                    daoAddress: { $ifNull: ['$$this.daoAddress', '$$value.daoAddress'] },
                    preparedSetupId: { $ifNull: ['$$this.preparedSetupId', '$$value.preparedSetupId'] },
                    appliedSetupId: { $ifNull: ['$$this.appliedSetupId', '$$value.appliedSetupId'] },
                    pluginRepoAddress: { $ifNull: ['$$this.pluginSetupRepo', '$$value.pluginSetupRepo'] },
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
      AggregationQueryHelper.logPluginRepo('$pluginRepoAddress', '$network'),
      {
        $unwind: {
          path: '$pluginRepo',
        },
      },
      {
        $project: {
          transactionHash: 1,
          blockNumber: 1,
          network: 1,
          address: 1,
          daoAddress: 1,
          tokenAddress: 1,
          preparedSetupId: 1,
          appliedSetupId: 1,
          pluginRepoAddress: 1,
          sender: 1,
          release: 1,
          build: 1,
          permissions: 1,
          subdomain: '$pluginRepo.subdomain',
        },
      },
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
      blockTimestamp: await Web3Helper.getBlockTimestamp(plugin.blockNumber, plugin.network!) || undefined,
      transactionHash: plugin.transactionHash,
      address: plugin.address,
      daoAddress: plugin.daoAddress,
      tokenAddress: plugin.tokenAddress,
      pluginRepoAddress: plugin.pluginRepoAddress,
      sender: plugin.sender,
      release: plugin.release,
      build: plugin.build,
      permissions: plugin.permissions,
      subdomain: plugin.subdomain,
    }

    const implementationAddress = await ProxyContractHelper.getImplementationAddress(plugin.address!, plugin.network!)
    if (implementationAddress) {
      document.implementationAddress = implementationAddress
    }

    const newPlugin = await DbTx.executeTxFn(async ({ session }) => {
      const logDb = await Models.Plugin.create(document as any, { session } as any)
      await session.commitTransaction()
      await session.endSession()
      logger.verbose('Create Plugin', llo({ logId: logDb?.id }))
      return logDb
    })

    return newPlugin
  },

  createPlugin: async (pluginLog: LogPluginSetupProcessor) => {
    const plugin = await AggregatorPlugin._queryGetPlugin({
      daoAddress: pluginLog.daoAddress,
      pluginAddress: pluginLog.pluginAddress,
      network: pluginLog.network,
      ...{ events: [IEventLogPluginType.InstallationPrepared, IEventLogPluginType.InstallationApplied] },
    })

    if (!plugin) {
      logger.warn('Create Plugin event not found', llo({ pluginLog }))
      return
    }

    await AggregatorPlugin._createPlugin(plugin as any)
  },

  updatePlugin: async (pluginLog: LogPluginSetupProcessor) => {
    const plugin = await AggregatorPlugin._queryGetPlugin({
      ...pluginLog,
      ...{ events: [IEventLogPluginType.UpdatePrepared, IEventLogPluginType.UpdateApplied] },
    })

    if (!plugin) {
      logger.warn('Update Plugin event not found', llo({ pluginLog }))
      return
    }

    const newPlugin = await AggregatorPlugin._createPlugin(plugin as any)

    if(newPlugin) {

      // we should be able to find out the plugin that was updated
      // newPlugin.release > actualPlugin.release | newPlugin.build > actualPlugin.build
      const actualPlugin = await Models.Plugin.find({
        network: pluginLog.network,
        daoAddress: plugin.daoAddress,
        pluginRepoAddress: plugin.pluginRepoAddress,
        address: plugin.address,
      })

      if(actualPlugin) {
        await DbTx.executeTxFn(async ({ session }) => {
          const logDb = await actualPlugin.update({
            status: IPluginStatus.deprecated,
            uninstalled: {
              status: true,
              blockNumber: newPlugin.blockNumber,
              blockTimestamp: newPlugin.blockTimestamp,
              transactionHash: newPlugin.transactionHash,
            }
          }, session)

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('Update Plugin', llo({ logId: logDb?.id }))
        })
      }
    }
  },

  uninstallPlugin: async (pluginLog: LogPluginSetupProcessor) => {
    const plugin = await AggregatorPlugin._queryGetPlugin({
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

    if (!existingLog) {
      return
    }

    await DbTx.executeTxFn(async ({ session }) => {
      const blockTimestamp = await Web3Helper.getBlockTimestamp(plugin.blockNumber, plugin.network!) || undefined

      const updatePlugin: Partial<Plugin> = {
        status: IPluginStatus.uninstalled,
        uninstalled: {
          status: true,
          transactionHash: plugin.transactionHash,
          blockNumber: plugin.blockNumber,
          blockTimestamp: blockTimestamp!,
        },
      }
      const logDb = await existingLog.update(updatePlugin, session)

      await session.commitTransaction()
      await session.endSession()
      logger.verbose('Uninstall Plugin', llo({ logId: logDb?.id }))
    })
  },
}
