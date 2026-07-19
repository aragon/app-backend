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
import PolicyHelper from '@helpers/policyHelper'
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
  type IPolicySetting,
  IPolicyStrategyType,
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

  /**
   * Backfills a missing Setting doc by reading the plugin config on-chain. Used at proposalCreated time
   * when no Setting exists for the plugin (e.g. a SettingsUpdated event was never emitted/replayed), so
   * proposals would otherwise persist with settings = null. Reads on-chain per interface type, then persists.
   */
  backfillSettingByType: async (plugin: Plugin, info: ILogInfo): Promise<Setting | undefined> => {
    const { address: pluginAddress, network } = plugin
    let fields: Record<string, any> | undefined

    switch (plugin.interfaceType) {
      case IPluginInterfaceType.multisig: {
        const settings = await MultisigHelper.findSettings(pluginAddress, network)
        if (!settings) break
        fields = { onlyListed: settings.onlyListed, minApprovals: settings.minApprovals || 0 }
        break
      }
      case IPluginInterfaceType.tokenVoting: {
        if (plugin.tokenAddress === null) {
          logger.warn('Backfill setting skipped - token voting plugin has no token address', llo(info))
          return
        }
        const settings = await Web3Helper.getVotingSettings(pluginAddress, network)
        if (!settings) break
        fields = {
          tokenAddress: plugin.tokenAddress,
          votingMode: Number(settings.votingMode),
          supportThreshold: Number(settings.supportThreshold),
          minParticipation: Number(settings.minParticipation),
          minDuration: Number(settings.minDuration),
          minProposerVotingPower: settings.minProposerVotingPower.toString(),
        }
        break
      }
      case IPluginInterfaceType.lockToVote: {
        const settings = await Web3Helper.getLockToVoteSettings(pluginAddress, network)
        if (!settings) break
        fields = {
          tokenAddress: plugin.tokenAddress,
          votingMode: Number(settings.votingMode),
          supportThreshold: Number(settings.supportThresholdRatio),
          minParticipation: Number(settings.minParticipationRatio),
          approvalThreshold: Number(settings.minApprovalRatio),
          minProposerVotingPower: settings.minProposerVotingPower.toString(),
          minDuration: Number(settings.proposalDuration),
        }
        break
      }
      case IPluginInterfaceType.spp: {
        const stages = await Web3Helper.getSppStages(pluginAddress, network)
        if (!stages) break
        const formattedStages = PluginSettingHandler.formatSppSetings(stages)
        for (const stage of formattedStages) {
          for (const subPlugin of stage.plugins) {
            subPlugin.brandId = await PluginDetector.detectAddressType(subPlugin.address, network)
          }
        }
        const sppMetadata = await Models.LogMetadata.getLatestMetadata(network, pluginAddress)
        if (sppMetadata?.stageNames && sppMetadata.stageNames.length === formattedStages.length) {
          formattedStages.forEach((stage: any, index: number) => {
            stage.name = sppMetadata.stageNames[index]
          })
        }
        fields = { tokenAddress: plugin.tokenAddress, stages: formattedStages }
        break
      }
      default:
        return
    }

    if (!fields) {
      logger.warn('Backfill setting skipped - on-chain read failed', llo(info))
      return
    }

    return PluginSettingHandler.persistBackfilledSetting(plugin, fields, info)
  },

  /**
   * Persists a backfilled Setting doc. Because this only runs when no Setting exists at/before the
   * proposal block, any currently-active Setting is necessarily NEWER: keep it active and store the
   * backfill as an historical (inactive) record so chronology stays correct.
   */
  persistBackfilledSetting: async (
    plugin: Plugin,
    fields: Record<string, any>,
    info: ILogInfo,
  ): Promise<Setting | undefined> => {
    const { address: pluginAddress, network } = plugin
    const { transactionHash, blockNumber } = info

    const existingLog = await Models.Setting.findExistingLog({ transactionHash, pluginAddress })
    if (existingLog) return

    const newerActiveSetting = await Models.Setting.findActive({ network, pluginAddress })

    const settingLog = {
      blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(blockNumber, network)) || undefined,
      transactionHash,
      status: newerActiveSetting ? ISettingStatus.inactive : ISettingStatus.active,
      inactiveAtBlockNumber: newerActiveSetting ? newerActiveSetting.blockNumber : undefined,
      daoAddress: plugin.daoAddress,
      pluginAddress,
      pluginSubdomain: plugin.subdomain,
      network,
      ...fields,
    }

    return DbOperations.createDocument(Models.Setting, settingLog, info, 'Backfilled Setting - proposalCreated', llo)
  },

  /**
   * Marks the previously-active Setting of a plugin as inactive once a newer Setting has been created.
   * No-op when there is no active setting. The log message is passed in to keep per-handler log labels.
   */
  deactivatePreviousSetting: async (
    activePluginSetting: Setting | null,
    blockNumber: number,
    info: ILogInfo,
    logMsg: string,
  ) => {
    if (!activePluginSetting) return

    await DbOperations.updateDocument(
      activePluginSetting,
      {
        inactiveAtBlockNumber: blockNumber,
        status: ISettingStatus.inactive,
      },
      { logId: activePluginSetting.id, info },
      logMsg,
      llo,
    )
  },

  /**
   * If the plugin is a sub-plugin of an installed SPP, (re)pairs it with that parent SPP's active setting.
   * No-op when the plugin has no parent SPP or the parent has no active setting.
   */
  pairWithParentSpp: async (relatedPlugin: Plugin, info: ILogInfo) => {
    const sppPlugin = await Models.Plugin.findOne({
      daoAddress: relatedPlugin.daoAddress,
      network: relatedPlugin.network,
      interfaceType: IPluginInterfaceType.spp,
      status: IPluginStatus.installed,
      'subPlugins.addresses': { $in: [relatedPlugin.address] },
    })

    if (!sppPlugin) return

    const sppSettings = await Models.Setting.findActive({
      network: info.network,
      pluginAddress: sppPlugin.address,
    })

    if (sppSettings) {
      await PluginSettingHandler.pairSppPlugins(sppPlugin, sppSettings, info)
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

    await PluginSettingHandler.deactivatePreviousSetting(
      activePluginSetting,
      blockNumber,
      info,
      'Update lockToVote inactive plugin',
    )

    await PluginSettingHandler.isSupported(relatedPlugin, info)

    await PluginSettingHandler.pairWithParentSpp(relatedPlugin, info)
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

    await PluginSettingHandler.deactivatePreviousSetting(
      activePluginSetting,
      blockNumber,
      info,
      'Update tokenVoting inactive plugin',
    )

    const tokenDb = await ProxyToken.saveAndGetToken(relatedPlugin.tokenAddress, relatedPlugin.network)

    if (!tokenDb) {
      logger.error('votingSettingsUpdated token not found', llo({ info }))
    }

    if (tokenDb?.isGovernance) {
      await PluginSettingHandler.isSupported(relatedPlugin, info)
      await PluginSettingHandler.pairWithParentSpp(relatedPlugin, info)
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

    await PluginSettingHandler.deactivatePreviousSetting(
      activePluginSetting,
      blockNumber,
      info,
      'Update multisig inactive plugin',
    )

    if (findSettings !== undefined) {
      await PluginSettingHandler.isSupported(relatedPlugin, info)
      await PluginSettingHandler.pairWithParentSpp(relatedPlugin, info)
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
      votingEscrow: plugin.votingEscrow?.exitQueueAddress
        ? await PluginSettingHandler.votingEscrowSettings(plugin, info)
        : null,
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

    await PluginSettingHandler.deactivatePreviousSetting(
      activePluginSetting,
      blockNumber,
      info,
      'Update SPP inactive plugin',
    )

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

  /**
   * Create policy settings for router/claimer plugins
   * Handles different plugin types:
   * - RouterPlugin/ClaimerPlugin: has source + model
   * - BurnRouterPlugin/UniswapRouter: has source only (no model)
   * - MultiRouterPlugin/MultiDispatchPlugin: has subRouters[] only
   * - MultiClaimerPlugin: has subClaimers[] only
   */
  linkPolicySourceAndModel: async (pluginDb: Plugin, info: ILogInfo) => {
    try {
      const { address: pluginAddress, network, daoAddress } = pluginDb

      const strategyResult = await PolicyHelper.getStrategyTypeAndPluginId(pluginAddress, network)

      if (!strategyResult) {
        logger.warn('Failed to get strategy type', llo({ pluginAddress, network }))
        return
      }

      const { strategyType, policyKey } = strategyResult
      const existingSetting = await Models.Setting.findActive({ pluginAddress, network })

      if (existingSetting?.policy) {
        logger.verbose('Policy setting already exists', llo({ pluginAddress, network }))
        return
      }

      const policySetting: IPolicySetting = {
        policyId: policyKey,
        strategyType,
      }

      const hasSource = [
        IPolicyStrategyType.router,
        IPolicyStrategyType.claimer,
        IPolicyStrategyType.burnRouter,
        IPolicyStrategyType.uniswapRouter,
        IPolicyStrategyType.cowSwapRouter,
      ].includes(strategyType)

      if (hasSource) {
        const sourceAddress = await PolicyHelper.getSourceAddress(pluginAddress, network)
        if (sourceAddress) {
          const sourceData = await PolicyHelper.getSourceData(sourceAddress, network)
          policySetting.source = sourceData

          if (sourceData?.tokenAddress) {
            await ProxyToken.saveAndGetToken(sourceData.tokenAddress, network)
          }
        }
      }

      const hasModel = [IPolicyStrategyType.router, IPolicyStrategyType.claimer].includes(strategyType)

      if (hasModel) {
        const modelAddress = await PolicyHelper.getModelAddress(pluginAddress, network, strategyType)
        if (modelAddress) {
          policySetting.model = await PolicyHelper.getModelData(modelAddress, network)
        }
      }

      const hasSubRouters = [IPolicyStrategyType.multiRouter, IPolicyStrategyType.multiDispatch].includes(strategyType)

      if (hasSubRouters) {
        const subRouters = await PolicyHelper.getSubRouters(pluginAddress, network)
        policySetting.subRouters = subRouters.length > 0 ? subRouters : null
      }

      if (strategyType === IPolicyStrategyType.multiClaimer) {
        const subClaimers = await PolicyHelper.getSubClaimers(pluginAddress, network)
        policySetting.subClaimers = subClaimers.length > 0 ? subClaimers : null
      }

      if (existingSetting) {
        await existingSetting.update({ policy: policySetting })
        logger.verbose('Updated existing setting with policy data', llo({ pluginAddress, network }))
      } else {
        await Models.Setting.create({
          transactionHash: info.transactionHash,
          blockNumber: info.blockNumber,
          network,
          status: ISettingStatus.active,
          daoAddress,
          pluginAddress,
          policy: policySetting,
        })
        logger.verbose('Created new policy setting', llo({ pluginAddress, network }))
      }

      await pluginDb.update({ isPolicy: true })

      if (policySetting.source?.tokenAddress) {
        await ProxyToken.saveAndGetToken(policySetting.source.tokenAddress, network)
      }

      logger.verbose('Policy settings created', llo({ pluginAddress, network }))

      return true
    } catch (error) {
      logger.error('Error creating policy settings', llo({ error, pluginAddress: pluginDb.address }))
    }
  },

  isSupported: async (plugin: Plugin, info: ILogInfo): Promise<void> => {
    if (!plugin.isSupported) {
      const rawUpdate = { isSupported: true }
      await DbOperations.updateDocument(plugin, rawUpdate, { logId: plugin.id, info }, 'Update plugin isSupported', llo)
    }
  },
}
