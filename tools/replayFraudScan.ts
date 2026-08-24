import { Models } from '@dbModels'
import logger from '@logger'
import { FraudScan, SCANNED_PLUGIN_TYPES } from '@modules/fraudDetection/fraudScan'
import { scoreProposal } from '@modules/fraudDetection/score'
import { simulationSignals } from '@modules/fraudDetection/simulationSignals'
import { extractMints, extractTransfers } from '@modules/fraudDetection/decode'
import { EnumConnection, type IFraudRiskContext, type IService } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Tools: ReplayFraudScan' })

/**
 * Re-scores existing proposals through the current detector, writing and sending nothing, and
 * prints the stored score next to the new one. Ids prove a known attack is now caught; a day
 * range shows what the weights do to everyday traffic. Tune against this, not production.
 *
 * REPLAY_IDS      comma-separated proposal ids; takes precedence
 * REPLAY_DAYS     look back this many days instead (default 30)
 * REPLAY_SIMULATE `true` to call Tenderly; off by default so a distribution run is free
 */
export const ReplayFraudScan: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const ids = (process.env.REPLAY_IDS ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
    const days = Number(process.env.REPLAY_DAYS ?? 30)
    const withSimulation = process.env.REPLAY_SIMULATE === 'true'

    const query = ids.length
      ? { id: { $in: ids } }
      : { blockTimestamp: { $gt: Math.floor(Date.now() / 1000) - days * 86400 }, rawActions: { $exists: true, $ne: [] } }

    const proposals = await Models.Proposal.find(query).lean()
    logger.info('Replaying', llo({ count: proposals.length, withSimulation }))

    const buckets: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 }
    const rows: string[] = []

    for (const proposal of proposals) {
      const actions = proposal.rawActions ?? []
      if (!actions.length) continue

      const plugin = await Models.Plugin.findByAddress(proposal.pluginAddress, proposal.network)
      if (!plugin || !SCANNED_PLUGIN_TYPES.has(plugin.interfaceType)) continue
      if (plugin.isSubPlugin || plugin.parentPlugin) continue

      const [dao, daoAssetCount, priorProposals, priorVotes, daoPlugins, votes, stored] = await Promise.all([
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
        Models.Vote.find({
          network: proposal.network,
          pluginAddress: proposal.pluginAddress,
          proposalIndex: proposal.proposalIndex,
        })
          .select('memberAddress')
          .lean(),
        Models.ProposalFinding.findOne({ id: proposal.id }).lean(),
      ])

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
        for (const memberAddress of recipients) {
          if (await Models.TokenMember.exists({ network: proposal.network, tokenAddress, memberAddress })) {
            tokenHolders.add(memberAddress)
          }
        }
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
        systemAddresses: new Set<string>(daoPlugins.map(p => p.address)),
        voters: votes.map(v => v.memberAddress),
        creatorIsContract: creatorFacts.creatorIsContract,
        creatorUnverified: creatorFacts.creatorUnverified,
        originNonce: creatorFacts.originNonce,
        originIsSelfCall: creatorFacts.originIsSelfCall,
      }

      const facts = withSimulation
        ? await FraudScan.simulate(proposal, actions)
        : {
            status: 'unconfirmed' as const,
            shareUrl: null,
            runAt: Date.now(),
            movements: [],
            approvals: [],
            calls: [],
            error: 'replay ran without simulation',
          }

      const assessment = scoreProposal(context, simulationSignals(facts, context))
      buckets[assessment.level] += 1

      const was = stored?.score ?? 0
      if (assessment.score !== was) {
        rows.push(
          `${proposal.id} | ${dao?.name ?? proposal.daoAddress} | ${was} -> ${assessment.score} (${assessment.level}) | ${assessment.signals.map(s => s.name).join(',')}`,
        )
      }
    }

    for (const row of rows) logger.info(row, llo({}))
    logger.info('Replay distribution', llo({ ...buckets, changed: rows.length }))
  },

  stop: async () => {},
}

export default ReplayFraudScan
