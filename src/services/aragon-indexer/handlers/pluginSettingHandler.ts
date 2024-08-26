import logger from '@logger'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import { LogMultisig } from '@indexer/logMultisig'
import type Plugin from '@models/schema/plugin'
import DbOperations from '@models/utils/dbOperations'
import { ProxyToken } from '@modules/proxyToken'
import { LogGovernanceErc20 } from '@indexer/logGovernanceErc20'
import { LogTokenVoting } from '@indexer/logTokenVoting'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:PluginSettingHandler' })

export const PluginSettingHandler = {
  syncPluginData: async (plugin: Plugin) => {
    if (!plugin) return

    const dao = await Models.Dao.findByAddress(plugin.daoAddress, plugin.network)
    if (!dao) {
      logger.error('Dao not found', llo({ logId: plugin.id }))
      return
    }

    if (!dao.isSupported) {
      const document = {
        isSupported: true,
      }
      await DbOperations.updateDocument(dao, document, { logId: dao.id }, 'Dao Supported - setting fetched', llo)
    }

    if (plugin.tokenAddress) {
      await ProxyToken.saveAndGetToken(plugin.tokenAddress, plugin.network)
      await Promise.all([LogGovernanceErc20.start(plugin), LogTokenVoting.start(plugin)])
    } else {
      await Promise.all([LogMultisig.start(plugin)])
    }
  },

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

    const settingLog = {
      blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(blockNumber, network)) || undefined,
      transactionHash,
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

    await DbOperations.createDocument(Models.Setting, settingLog, info, 'New Setting - votingSettingsUpdated', llo)
    await PluginSettingHandler.syncPluginData(relatedPlugin)
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

    const settingLog = {
      blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(blockNumber, network)) || undefined,
      transactionHash,
      daoAddress: relatedPlugin.daoAddress,
      pluginAddress,
      pluginSubdomain: relatedPlugin.subdomain,
      network,
      onlyListed: parsedEvent.args.onlyListed,
      minApprovals: Number(parsedEvent.args.minApprovals),
    }

    await DbOperations.createDocument(Models.Setting, settingLog, info, 'New Setting - multisigSettingsUpdated', llo)
    await PluginSettingHandler.syncPluginData(relatedPlugin)
  },
}
