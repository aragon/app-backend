import config from '@config'
import ContractHelper from '@helpers/contractHelper'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import type ProposalFinding from '@models/schema/proposalFinding'
import TelegramModule from '@modules/telegram'
import ProviderModule from '@modules/provider'
import {
  EnumQueueName,
  type HexAddress,
  type IFraudAssessment,
  type IFraudRawAction,
  type IFraudRiskContext,
  type IFraudRiskLevel,
  type IFraudSimulationFacts,
  IPluginInterfaceType,
  type NetworksEnum,
} from '@types'
import { extractMints, extractTransfers } from './decode'
import { scoreProposal } from './score'
import { simulateExecution } from './simulate'
import { SIMULATION_SIGNAL_NAMES, simulationSignals } from './simulationSignals'

const llo = logger.logMeta.bind(null, { service: 'fraud-scan' })

const LEVEL_RANK: Record<IFraudRiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 }

/**
 * Plugin types whose proposals execute directly on the DAO. Keep in step with the publisher
 * gate in src/handlers/proposalHandler.ts — this side is the one that must hold, since the
 * queue is not a trusted input.
 */
export const SCANNED_PLUGIN_TYPES = new Set<IPluginInterfaceType>([
  IPluginInterfaceType.tokenVoting,
  IPluginInterfaceType.lockToVote,
])

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
    if (!plugin || !SCANNED_PLUGIN_TYPES.has(plugin.interfaceType)) return null
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

    const creatorFacts = await FraudScan.resolveCreator(proposal)

    const context: IFraudRiskContext = {
      actions,
      daoAddress: proposal.daoAddress,
      pluginAddress: proposal.pluginAddress,
      creatorAddress: proposal.creatorAddress,
      title: proposal.title,
      description: proposal.description,
      metadataUri: proposal.metadataUri ?? null,
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
      creatorIsContract: creatorFacts.creatorIsContract,
      creatorUnverified: creatorFacts.creatorUnverified,
      originNonce: creatorFacts.originNonce,
      originIsSelfCall: creatorFacts.originIsSelfCall,
    }

    // A re-score reuses what the first run saw: Tenderly is paid per run and the actions
    // cannot change after creation.
    if (existing?.simulation) {
      const kept = (existing.signals ?? []).filter(signal => SIMULATION_SIGNAL_NAMES.has(signal.name))
      return await FraudScan.rescoreFinding(existing, scoreProposal(context, kept), dao?.ens ?? null)
    }

    // Ungated on purpose: a proposal we cannot read is the one most worth executing in a
    // sandbox, and all networks together produce ~14 a day.
    const facts = await FraudScan.simulate(proposal, actions)
    const assessment = scoreProposal(context, simulationSignals(facts, context))

    if (existing) return await FraudScan.rescoreFinding(existing, assessment, dao?.ens ?? null, facts)

    // Everything scanned is recorded, matched or not. A proposal we decided was clean is the
    // only way to notice a miss later, and it is what the quiet notification reports.

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
      creatorIsContract: creatorFacts.creatorIsContract,
      blockTimestamp: proposal.blockTimestamp,
      endDate: proposal.endDate ?? null,
      attackClass: assessment.attackClass,
      permissionOps: assessment.permissionOps,
      transfers: assessment.transfers,
      mints: assessment.mints,
      upgrades: assessment.upgrades,
      nativeValue: assessment.nativeValue,
      signals: assessment.signals,
      movements: facts.movements,
      approvals: facts.approvals,
      simulation: { status: facts.status, shareUrl: facts.shareUrl, runAt: facts.runAt },
      score: assessment.score,
      creationScore: assessment.creationScore,
      level: assessment.level,
      creationLevel: assessment.creationLevel,
      creatorUnverified: creatorFacts.creatorUnverified,
      originNonce: creatorFacts.originNonce,
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
        matched: assessment.matched,
        simulation: facts.status,
        movements: facts.movements.length,
        approvals: facts.approvals.length,
        creationScore: assessment.creationScore,
        creationLevel: assessment.creationLevel,
        attackClass: assessment.attackClass,
        suppressedAs: assessment.suppressedAs,
      }),
    )

    await FraudScan.notifyFinding(finding, dao?.ens ?? null)

    return finding
  },

  /**
   * Scored, full stop. Also requiring a recognised attack class is what silenced the Term
   * findings — the score already carries whether anything was recognised.
   */
  isAlertWorthy: (finding: ProposalFinding): boolean =>
    !finding.suppressedAs && finding.score >= config.FRAUD_SCAN.ALERT_MIN_SCORE,

  /**
   * Re-scores a finding that already exists, which happens when a vote lands on it. The
   * stored verdict always follows the latest assessment; the team is only messaged again
   * when the level actually rises above what they were last told.
   */
  rescoreFinding: async (
    finding: ProposalFinding,
    assessment: IFraudAssessment,
    daoEns: string | null,
    facts?: IFraudSimulationFacts,
  ) => {
    const previousLevel = finding.level
    finding.score = assessment.score
    finding.level = assessment.level
    finding.signals = assessment.signals
    const simulationUpdate = facts
      ? {
          movements: facts.movements,
          approvals: facts.approvals,
          simulation: { status: facts.status, shareUrl: facts.shareUrl, runAt: facts.runAt },
        }
      : {}
    await Models.ProposalFinding.updateOne(
      { id: finding.id },
      { score: assessment.score, level: assessment.level, signals: assessment.signals, ...simulationUpdate },
    )

    // Nothing said yet — notifications were off, or the send failed. The normal path
    // handles it now, with the fresh numbers.
    if (!finding.alertedAt) {
      await FraudScan.notifyFinding(finding, daoEns)
      return finding
    }

    // It was only mentioned in passing before and now it crosses the alert line, so the
    // team gets the real thing rather than an escalation line about a message they skimmed.
    if (finding.alertedAs === 'scanned' && FraudScan.isAlertWorthy(finding)) {
      await Models.ProposalFinding.updateOne({ id: finding.id }, { alertedAt: null, alertedAs: null })
      finding.alertedAt = null
      await FraudScan.notifyFinding(finding, daoEns)
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

  /** A skipped network reports `unconfirmed`, never a clean result. */
  simulate: async (
    proposal: {
      id: string
      daoAddress: string
      pluginAddress: string
      network: NetworksEnum
      blockNumber?: number | null
      allowFailureMap?: number | null
    },
    actions: IFraudRawAction[],
  ): Promise<IFraudSimulationFacts> => {
    if (!config.FRAUD_SCAN.SIMULATE_NETWORKS.includes(proposal.network)) {
      return {
        status: 'unconfirmed',
        shareUrl: null,
        runAt: Date.now(),
        movements: [],
        approvals: [],
        calls: [],
        error: `${proposal.network} is not simulated`,
      }
    }

    return await simulateExecution({
      actions,
      daoAddress: proposal.daoAddress,
      pluginAddress: proposal.pluginAddress,
      proposalId: proposal.id,
      network: proposal.network,
      blockNumber: proposal.blockNumber,
      allowFailureMap: proposal.allowFailureMap,
    })
  },

  /** Best effort. Null means "could not establish", and null never scores. */
  resolveCreator: async (proposal: {
    id: string
    creatorAddress: HexAddress
    network: NetworksEnum
    transactionHash?: string | null
    blockNumber?: number | null
  }) => {
    let creatorIsContract: boolean | null = null
    let creatorUnverified: boolean | null = null
    let originNonce: number | null = null
    let originIsSelfCall: boolean | null = null

    try {
      const bytecode = await ContractHelper.getBytecode(proposal.creatorAddress, proposal.network)
      creatorIsContract = !!bytecode
      if (bytecode) {
        const source = await ContractHelper.getSourceCode(proposal.creatorAddress, proposal.network)
        creatorUnverified = !source
      }
    } catch (error: any) {
      logger.warn('FraudScan: creator code lookup failed', llo({ id: proposal.id, error: error.message }))
    }

    if (proposal.transactionHash) {
      try {
        const provider = ProviderModule.getAnyRpcProvider(proposal.network)
        const tx = await provider.getTransaction(proposal.transactionHash)
        if (tx?.from) {
          originNonce = await provider.getTransactionCount(tx.from, proposal.blockNumber ?? 'latest')
          // from === to with code there is a delegated EOA, how two Term proposals were made.
          originIsSelfCall =
            !!tx.to && tx.to.toLowerCase() === tx.from.toLowerCase() && !!(await provider.getCode(tx.from))
        }
      } catch (error: any) {
        logger.warn('FraudScan: origin lookup failed', llo({ id: proposal.id, error: error.message }))
      }
    }

    return { creatorIsContract, creatorUnverified, originNonce, originIsSelfCall }
  },

  /**
   * Says something about a finding, once: the full block if it scored, otherwise a one-line
   * note so a miss is visible instead of silent. Gates on `score`, which equals `creationScore`
   * at creation time and carries the escalation later.
   */
  notifyFinding: async (finding: ProposalFinding, daoEns: string | null) => {
    if (finding.alertedAt) return

    const alertWorthy = FraudScan.isAlertWorthy(finding)
    if (!alertWorthy && !config.FRAUD_SCAN.NOTIFY_ALL) return

    if (!TelegramModule.isConfigured()) {
      logger.warn('FraudScan: Telegram not configured, notification skipped', llo({ id: finding.id }))
      return
    }

    const alertedAs = alertWorthy ? 'alert' : 'scanned'

    // Claim the notification atomically. Two consumers racing the same finding cannot both
    // pass this filter, so the channel never receives a duplicate.
    const claimed = await Models.ProposalFinding.findOneAndUpdate(
      { id: finding.id, alertedAt: null },
      { alertedAt: new Date(), alertedLevel: finding.level, alertedAs },
    )
    if (!claimed) return

    const slugDoc = await Models.PluginSlug.findOne({
      pluginAddress: finding.pluginAddress,
      network: finding.network,
    }).lean()
    const slug = slugDoc?.slug ?? null

    try {
      const message = alertWorthy
        ? FraudScan.formatAlert(finding, daoEns, slug)
        : FraudScan.formatScanned(finding, daoEns, slug)
      await TelegramModule.sendMessage(message)
    } catch (error: any) {
      // Release the claim and re-drive ourselves. Throwing here would strand the alert: a
      // failed handler leaves its message id in the queue helper's in-flight set, so the
      // redelivery is acked and dropped rather than retried (src/helpers/rabbitMQ.ts:84).
      await Models.ProposalFinding.updateOne(
        { id: finding.id },
        { alertedAt: null, alertedLevel: null, alertedAs: null },
      )
      await FraudScan.scheduleAlertRetry(finding, error)
      return
    }

    finding.alertedAt = new Date()
    finding.alertedLevel = finding.level
    finding.alertedAs = alertedAs
    logger.info('FraudScan: notification sent', llo({ id: finding.id, level: finding.level, alertedAs }))
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

  /**
   * The quiet line for a proposal we looked at and did not alert on. It repeats what we
   * decoded, which is the only way a missed attack shows up in the channel rather than
   * disappearing into silence.
   */
  formatScanned: (finding: ProposalFinding, daoEns: string | null, slug: string | null): string => {
    const short = (a?: string | null) => (a ? `${a.slice(0, 8)}…${a.slice(-4)}` : '-')
    const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const verdict = finding.suppressedAs
      ? `suppressed as ${finding.suppressedAs}`
      : `scored ${finding.score}, below the alert line of ${config.FRAUD_SCAN.ALERT_MIN_SCORE}`

    const moves = [
      ...finding.permissionOps.map(
        op =>
          `${op.operation} ${op.permissionName === 'unknown' ? short(op.permissionId) : op.permissionName} → ${short(op.who)}`,
      ),
      ...finding.transfers.map(t => `transfer ${t.amount} of ${short(t.token)} → ${short(t.to)}`),
      ...finding.mints.map(m => `mint ${m.amount} of ${short(m.token)} → ${short(m.to)}`),
      ...(finding.upgrades ?? []).map(u => `upgrade ${short(u.target)} → impl ${short(u.implementation)}`),
      ...(finding.nativeValue ? [`native ${finding.nativeValue} wei`] : []),
    ]

    return [
      `🔎 scanned <b>${escapeHtml(finding.daoName ?? short(finding.daoAddress))}</b> (${finding.network}) — ${verdict}`,
      `${escapeHtml(finding.title || 'Untitled proposal')}`,
      FraudScan.proposalUrl(finding, daoEns, slug),
      moves.length ? `actions: ${moves.join('; ')}` : 'actions: none we decode',
      `creator ${short(finding.creatorAddress)} — ${finding.priorProposals} prior proposals, ${finding.priorVotes} prior votes`,
    ].join('\n')
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
    for (const u of finding.upgrades ?? []) {
      const init = u.initSelector
        ? ` then calls ${u.initSelector}${u.initAddresses.length ? ` on ${u.initAddresses.map(short).join(', ')}` : ''}`
        : ''
      lines.push(`• upgrade ${short(u.target)} to implementation ${short(u.implementation)}${init}`)
    }
    if (finding.nativeValue) lines.push(`• native send of ${finding.nativeValue} wei`)
    // Decoded intent is above; what actually happens is here.
    for (const m of finding.movements ?? []) {
      const usd = m.usd ? ` (~$${Math.round(m.usd).toLocaleString()})` : ''
      lines.push(`• moves ${m.amount} ${m.symbol ?? short(m.token)} → ${short(m.to)}${usd}`)
    }
    for (const a of finding.approvals ?? []) {
      lines.push(`• approves ${a.isUnlimited ? 'UNLIMITED' : a.amount} ${short(a.token)} to ${short(a.spender)}`)
    }
    const creatorKind = finding.creatorIsContract === null ? '' : finding.creatorIsContract ? ' (contract)' : ' (EOA)'
    lines.push(
      `creator ${short(finding.creatorAddress)}${creatorKind} — ${finding.priorProposals} prior proposals, ${finding.priorVotes} prior votes in this DAO`,
    )
    if (hoursLeft != null) lines.push(`voting ends in ${hoursLeft.toFixed(1)}h`)
    lines.push(`signals: ${finding.signals.map(s => `${s.name}${s.weight > 0 ? '+' : ''}${s.weight}`).join(', ')}`)

    const simulation = finding.simulation
    const link = simulation?.shareUrl ? `\n${simulation.shareUrl}` : ''
    if (simulation?.status === 'confirmed') {
      lines.push(`simulation: executed, effects listed above${link}`)
    } else if (simulation?.status === 'noEffect') {
      lines.push(`simulation: executed cleanly and nothing moved${link}`)
    } else if (simulation?.status === 'reverted') {
      lines.push(`simulation: reverts against today's state — it may still execute at endDate${link}`)
    } else {
      lines.push('simulation: did not run — this finding rests on static signals alone')
    }

    return lines.join('\n')
  },
}

export default FraudScan
