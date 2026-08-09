import config from '@config'
import ContractHelper from '@helpers/contractHelper'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import type ProposalFinding from '@models/schema/proposalFinding'
import TelegramModule from '@modules/telegram'
import {
  EnumQueueName,
  type IFraudAssessment,
  type IFraudRawAction,
  type IFraudRiskContext,
  type IFraudRiskLevel,
  IPluginInterfaceType,
} from '@types'
import { extractMints, extractTransfers } from './decode'
import { scoreProposal } from './score'
import { simulateExecution } from './simulate'

const llo = logger.logMeta.bind(null, { service: 'fraud-scan' })

const LEVEL_RANK: Record<IFraudRiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 }

export const FraudScan = {
  /**
   * Scores one proposal at creation time and persists a ProposalFinding when an attack
   * class matches. Deterministic and keyed by proposal id, so redelivery is harmless.
   */
  scanProposal: async (id: string) => {
    const proposal = await Models.Proposal.findOne({ id }).lean()
    if (!proposal) {
      logger.warn('FraudScan: proposal not found', llo({ id }))
      return null
    }

    // The publishing site filters too, but the queue is not a trusted input — re-check the gate.
    const plugin = await Models.Plugin.findByAddress(proposal.pluginAddress, proposal.network)
    if (!plugin || plugin.interfaceType !== IPluginInterfaceType.tokenVoting) return null
    if (plugin.isSubPlugin || plugin.parentPlugin) return null

    const actions = proposal.rawActions ?? []
    if (!actions.length) return null

    const [dao, daoAssetCount, priorProposals, priorVotes, daoPlugins, votes, existing] = await Promise.all([
      Models.Dao.findOne({ address: proposal.daoAddress, network: proposal.network })
        .select('name blockTimestamp')
        .lean(),
      Models.Asset.countDocuments({ daoAddress: proposal.daoAddress, network: proposal.network }),
      Models.Proposal.countDocuments({
        network: proposal.network,
        daoAddress: proposal.daoAddress,
        creatorAddress: proposal.creatorAddress,
        blockTimestamp: { $lt: proposal.blockTimestamp },
      }),
      Models.Vote.countDocuments({
        network: proposal.network,
        daoAddress: proposal.daoAddress,
        memberAddress: proposal.creatorAddress,
        blockTimestamp: { $lt: proposal.blockTimestamp },
      }),
      Models.Plugin.find({ daoAddress: proposal.daoAddress, network: proposal.network }).select('address').lean(),
      // Empty at creation. On a re-score triggered by a vote this is what adds selfVoteOnly.
      Models.Vote.find({
        network: proposal.network,
        pluginAddress: proposal.pluginAddress,
        proposalIndex: proposal.proposalIndex,
      })
        .select('memberAddress')
        .lean(),
      Models.ProposalFinding.findOne({ id: proposal.id }),
    ])

    const systemAddresses = new Set<string>(daoPlugins.map(p => p.address))

    // Holder checks only for addresses that can actually receive value in this proposal.
    const tokenHolders = new Set<string>()
    const tokenAddress = proposal.settings?.tokenAddress
    if (tokenAddress) {
      const recipients = [
        ...new Set([
          ...extractTransfers(actions).map(t => t.to),
          ...extractMints(actions).map(m => m.to),
          ...actions.filter(a => a.value && a.value !== '0').map(a => a.to),
        ]),
      ]
      const holderChecks = await Promise.all(
        recipients.map(async memberAddress => {
          const exists = await Models.TokenMember.exists({ network: proposal.network, tokenAddress, memberAddress })
          return exists ? memberAddress : null
        }),
      )
      for (const holder of holderChecks) if (holder) tokenHolders.add(holder)
    }

    const context: IFraudRiskContext = {
      actions,
      daoAddress: proposal.daoAddress,
      pluginAddress: proposal.pluginAddress,
      creatorAddress: proposal.creatorAddress,
      title: proposal.title,
      description: proposal.description,
      blockTimestamp: proposal.blockTimestamp,
      minParticipation: proposal.settings?.minParticipation ?? null,
      minDuration: proposal.settings?.minDuration ?? null,
      priorProposals,
      priorVotes,
      isSubPlugin: !!plugin.isSubPlugin,
      daoBlockTimestamp: dao?.blockTimestamp ?? null,
      daoAssetCount,
      tokenHolders,
      systemAddresses,
      voters: votes.map(v => v.memberAddress),
    }

    const assessment = scoreProposal(context)
    if (!assessment.matched) return null

    if (existing) return await FraudScan.rescoreFinding(existing, assessment, dao?.ens ?? null, actions)

    // Triage context only — the retro scan never validated a weight for it, so it does not
    // move the score. Best effort: a node hiccup must not cost us the alert.
    let creatorIsContract: boolean | null = null
    try {
      creatorIsContract = !!(await ContractHelper.getBytecode(proposal.creatorAddress, proposal.network))
    } catch (error: any) {
      logger.warn('FraudScan: creator code lookup failed', llo({ id: proposal.id, error: error.message }))
    }

    const finding = await Models.ProposalFinding.createLog({
      id: proposal.id,
      network: proposal.network,
      daoAddress: proposal.daoAddress,
      daoName: dao?.name ?? null,
      pluginAddress: proposal.pluginAddress,
      proposalIndex: proposal.proposalIndex,
      incrementalId: proposal.incrementalId ?? null,
      title: proposal.title ?? null,
      metadataUri: proposal.metadataUri ?? null,
      creatorAddress: proposal.creatorAddress,
      creatorIsContract,
      blockTimestamp: proposal.blockTimestamp,
      endDate: proposal.endDate ?? null,
      attackClass: assessment.attackClass,
      permissionOps: assessment.permissionOps,
      transfers: assessment.transfers,
      mints: assessment.mints,
      nativeValue: assessment.nativeValue,
      signals: assessment.signals,
      score: assessment.score,
      creationScore: assessment.creationScore,
      level: assessment.level,
      creationLevel: assessment.creationLevel,
      priorProposals,
      priorVotes,
      minParticipation: proposal.settings?.minParticipation ?? null,
      minDuration: proposal.settings?.minDuration ?? null,
      suppressedAs: assessment.suppressedAs,
    })

    logger.info(
      'FraudScan: finding recorded',
      llo({
        id: proposal.id,
        network: proposal.network,
        creationScore: assessment.creationScore,
        creationLevel: assessment.creationLevel,
        attackClass: assessment.attackClass,
        suppressedAs: assessment.suppressedAs,
      }),
    )

    await FraudScan.alertFinding(finding, dao?.ens ?? null, actions)

    return finding
  },

  /**
   * Re-scores a finding that already exists, which happens when a vote lands on it. The
   * stored verdict always follows the latest assessment; the team is only messaged again
   * when the level actually rises above what they were last told.
   */
  rescoreFinding: async (
    finding: ProposalFinding,
    assessment: IFraudAssessment,
    daoEns: string | null,
    actions: IFraudRawAction[],
  ) => {
    const previousLevel = finding.level
    finding.score = assessment.score
    finding.level = assessment.level
    finding.signals = assessment.signals
    await Models.ProposalFinding.updateOne(
      { id: finding.id },
      { score: assessment.score, level: assessment.level, signals: assessment.signals },
    )

    // Never alerted — below the threshold at creation, or notifications were off. The
    // normal path handles it now, with the fresh numbers.
    if (!finding.alertedAt) {
      await FraudScan.alertFinding(finding, daoEns, actions)
      return finding
    }

    if (LEVEL_RANK[finding.level] <= LEVEL_RANK[finding.alertedLevel ?? previousLevel]) return finding
    if (!TelegramModule.isConfigured()) return finding

    const slugDoc = await Models.PluginSlug.findOne({
      pluginAddress: finding.pluginAddress,
      network: finding.network,
    }).lean()

    await TelegramModule.sendMessage(FraudScan.formatEscalation(finding, daoEns, slugDoc?.slug ?? null, previousLevel))
    await Models.ProposalFinding.updateOne({ id: finding.id }, { alertedLevel: finding.level })
    logger.info(
      'FraudScan: escalation sent',
      llo({ id: finding.id, from: previousLevel, to: finding.level, score: finding.score }),
    )

    return finding
  },

  /**
   * Confirms via Tenderly and sends the Telegram alert for a finding, once. The simulation
   * is persisted on first run, so a retry never burns Tenderly quota twice.
   *
   * Gating uses the full `score`, which equals `creationScore` at creation time (the only
   * vote-derived signal cannot fire before a vote exists) and carries the escalation later.
   */
  alertFinding: async (finding: ProposalFinding, daoEns: string | null, actions: IFraudRawAction[]) => {
    const shouldAlert = !finding.suppressedAs && finding.score >= config.FRAUD_SCAN.ALERT_MIN_SCORE
    if (!shouldAlert || finding.alertedAt) return

    if (!finding.simulation) {
      finding.simulation = await simulateExecution({
        actions,
        assessment: finding,
        daoAddress: finding.daoAddress,
        pluginAddress: finding.pluginAddress,
        proposalId: finding.id,
        network: finding.network,
      })
      await Models.ProposalFinding.updateOne({ id: finding.id }, { simulation: finding.simulation })
    }

    if (!TelegramModule.isConfigured()) {
      logger.warn('FraudScan: Telegram not configured, alert skipped', llo({ id: finding.id }))
      return
    }

    // Claim the notification atomically. Two consumers racing the same finding cannot both
    // pass this filter, so the channel never receives a duplicate.
    const claimed = await Models.ProposalFinding.findOneAndUpdate(
      { id: finding.id, alertedAt: null },
      { alertedAt: new Date(), alertedLevel: finding.level },
    )
    if (!claimed) return

    const slugDoc = await Models.PluginSlug.findOne({
      pluginAddress: finding.pluginAddress,
      network: finding.network,
    }).lean()

    try {
      await TelegramModule.sendMessage(FraudScan.formatAlert(finding, daoEns, slugDoc?.slug ?? null))
    } catch (error: any) {
      // Release the claim and re-drive ourselves. Throwing here would strand the alert: a
      // failed handler leaves its message id in the queue helper's in-flight set, so the
      // redelivery is acked and dropped rather than retried (src/helpers/rabbitMQ.ts:84).
      await Models.ProposalFinding.updateOne({ id: finding.id }, { alertedAt: null, alertedLevel: null })
      await FraudScan.scheduleAlertRetry(finding, error)
      return
    }

    finding.alertedAt = new Date()
    finding.alertedLevel = finding.level
    logger.info('FraudScan: alert sent', llo({ id: finding.id, level: finding.level }))
  },

  /** Re-queues the scan after a delay so a Telegram outage costs time, not the alert. */
  scheduleAlertRetry: async (finding: ProposalFinding, error: Error) => {
    const attempts = (finding.alertAttempts ?? 0) + 1
    await Models.ProposalFinding.updateOne({ id: finding.id }, { alertAttempts: attempts })

    if (attempts >= config.FRAUD_SCAN.ALERT_MAX_ATTEMPTS) {
      logger.error(
        'FraudScan: giving up on the alert after repeated failures',
        llo({ id: finding.id, attempts, error: error.message }),
      )
      return
    }

    logger.warn('FraudScan: alert failed, retrying later', llo({ id: finding.id, attempts, error: error.message }))
    await RabbitMQHelper.sendDelayedMessage(
      EnumQueueName.proposalFraudScan,
      { id: finding.id, params: { id: finding.id } },
      config.FRAUD_SCAN.ALERT_RETRY_DELAY_MS,
    )
  },

  /** Proposal link, shared by the first alert and the escalation follow-up. */
  proposalUrl: (finding: ProposalFinding, daoEns: string | null, slug: string | null): string => {
    const daoPath = `${config.FRAUD_SCAN.APP_BASE_URL}/dao/${finding.network}/${daoEns ?? finding.daoAddress}`
    return slug && finding.incrementalId != null
      ? `${daoPath}/proposals/${slug.toUpperCase()}-${finding.incrementalId}`
      : daoPath
  },

  formatEscalation: (
    finding: ProposalFinding,
    daoEns: string | null,
    slug: string | null,
    previousLevel: IFraudRiskLevel,
  ): string => {
    const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const lateSignals = finding.signals.filter(s => !s.atCreation)
    const hoursLeft = finding.endDate ? Math.max(0, (finding.endDate * 1000 - Date.now()) / 3_600_000) : null

    const lines = [
      `⬆️ <b>ESCALATED ${previousLevel.toUpperCase()} → ${finding.level.toUpperCase()}</b>`,
      `<b>${escapeHtml(finding.title || 'Untitled proposal')}</b>`,
      FraudScan.proposalUrl(finding, daoEns, slug),
      `score ${finding.score} (was ${finding.creationScore} at creation)`,
    ]
    if (lateSignals.length) lines.push(`new: ${lateSignals.map(s => `${s.name} ${s.detail}`).join('; ')}`)
    if (hoursLeft != null) lines.push(`voting ends in ${hoursLeft.toFixed(1)}h`)

    return lines.join('\n')
  },

  /** Telegram HTML — only user-controlled strings (title, dao name) need escaping. */
  formatAlert: (finding: ProposalFinding, daoEns: string | null, slug: string | null): string => {
    const short = (a?: string | null) => (a ? `${a.slice(0, 8)}…${a.slice(-4)}` : '-')
    const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const hoursLeft = finding.endDate ? Math.max(0, (finding.endDate * 1000 - Date.now()) / 3_600_000) : null

    const lines = [
      `🚨 <b>${finding.level.toUpperCase()}</b> fraud-pattern proposal on <b>${escapeHtml(finding.daoName ?? short(finding.daoAddress))}</b> (${finding.network})`,
      `<b>${escapeHtml(finding.title || 'Untitled proposal')}</b>`,
      FraudScan.proposalUrl(finding, daoEns, slug),
      `score ${finding.score} | classes: ${finding.attackClass.join(', ')}`,
    ]
    for (const op of finding.permissionOps) {
      lines.push(
        `• ${op.operation} ${op.permissionName === 'unknown' ? short(op.permissionId) : op.permissionName} → ${short(op.who)} (on ${short(op.where)})`,
      )
    }
    for (const t of finding.transfers) lines.push(`• transfer ${t.amount} of ${short(t.token)} → ${short(t.to)}`)
    for (const m of finding.mints) lines.push(`• mint ${m.amount} of ${short(m.token)} → ${short(m.to)}`)
    if (finding.nativeValue) lines.push(`• native send of ${finding.nativeValue} wei`)
    const creatorKind = finding.creatorIsContract === null ? '' : finding.creatorIsContract ? ' (contract)' : ' (EOA)'
    lines.push(
      `creator ${short(finding.creatorAddress)}${creatorKind} — ${finding.priorProposals} prior proposals, ${finding.priorVotes} prior votes in this DAO`,
    )
    if (hoursLeft != null) lines.push(`voting ends in ${hoursLeft.toFixed(1)}h`)
    lines.push(`signals: ${finding.signals.map(s => `${s.name}${s.weight > 0 ? '+' : ''}${s.weight}`).join(', ')}`)

    const simulation = finding.simulation
    const link = simulation?.shareUrl ? `\n${simulation.shareUrl}` : ''
    if (simulation?.status === 'confirmed') {
      lines.push(`confirmation: simulation shows the decoded effect${link}`)
    } else if (simulation?.status === 'noEffect') {
      lines.push(`confirmation: simulation ran clean but moved nothing we decoded — check the decode${link}`)
    } else if (simulation?.status === 'reverted') {
      lines.push(`confirmation: simulation reverted, may not execute in the current state${link}`)
    } else {
      lines.push('confirmation: unconfirmed (simulation unavailable)')
    }

    return lines.join('\n')
  },
}

export default FraudScan
