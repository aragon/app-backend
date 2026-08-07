import { Models } from '@dbModels'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import PluginDetector from '@helpers/pluginDetector'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import type Setting from '@models/schema/setting'
import DbOperations from '@models/utils/dbOperations'
import ProviderModule from '@modules/provider'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import { EnumConnection, type ILogInfo, IPluginInterfaceType, type IService } from '@types'

const llo = logger.logMeta.bind(null, { service: 'tools:backfillObjectionFlag' })

// Objection plugins deployed before detection existed sit in the DB as plain tokenVoting rows.
// Real TokenVotings always have an event-derived Setting (VotingSettingsUpdated in initialize),
// objection plugins never emit one — so tokenVoting rows with no Setting entry are the candidates.
const MIN_BLOCK_NUMBER = 11327111

const buildInfo = (plugin: Plugin, blockNumber: number, transactionHash: string): ILogInfo => ({
  address: plugin.address,
  network: plugin.network,
  blockNumber,
  transactionHash,
  transactionIndex: 0,
  logIndex: 0,
  eventName: 'backfillObjectionFlag',
})

// Mirrors the rawSettings mapping of ProposalHandler.proposalCreated so healed proposals
// carry the same frozen settings shape as freshly indexed ones
const buildProposalSettings = (setting: Setting) => ({
  id: setting.id,
  transactionHash: setting.transactionHash,
  blockNumber: setting.blockNumber,
  blockTimestamp: setting.blockTimestamp,
  network: setting.network,
  daoAddress: setting.daoAddress,
  pluginAddress: setting.pluginAddress,
  pluginSubdomain: setting.pluginSubdomain,
  tokenAddress: setting.tokenAddress,
  onlyListed: setting.onlyListed,
  minApprovals: setting.minApprovals,
  isObjection: true,
  votingMode: setting.votingMode,
  supportThreshold: setting.supportThreshold,
  minParticipation: setting.minParticipation,
  minDuration: setting.minDuration,
  minProposerVotingPower: setting.minProposerVotingPower,
})

export const BackfillObjectionFlag: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    await ProviderModule.connectToAllNetworks()

    const plugins = await Models.Plugin.find(
      {
        interfaceType: IPluginInterfaceType.tokenVoting,
        isObjection: { $ne: true },
        blockNumber: { $gt: MIN_BLOCK_NUMBER },
      },
      { id: 1, address: 1, network: 1 },
    )

    // Real TokenVotings always have an event-derived Setting; objection plugins never emit one.
    // A single indexed $in query beats a per-plugin $lookup, which cannot use the Setting index.
    const settingRows = await Models.Setting.find(
      { pluginAddress: { $in: plugins.map(p => p.address) } },
      { pluginAddress: 1, network: 1 },
    )
    const withSetting = new Set(settingRows.map(s => `${s.network}:${s.pluginAddress}`))
    const candidates = plugins.filter(p => !withSetting.has(`${p.network}:${p.address}`))
    logger.info('Backfill objection flag - candidates', llo({ scanned: plugins.length, count: candidates.length }))

    let flagged = 0
    for (const candidate of candidates) {
      const pluginInfo = await PluginDetector.detectPluginType(candidate.address, candidate.network)
      if (!pluginInfo?.isObjection) continue

      const plugin = await Models.Plugin.findByAddress(candidate.address, candidate.network)
      if (!plugin) continue

      const updated = await DbOperations.updateDocument(
        plugin,
        { isObjection: true },
        { logId: plugin.id },
        'Backfill objection flag',
        llo,
      )
      if (!updated) continue

      // Persist the live-proxied settings the plugin never emitted, read at the current block
      const latestBlock = await Web3Helper.getBlockNumber('latest', plugin.network)
      const setting = await PluginSettingHandler.syncObjectionSetting(
        updated,
        buildInfo(plugin, latestBlock, plugin.transactionHash),
      )
      if (!setting) {
        logger.warn('Objection flagged but setting sync failed', llo({ address: plugin.address }))
      }

      flagged++
      logger.info('Flagged objection plugin', llo({ address: plugin.address, network: plugin.network }))
    }

    // Heal proposals indexed before their plugin was recognised as an objection: they miss the
    // frozen isObjection settings, the stage-1 starting tallies and the seeded metrics
    const objectionPlugins = await Models.Plugin.find({
      interfaceType: IPluginInterfaceType.tokenVoting,
      isObjection: true,
      blockNumber: { $gt: MIN_BLOCK_NUMBER },
    })

    let healed = 0
    for (const plugin of objectionPlugins) {
      const brokenProposals = await Models.Proposal.find({
        pluginAddress: plugin.address,
        network: plugin.network,
        $or: [{ initialTally: { $exists: false } }, { 'settings.isObjection': { $ne: true } }],
      })

      for (const proposal of brokenProposals) {
        const info = buildInfo(plugin, proposal.blockNumber, proposal.transactionHash)

        const initialTally = await Web3Helper.getTokenVotingProposal(
          plugin.address,
          proposal.proposalIndex,
          plugin.network,
          proposal.blockNumber,
        )
        if (!initialTally) {
          logger.warn(
            'Objection proposal heal skipped - tally read failed',
            llo({ address: plugin.address, proposalIndex: proposal.proposalIndex }),
          )
          continue
        }

        // Settings effective at the proposal block; synced on-chain when none exist yet
        const settingAtBlock =
          (await PluginSettingHandler.syncObjectionSetting(plugin, info)) ||
          (await Models.Setting.findLastSettingByBlockNumber(plugin.address, proposal.blockNumber))

        const rawUpdate: Record<string, unknown> = { initialTally }
        if (settingAtBlock) {
          rawUpdate.settings = buildProposalSettings(settingAtBlock)
        }

        const updatedProposal = await DbOperations.updateDocument(
          proposal,
          rawUpdate,
          { logId: proposal.id },
          'Heal objection proposal',
          llo,
        )
        if (!updatedProposal) continue

        // Recompute metrics in-process so votesByOption gets seeded from the healed initialTally
        await ProposalMetrics.proposalTokenVotingMetrics({
          proposalIndex: proposal.proposalIndex,
          pluginAddress: plugin.address,
          network: plugin.network,
        })

        healed++
        logger.info(
          'Healed objection proposal',
          llo({ address: plugin.address, proposalIndex: proposal.proposalIndex }),
        )
      }
    }

    logger.info('Backfill objection flag - done', llo({ candidates: candidates.length, flagged, healed }))
  },

  stop: async () => {},
}

export default BackfillObjectionFlag
