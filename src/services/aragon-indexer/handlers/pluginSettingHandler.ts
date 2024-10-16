import logger from '@logger'
import { type ILogInfo, IPluginInterfaceType, IPluginProposalType, ISettingStatus } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import type Plugin from '@models/schema/plugin'
import DbOperations from '@models/utils/dbOperations'
import type Setting from '@models/schema/setting'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:handlers:PluginSettingHandler' })

export const PluginSettingHandler = {
  votingSettingsUpdated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address: pluginAddress, transactionHash, blockNumber, network } = info
    const relatedPlugin = await Models.Plugin.findByAddress(pluginAddress, network)

    if (!relatedPlugin) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    const existingLog = await Models.Setting.findExistingLog({
      transactionHash,
      pluginAddress,
    })

    if (existingLog) return

    const activePluginSetting = await Models.Setting.findActive({
      network: info.network,
      pluginAddress,
    })

    const settingLog = {
      blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(blockNumber, network)) || undefined,
      transactionHash,
      status: ISettingStatus.active,
      daoAddress: relatedPlugin.daoAddress,
      pluginAddress,
      pluginSubdomain: relatedPlugin.subdomain,
      tokenAddress: relatedPlugin.tokenAddress,
      network,
      votingMode: Number(parsedEvent.args.votingMode),
      supportThreshold: Number(parsedEvent.args.supportThreshold),
      minParticipation: Number(parsedEvent.args.minParticipation),
      minDuration: Number(parsedEvent.args.minDuration),
      minProposerVotingPower: parsedEvent.args.minProposerVotingPower.toString(),
    }

    await DbOperations.createDocument(Models.Setting, settingLog, info, 'New Setting - tokenVotingSettingsUpdated', llo)

    if (activePluginSetting) {
      await DbOperations.updateDocument(
        activePluginSetting,
        {
          inactiveAtBlockNumber: blockNumber,
          status: ISettingStatus.inactive,
        },
        { logId: activePluginSetting.id, info },
        'Update tokenVoting inactive plugin',
        llo,
      )
    }

    await PluginSettingHandler.isSupported(relatedPlugin, info)
  },

  multisigSettingsUpdated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address: pluginAddress, transactionHash, blockNumber, network } = info
    const relatedPlugin = await Models.Plugin.findByAddress(pluginAddress, network)

    if (!relatedPlugin) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    const existingLog = await Models.Setting.findExistingLog({
      transactionHash,
      pluginAddress,
    })

    if (existingLog) return

    const activePluginSetting = await Models.Setting.findActive({
      network: info.network,
      pluginAddress,
    })

    const settingLog = {
      blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(blockNumber, network)) || undefined,
      transactionHash,
      status: ISettingStatus.active,
      daoAddress: relatedPlugin.daoAddress,
      pluginAddress,
      pluginSubdomain: relatedPlugin.subdomain,
      network,
      onlyListed: parsedEvent.args.onlyListed,
      minApprovals: Number(parsedEvent.args.minApprovals),
    }

    await DbOperations.createDocument(Models.Setting, settingLog, info, 'New Setting - multisigSettingsUpdated', llo)

    if (activePluginSetting) {
      await DbOperations.updateDocument(
        activePluginSetting,
        {
          inactiveAtBlockNumber: blockNumber,
          status: ISettingStatus.inactive,
        },
        { logId: activePluginSetting.id, info },
        'Update multisig inactive plugin',
        llo,
      )
    }

    await PluginSettingHandler.isSupported(relatedPlugin, info)
  },

  sppSettingsUpdated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address: pluginAddress, transactionHash, blockNumber, network } = info
    const relatedPlugin = await Models.Plugin.findByAddress(pluginAddress, network)

    if (!relatedPlugin) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    const existingLog = await Models.Setting.findExistingLog({
      transactionHash,
      pluginAddress,
    })

    if (existingLog) return

    const activePluginSetting = await Models.Setting.findActive({
      network: info.network,
      pluginAddress,
    })

    const settingLog = {
      blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(blockNumber, network)) || undefined,
      transactionHash,
      status: ISettingStatus.active,
      daoAddress: relatedPlugin.daoAddress,
      pluginAddress,
      pluginSubdomain: relatedPlugin.subdomain,
      tokenAddress: relatedPlugin.tokenAddress,
      network,
      stages: parsedEvent.args.stages.map((stage: any, index: number) => ({
        stageIndex: index,
        minAdvance: Number(stage.minAdvance),
        maxAdvance: Number(stage.maxAdvance),
        voteDuration: stage.voteDuration ? Number(stage.voteDuration) : Number(stage.stageDuration || 0),
        approvalThreshold: Number(stage.approvalThreshold),
        vetoThreshold: Number(stage.vetoThreshold),
        plugins: stage.plugins.map((plugin: any) => {
          return {
            address: plugin.pluginAddress,
            isManual: plugin.isManual,
            allowedBody: plugin.allowedBody,
            proposalType: plugin.proposalType === 0n ? IPluginProposalType.Approval : IPluginProposalType.Veto,
          }
        }),
      })),
    }

    const settings = await DbOperations.createDocument(
      Models.Setting,
      settingLog,
      info,
      'New Setting - sppSettingsUpdated',
      llo,
    )

    if (activePluginSetting) {
      await DbOperations.updateDocument(
        activePluginSetting,
        {
          inactiveAtBlockNumber: blockNumber,
          status: ISettingStatus.inactive,
        },
        { logId: activePluginSetting.id, info },
        'Update SPP inactive plugin',
        llo,
      )
    }

    // pair plugins
    await PluginSettingHandler.pairSppPlugins(relatedPlugin, settings, info)
    await PluginSettingHandler.isSupported(relatedPlugin, info)
  },

  pairSppPlugins: async (plugin: Plugin, settings: Setting, info: ILogInfo) => {
    // update SPP plugin
    const rawPluginUpdate = {
      isSubPlugin: !!plugin.parentPlugin, // it could be a sub-plugin of an other SPP
      totalStages: settings.stages.length,
      subPlugins: settings.stages.map(stage => ({
        stageIndex: stage.stageIndex,
        addresses: stage.plugins.map(plugin => plugin.address),
      })),
    }
    await DbOperations.updateDocument(plugin, rawPluginUpdate, { logId: plugin.id, info }, 'Update spp plugin', llo)

    // Update sub-plugins for each stage
    await Promise.all(
      settings.stages.flatMap(stage =>
        stage.plugins.map(async subPlugin => {
          const relatedPlugin = await Models.Plugin.findByAddress(subPlugin.address, info.network)
          if (!relatedPlugin) {
            logger.error('Plugin not found - pairSppPlugins', llo({ ...info, address: subPlugin.address }))
            return
          }

          const rawSubPluginUpdate = {
            stageIndex: stage.stageIndex,
            parentPlugin: plugin.address,
            isSubPlugin: true, // set this plugin as subPlugin
            isBody: relatedPlugin.interfaceType !== IPluginInterfaceType.spp,
            isProcessor: relatedPlugin.interfaceType === IPluginInterfaceType.spp,
          }

          const log = { logId: relatedPlugin.id, info }
          await DbOperations.updateDocument(relatedPlugin, rawSubPluginUpdate, log, 'Update sub-plugin', llo)
        }),
      ),
    )
  },

  isSupported: async (plugin: Plugin, info: ILogInfo): Promise<void> => {
    if (!plugin.isSupported) {
      const rawUpdate = { isSupported: true }
      await DbOperations.updateDocument(plugin, rawUpdate, { logId: plugin.id, info }, 'Update plugin isSupported', llo)
    }
  },
}
