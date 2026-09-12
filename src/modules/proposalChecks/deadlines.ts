import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import Readiness from '@modules/proposalChecks/readiness'
import { type IExecutionValidation, type NetworksEnum } from '@types'
import { type ClientSession } from 'mongoose'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:deadlines' })

/** How many due proposals one run looks at. */
export const DEADLINE_BATCH_SIZE = 100

const NOT_TESTED: IExecutionValidation = {
  status: 'unsupported',
  reason: 'readiness re-evaluated on time only',
  simulationId: null,
  block: 0,
}

/**
 * Re-evaluates readiness when a known time boundary passes: a vote ending, an approval window
 * closing, a stage's advance window opening or expiring. The evaluation runs at the chain's
 * recorded time from the indexed proposal alone, with no simulation. Only a change in what the
 * readiness amounts to asks for the assessment again; the clock merely moving on sets the next
 * boundary. A proven terminal outcome closes the lifecycle pointer and frees the watched targets.
 */
const ProposalCheckDeadlines = {
  async run(): Promise<{ due: number; refreshed: number; closed: number }> {
    const now = Math.floor(Date.now() / 1000)
    const due = await Models.Proposal.find(
      { 'assessment.nextBoundary': { $ne: null, $lte: now }, 'assessment.lifecycle': null },
      { id: 1, network: 1, pluginAddress: 1, assessment: 1 },
      { sort: { 'assessment.nextBoundary': 1 }, limit: DEADLINE_BATCH_SIZE },
    )
    let refreshed = 0
    let closed = 0
    const chainTime = new Map<NetworksEnum, { block: number; time: number }>()
    for (const summary of due) {
      try {
        if (!chainTime.has(summary.network))
          chainTime.set(summary.network, await ProposalCheckDeadlines._chainTime(summary.network))
        const outcome = await ProposalCheckDeadlines._evaluate(summary.id, chainTime.get(summary.network)!)
        if (outcome === 'refreshed') refreshed += 1
        if (outcome === 'closed') closed += 1
      } catch (error) {
        logger.warn('proposal checks: deadline evaluation failed', llo({ proposalId: summary.id, error }))
      }
    }
    if (due.length) logger.verbose('proposal checks: deadlines evaluated', llo({ due: due.length, refreshed, closed }))
    return { due: due.length, refreshed, closed }
  },

  async _evaluate(
    proposalId: string,
    at: { block: number; time: number },
  ): Promise<'refreshed' | 'closed' | 'advanced'> {
    const proposal = await Models.Proposal.findByEntityId(proposalId)
    if (!proposal) return 'advanced'
    const plugin = await Models.Plugin.findByAddress(proposal.pluginAddress, proposal.network)
    const readiness = Readiness.evaluate(proposal, plugin?.interfaceType ?? null, at.time, NOT_TESTED)
    const key = Readiness.key(readiness)
    const boundary = proposal.assessment.nextBoundary
    // The deadline that just passed is named in the readiness the assessment saw; the new one no longer lists it.
    const seen = (proposal.assessment.readinessKey ?? '').split('|')[3] ?? ''
    const kind =
      seen
        .split(',')
        .find(d => d.endsWith(`@${boundary}`))
        ?.split('@')[0] || 'boundary'

    if (readiness.outcome) {
      await Models.Proposal.updateOne(
        { id: proposalId },
        {
          $set: {
            'assessment.lifecycle': readiness.outcome,
            'assessment.nextBoundary': null,
            'assessment.readinessKey': key,
          },
        },
      )
      await Models.ProposalWatchedTarget.release(proposalId)
      logger.verbose(
        'proposal checks: proposal reached a terminal outcome',
        llo({ proposalId, outcome: readiness.outcome }),
      )
      return 'closed'
    }
    if (key === proposal.assessment.readinessKey) {
      // Nothing about the proposal's state changed: only the clock did. Wait for the next boundary.
      const next = readiness.nextBoundary !== null && readiness.nextBoundary > at.time ? readiness.nextBoundary : null
      await Models.Proposal.updateOne({ id: proposalId }, { $set: { 'assessment.nextBoundary': next } })
      return 'advanced'
    }
    const created: boolean = await DbTx.executeTxFn(
      async ({ session }: { session: ClientSession }) => {
        const result = await Models.ProposalAssessment.requestRefresh(
          {
            proposalId,
            causeId: `deadline:${kind}:${boundary}`,
            evidenceBlock: { number: at.block, hash: null, time: at.time },
          },
          session,
        )
        await DbTx.safeCommit(session)
        return !!result?.created
      },
      { stopRetry: true, throwOnStop: true },
    )
    // The refreshed assessment sets the next boundary when it lands; until then the same one must not fire again.
    await Models.Proposal.updateOne(
      { id: proposalId },
      { $set: { 'assessment.nextBoundary': null, 'assessment.readinessKey': key } },
    )
    if (created)
      logger.verbose(
        'proposal checks: readiness transition observed, assessment requested',
        llo({ proposalId, kind, boundary }),
      )
    return 'refreshed'
  },

  /** The chain's own clock: the latest block and its timestamp. */
  async _chainTime(network: NetworksEnum): Promise<{ block: number; time: number }> {
    const block = await Web3Helper.getBlockNumber('latest', network)
    if (block < 0) throw new Error('chain head not available')
    const time = await Web3Helper.getBlockTimestamp(block, network)
    if (!time) throw new Error(`timestamp of block ${block} not available`)
    return { block, time }
  },
}

export default ProposalCheckDeadlines
