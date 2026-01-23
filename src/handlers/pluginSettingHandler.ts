import { LockToVote } from '@artifacts/LockToVote'
import { Multisig } from '@artifacts/Multisig'
import { Multisig2 } from '@artifacts/Multisig2'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import { TokenVoting } from '@artifacts/TokenVoting'
import { Models } from '@dbModels'
import GaugeHelper from '@helpers/gauge'
import GovernanceVeHelper from '@helpers/governanceVe'
import MultisigHelper from '@helpers/multisig'
import PluginDetector from '@helpers/pluginDetector'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import type Setting from '@models/schema/setting'
import DbOperations from '@models/utils/dbOperations'
import { ProxyToken } from '@modules/proxyToken'
import {
  IEventLogPluginSettings,
  type ILogInfo,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  type ISettingVotingEscrow,
} from '@types'
import { type LogDescription, type TransactionReceipt } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'handlers:PluginSettingHandler' })

// Note about plugin settings
// ADMIN: have no setting (isSupported needs to be set somewhere else)
// GAUGE: have no setting (isSupported needs to be set somewhere else)
// TokenVoting: setting is triggered on installationPrepared
// TokenVoting + VotingEscrow: setting is triggered on installationPrepared helpers
// Multisig: setting is triggered on installationPrepared
// SPP: setting is triggered on installationApplied
export const PluginSettingHandler = {
  handlePluginSettingByType: async (plugin: Plugin, txReceipt: TransactionReceipt, info: ILogInfo) => {
    let abi: any
    let abi2: any
    let eventName: IEventLogPluginSettings
    let handler: (parsedEvent: LogDescription, info: ILogInfo) => Promise<Plugin | undefined>
    switch (plugin.interfaceType) {
      case IPluginInterfaceType.lockToVote:
        abi = LockToVote.abi
        eventName = IEventLogPluginSettings.VotingSettingsUpdated
        handler = PluginSettingHandler.lockToVoteSettingsUpdated
        break
      case IPluginInterfaceType.tokenVoting:
        abi = TokenVoting.abi
        eventName = IEventLogPluginSettings.VotingSettingsUpdated
        handler = PluginSettingHandler.votingSettingsUpdated
        break
      case IPluginInterfaceType.multisig:
        abi = Multisig.abi
        abi2 = Multisig2.abi
        eventName = IEventLogPluginSettings.MultisigSettingsUpdated
        handler = PluginSettingHandler.multisigSettingsUpdated
        break
      case IPluginInterfaceType.spp:
        abi = StagedProposalProcessor.abi
        eventName = IEventLogPluginSettings.StagesUpdated
        handler = PluginSettingHandler.sppSettingsUpdated
        break
      default:
        return
    }

    let settingLogs = Web3Utils.findLogsByName(txReceipt, eventName, abi)
    if (settingLogs?.length === 0 && abi2) {
      settingLogs = Web3Utils.findLogsByName(txReceipt, eventName, abi2)
    }
    const settingLog = settingLogs?.find(log => log?.txLog?.address === plugin.address)

    if (settingLog) {
      const infoPluginSetup = Web3Utils.parseInfoLog(settingLog.txLog, eventName, info.network)
      const plugin = await handler(settingLog.parsed!, infoPluginSetup)
      if (plugin) return plugin
    }
  },

  lockToVoteSettingsUpdated: async (parsedEvent: LogDescription, info: ILogInfo): Promise<Plugin | undefined> => {
    const { address: pluginAddress, transactionHash, blockNumber, network } = info
    const relatedPlugin = await Models.Plugin.findByAddress(pluginAddress, network)

    if (!relatedPlugin) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    if (relatedPlugin.interfaceType !== IPluginInterfaceType.lockToVote || relatedPlugin.lockManagerAddress === null) {
      logger.warn('Plugin is not a lockToVote', llo(info))
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
      supportThreshold: Number(parsedEvent.args.supportThresholdRatio),
      minParticipation: Number(parsedEvent.args.minParticipationRatio),
      approvalThreshold: Number(parsedEvent.args.minApprovalRatio),
      minProposerVotingPower: parsedEvent.args.minProposerVotingPower.toString(),
      minDuration: Number(parsedEvent.args.proposalDuration),
    }

    await DbOperations.createDocument(Models.Setting, settingLog, info, 'New Setting - lockToVoteSettingsUpdated', llo)

    if (activePluginSetting) {
      await DbOperations.updateDocument(
        activePluginSetting,
        {
          inactiveAtBlockNumber: blockNumber,
          status: ISettingStatus.inactive,
        },
        { logId: activePluginSetting.id, info },
        'Update lockToVote inactive plugin',
        llo,
      )
    }

    await PluginSettingHandler.isSupported(relatedPlugin, info)

    const sppPlugin = await Models.Plugin.findOne({
      daoAddress: relatedPlugin.daoAddress,
      network: relatedPlugin.network,
      interfaceType: IPluginInterfaceType.spp,
      status: IPluginStatus.installed,
      'subPlugins.addresses': { $in: [pluginAddress] },
    })

    if (sppPlugin) {
      const sppSettings = await Models.Setting.findActive({
        network: info.network,
        pluginAddress: sppPlugin.address,
      })

      if (sppSettings) {
        await PluginSettingHandler.pairSppPlugins(sppPlugin, sppSettings, info)
      }
    }
  },

  votingSettingsUpdated: async (parsedEvent: LogDescription, info: ILogInfo): Promise<Plugin | undefined> => {
    const { address: pluginAddress, transactionHash, blockNumber, network } = info
    const relatedPlugin = await Models.Plugin.findByAddress(pluginAddress, network)

    if (!relatedPlugin) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    if (relatedPlugin.interfaceType !== IPluginInterfaceType.tokenVoting || relatedPlugin.tokenAddress === null) {
      logger.warn('Plugin is not a token voting', llo(info))
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
      votingEscrow: relatedPlugin.votingEscrow
        ? await PluginSettingHandler.votingEscrowSettings(relatedPlugin, info)
        : undefined,
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

    if (!tokenDb) {
      logger.error('votingSettingsUpdated token not found', llo({ info }))
    }

    if (tokenDb?.isGovernance) {
      await PluginSettingHandler.isSupported(relatedPlugin, info)

      const sppPlugin = await Models.Plugin.findOne({
        daoAddress: relatedPlugin.daoAddress,
        network: relatedPlugin.network,
        interfaceType: IPluginInterfaceType.spp,
        status: IPluginStatus.installed,
        'subPlugins.addresses': { $in: [pluginAddress] },
      })

      if (sppPlugin) {
        const sppSettings = await Models.Setting.findActive({
          network: info.network,
          pluginAddress: sppPlugin.address,
        })

        if (sppSettings) {
          await PluginSettingHandler.pairSppPlugins(sppPlugin, sppSettings, info)
        }
      }
    }

    return relatedPlugin
  },

  multisigSettingsUpdated: async (parsedEvent: LogDescription, info: ILogInfo): Promise<Plugin | undefined> => {
    // Note: we cannot trust data from parsedEvent, as it can be manipulated
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

    const findSettings = await MultisigHelper.findSettings(pluginAddress, network)

    const settingLog = {
      blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(blockNumber, network)) || undefined,
      transactionHash,
      status: ISettingStatus.active,
      daoAddress: relatedPlugin.daoAddress,
      pluginAddress,
      pluginSubdomain: relatedPlugin.subdomain,
      network,
      onlyListed: findSettings?.onlyListed,
      minApprovals: findSettings?.minApprovals || 0,
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

    if (findSettings !== undefined) {
      await PluginSettingHandler.isSupported(relatedPlugin, info)

      const sppPlugin = await Models.Plugin.findOne({
        daoAddress: relatedPlugin.daoAddress,
        network: relatedPlugin.network,
        interfaceType: IPluginInterfaceType.spp,
        status: IPluginStatus.installed,
        'subPlugins.addresses': { $in: [pluginAddress] },
      })

      if (sppPlugin) {
        const sppSettings = await Models.Setting.findActive({
          network: info.network,
          pluginAddress: sppPlugin.address,
        })
        if (sppSettings) {
          await PluginSettingHandler.pairSppPlugins(sppPlugin, sppSettings, info)
        }
      }
    }

    return relatedPlugin
  },

  gaugeSettings: async (plugin: Plugin, info: ILogInfo) => {
    const settingLog = {
      blockNumber: info.blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, plugin.network)) || undefined,
      transactionHash: info.transactionHash,
      status: ISettingStatus.active,
      daoAddress: plugin.daoAddress,
      pluginAddress: plugin.address,
      pluginSubdomain: plugin.subdomain,
      network: plugin.network,
      enabledUpdatedVotingPowerHook: await GaugeHelper.getEnableUpdateVotingPowerHookFlag(
        plugin.address,
        plugin.network,
      ),
    }

    await DbOperations.createDocument(Models.Setting, settingLog, info, 'New Setting - gaugeSettingsUpdated', llo)
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

    const formattedStages = PluginSettingHandler.formatSppSetings(parsedEvent.args.stages)

    for (const stage of formattedStages) {
      for (const plugin of stage.plugins) {
        plugin.brandId = await PluginDetector.detectAddressType(plugin.address, network)
      }
    }

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
      stages: formattedStages,
    }

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
        cancelable: stage.cancelable,
        editable: stage.editable,
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

  /**
   * Update stage names on SPP settings:
   * 1. Marks current settings as inactive
   * 2. Creates a new Setting with updated stage names
   *
   * @param plugin
   * @param stageNames
   * @param info
   */
  updateStageNamesOnSppSettings: async (plugin: Plugin, stageNames: string[], info: ILogInfo) => {
    const existingLog = await Models.Setting.findExistingLog({
      transactionHash: info.transactionHash,
      pluginAddress: plugin.address,
    })
    if (existingLog) return

    const activePluginSetting = await Models.Setting.findActive({
      network: info.network,
      pluginAddress: plugin.address,
    })
    if (!activePluginSetting) return

    if (!stageNames || activePluginSetting?.stages?.length !== stageNames?.length) {
      logger.error('Stage names length mismatch', llo({ stageNames, activePluginSetting }))
      return
    }

    const blockTimestamp = (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined
    const stages = activePluginSetting.stages.map((stage: any, index: number) => ({
      ...stage,
      name: stageNames[index],
    }))
    const settingToSave = {
      blockNumber: info.blockNumber,
      blockTimestamp,
      transactionHash: info.transactionHash,
      daoAddress: plugin.daoAddress,
      pluginAddress: plugin.address,
      pluginSubdomain: plugin.subdomain,
      network: info.network,
      stages,
    }

    // If we're dealing with an older block then the current,
    // update the existing setting and create an inactive one.
    // This case happens as we process the spp settings in a different order then the metadata

    if (info.blockNumber < activePluginSetting.blockNumber) {
      await DbOperations.updateDocument(
        activePluginSetting,
        { stages },
        { logId: activePluginSetting.id, info },
        'Update SPP stage names',
        llo,
      )

      await DbOperations.createDocument(
        Models.Setting,
        { ...settingToSave, status: ISettingStatus.inactive },
        info,
        'Update SPP inactive plugin',
        llo,
      )

      return
    }

    await DbOperations.createDocument(
      Models.Setting,
      { ...settingToSave, status: ISettingStatus.active },
      info,
      'New Setting - sppSettingsUpdated',
      llo,
    )

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
            logger.warn(
              'Plugin not found - pairSppPlugins. External Address',
              llo({ ...info, address: subPlugin.address }),
            )
            return
          }

          const rawSubPluginUpdate = {
            stageIndex: stage.stageIndex,
            parentPlugin: plugin.address,
            isSubPlugin: true,
            isBody: relatedPlugin.interfaceType !== IPluginInterfaceType.spp,
            isProcess: true,
          }

          const log = { logId: relatedPlugin.id, info }
          await DbOperations.updateDocument(relatedPlugin, rawSubPluginUpdate, log, 'Update sub-plugin', llo)
        }),
      ),
    )
  },

  votingEscrowSettings: async (plugin: Plugin, info: ILogInfo): Promise<ISettingVotingEscrow> => {
    const minDeposit = await GovernanceVeHelper.getMinDeposit(plugin.votingEscrow?.escrowAddress!, info.network)
    const minLockTime = await GovernanceVeHelper.getMinLock(plugin.votingEscrow?.exitQueueAddress!, info.network)
    const cooldown = await GovernanceVeHelper.getCooldown(plugin.votingEscrow?.exitQueueAddress!, info.network)
    const maxTime = await GovernanceVeHelper.getMaxTime(plugin.votingEscrow?.curveAddress!, info.network)
    const { slope, bias } = await GovernanceVeHelper.getSettingFromCoefficients(
      plugin.votingEscrow?.curveAddress!,
      info.network,
    )
    const feePercent = await GovernanceVeHelper.getFeePercent(plugin.votingEscrow?.exitQueueAddress!, info.network)
    const minFeePercent = await GovernanceVeHelper.getMinFeePercent(
      plugin.votingEscrow?.exitQueueAddress!,
      info.network,
    )
    const minCooldown = await GovernanceVeHelper.getMinCooldown(plugin.votingEscrow?.exitQueueAddress!, info.network)

    return {
      minDeposit: minDeposit.toString(),
      minLockTime: Number(minLockTime),
      cooldown: Number(cooldown),
      maxTime: Number(maxTime),
      slope: slope.toString(),
      bias: bias.toString(),
      feePercent: feePercent.toString(),
      minFeePercent: minFeePercent.toString(),
      minCooldown: Number(minCooldown),
    }
  },

  exitFeePercentAdjusted: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const feePercent = parsedEvent.args.maxFeePercent.toString()
    const minFeePercent = parsedEvent.args.minFeePercent.toString()
    const minCooldown = Number(parsedEvent.args.minCooldown)
    const feeType = Number(parsedEvent.args.feeType)

    const plugins = await Models.Plugin.find({
      'votingEscrow.exitQueueAddress': info.address,
      network: info.network,
    })

    if (plugins.length === 0) {
      logger.warn('Plugin not found for exitFeePercentAdjusted event', llo({ info }))
      return
    }

    await Promise.all(
      plugins.map(async (plugin: any) => {
        const activePluginSetting = await Models.Setting.findActive({
          network: info.network,
          pluginAddress: plugin.address,
        })

        if (!activePluginSetting) {
          logger.error(
            'Active plugin setting not found for exitFeePercentAdjusted event',
            llo({
              info,
              pluginAddress: plugin.address,
            }),
          )
          return
        }

        if (!activePluginSetting.votingEscrow) {
          activePluginSetting.votingEscrow = {}
        }

        let hasChanges = false

        if (activePluginSetting.votingEscrow.feePercent !== feePercent) {
          activePluginSetting.votingEscrow.feePercent = feePercent
          hasChanges = true
        }

        if (activePluginSetting.votingEscrow.minFeePercent !== minFeePercent) {
          activePluginSetting.votingEscrow.minFeePercent = minFeePercent
          hasChanges = true
        }

        if (activePluginSetting.votingEscrow.minCooldown !== minCooldown) {
          activePluginSetting.votingEscrow.minCooldown = minCooldown
          hasChanges = true
        }

        if (activePluginSetting.votingEscrow.feeType !== feeType) {
          activePluginSetting.votingEscrow.feeType = feeType
          hasChanges = true
        }

        if (hasChanges) {
          await activePluginSetting.save()
          logger.verbose('exitFeePercentAdjusted VeGovernance', llo({ info }))
        }
      }),
    )
  },

  isSupported: async (plugin: Plugin, info: ILogInfo): Promise<void> => {
    if (!plugin.isSupported) {
      const rawUpdate = { isSupported: true }
      await DbOperations.updateDocument(plugin, rawUpdate, { logId: plugin.id, info }, 'Update plugin isSupported', llo)
    }
  },
}
