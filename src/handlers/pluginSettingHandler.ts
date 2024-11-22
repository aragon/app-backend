import logger from '@logger'
import { type ILogInfo, IPluginInterfaceType, ISettingStatus, ITokenType } from '@types'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import type Plugin from '@models/schema/plugin'
import DbOperations from '@models/utils/dbOperations'
import type Setting from '@models/schema/setting'
import { type LogDescription, type TransactionReceipt } from 'ethers'
import { Multisig } from '@artifacts/Multisig'
import { TokenVoting } from '@artifacts/TokenVoting'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import { ProxyToken } from '@modules/proxyToken'
import utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:handlers:PluginSettingHandler' })

export const PluginSettingHandler = {
  handleFromReceipt: async (txReceipt: TransactionReceipt, info: ILogInfo) => {
    const multisigSettings = Web3Helper.findLogsByName(txReceipt, 'MultisigSettingsUpdated', Multisig.abi)
    const plugins: Plugin[] = []

    if (multisigSettings?.length > 0) {
      for (const multisigSetting of multisigSettings) {
        const infoPluginSetup = Web3Helper.parseInfoLog(multisigSetting.txLog, 'MultisigSettingsUpdated', info.network)
        const plugin = await PluginSettingHandler.multisigSettingsUpdated(multisigSetting.parsed!, infoPluginSetup)
        if (plugin) plugins.push(plugin)
      }
    }

    const votingSettings = Web3Helper.findLogsByName(txReceipt, 'VotingSettingsUpdated', TokenVoting.abi)

    if (votingSettings?.length > 0) {
      for (const votingSetting of votingSettings) {
        const infoPluginSetup = Web3Helper.parseInfoLog(votingSetting.txLog, 'VotingSettingsUpdated', info.network)
        const plugin = await PluginSettingHandler.votingSettingsUpdated(votingSetting.parsed!, infoPluginSetup)
        if (plugin) plugins.push(plugin)
      }
    }

    const sppSettings = Web3Helper.findLogsByName(txReceipt, 'StagesUpdated', StagedProposalProcessor.abi)

    if (sppSettings?.length > 0) {
      for (const sppSetting of sppSettings) {
        const infoPluginSetup = Web3Helper.parseInfoLog(sppSetting.txLog, 'StagesUpdated', info.network)
        const plugin = await PluginSettingHandler.sppSettingsUpdated(sppSetting.parsed!, infoPluginSetup)
        if (plugin) plugins.push(plugin)
      }
    }

    return plugins
  },

  votingSettingsUpdated: async (parsedEvent: LogDescription, info: ILogInfo): Promise<Plugin | undefined> => {
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

    const tokenDb = await ProxyToken.saveAndGetToken(relatedPlugin.tokenAddress, relatedPlugin.network)

    if (tokenDb?.type === ITokenType.GovernanceERC20) {
      await PluginSettingHandler.isSupported(relatedPlugin, info)
    }

    return relatedPlugin
  },

  multisigSettingsUpdated: async (parsedEvent: LogDescription, info: ILogInfo): Promise<Plugin | undefined> => {
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
    return relatedPlugin
  },

  formatSppSetings(stageUpdate: any) {
    return stageUpdate.map((stage: any, index: number) => {
      const plugins = stage.bodies || stage.plugins
      return {
        stageIndex: index,
        minAdvance: Number(stage.minAdvance),
        maxAdvance: Number(stage.maxAdvance),
        voteDuration: stage.voteDuration ? Number(stage.voteDuration) : Number(stage.stageDuration || 0),
        approvalThreshold: Number(stage.approvalThreshold),
        vetoThreshold: Number(stage.vetoThreshold),
        plugins: plugins.map((plugin: any) => {
          return {
            address: plugin.pluginAddress || plugin.addr,
            isManual: plugin.isManual,
            allowedBody: plugin.allowedBody || plugin.tryAdvance,
            proposalType: utils.parseNumber(plugin.resultType ?? plugin.proposalType),
          }
        }),
      }
    })
  },

  sppSettingsUpdated: async (parsedEvent: LogDescription, info: ILogInfo): Promise<Plugin | undefined> => {
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
      stages: PluginSettingHandler.formatSppSetings(parsedEvent.args.stages),
    }

    // TODO If we have already existed metadata then we need to copy the name of the stages
    const sppMetadata = await Models.LogMetadata.getLatestMetadata(network, pluginAddress)

    if (sppMetadata?.stageNames && sppMetadata.stageNames.length === settingLog.stages.length) {
      settingLog.stages.forEach((stage: any, index: number) => {
        stage.name = sppMetadata.stageNames[index]
      })
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
    return relatedPlugin
  },

  /**
   * Update stage names on SPP settings
   * We mark the current settings as inactive and create a new one with the updated stage names
   * Every time the spp metadata is updated, we call this to update
   * the stage names on the settings, so it keeps synced and tacked
   * @param plugin
   * @param stageNames
   * @param info
   */
  updateStageNamesOnSppSettings: async (plugin: Plugin, stageNames: string[], info: ILogInfo) => {
    const existingLog = await Models.Setting.findExistingLog({
      transactionHash: info.transactionHash,
      pluginAddress: plugin.address,
    })

    if (existingLog) {
      return
    }

    const activePluginSetting = await Models.Setting.findActive({
      network: info.network,
      pluginAddress: plugin.address,
    })

    if (!activePluginSetting) {
      return
    }

    const settingLog = {
      blockNumber: info.blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
      transactionHash: info.transactionHash,
      status: ISettingStatus.active,
      daoAddress: plugin.daoAddress,
      pluginAddress: plugin.address,
      pluginSubdomain: plugin.subdomain,
      network: info.network,
      stages: activePluginSetting.stages.map((stage: any, index: any) => ({
        ...stage,
        name: stageNames[index],
      })),
    }

    await DbOperations.createDocument(Models.Setting, settingLog, info, 'New Setting - sppSettingsUpdated', llo)

    await DbOperations.updateDocument(
      activePluginSetting,
      {
        inactiveAtBlockNumber: info.blockNumber,
        status: ISettingStatus.inactive,
      },
      { logId: activePluginSetting.id, info },
      'Update SPP inactive plugin',
      llo,
    )
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
            isProcess: true, // its always set to true for all plugin where we can create proposals
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
