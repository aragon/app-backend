import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type ProposalAssessment from '@models/schema/proposalAssessment'
import DbTx from '@modules/dbTx'
import { IMPLEMENTED_CHECKS } from '@modules/proposalChecks/checks'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import AssessmentEngine from '@modules/proposalChecks/engine'
import WatchedTargets from '@modules/proposalChecks/watchedTargets'
import { type IAssessmentCheck, IAssessmentCheckStatus, IAssessmentRequestStatus } from '@types'
import { type ClientSession } from 'mongoose'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:executor' })

/**
 * One assessment attempt: build the context from the captured revision, run every check, then in
 * one transaction store the result and promote it if the request is still the current one, so a
 * result can never exist without its promotion having been decided. A check that threw is not a
 * result; the attempt fails so the queue retries it. Nothing here sends anything; delivery comes
 * with the Telegram phase. The evidence block's hash is read first: captured on the first
 * attempt, and on every attempt checked against the chain, so a block replaced by a
 * reorganisation is never assessed as if it were still there.
 */
const AssessmentExecutor = {
  async run(request: ProposalAssessment, checks: readonly IAssessmentCheck[] = IMPLEMENTED_CHECKS): Promise<void> {
    const canonical = await AssessmentExecutor._pinEvidenceBlock(request)
    if (!canonical) return
    const ctx = await AssessmentContextBuilder.build(request)
    const result = await AssessmentEngine.run(ctx, checks)

    if (result.status === IAssessmentRequestStatus.Failed) {
      const failed = Object.entries(result.checks)
        .filter(([, status]) => status === IAssessmentCheckStatus.Failed)
        .map(([id]) => `${id}: ${result.reasons[id]}`)
      throw new Error(`checks failed: ${failed.join('; ')}`)
    }

    const outcome: { stored: boolean; promoted: boolean } = await DbTx.executeTxFn(
      async ({ session }: { session: ClientSession }) => {
        const stored = await request.storeResult(
          result,
          { actions: ctx.actions, simulation: ctx.simulation, validation: ctx.validation, readiness: ctx.readiness },
          session,
        )
        if (!stored) return { stored: false, promoted: false }
        const promoted = await request.promote(session, ctx.readiness)
        await DbTx.safeCommit(session)
        return { stored: true, promoted }
      },
      { stopRetry: true, throwOnStop: true },
    )

    if (!outcome.stored) {
      logger.warn('proposal checks: result already stored by another attempt', llo({ id: request.id }))
      return
    }

    await WatchedTargets.register(request, ctx)
    const promoted = outcome.promoted
    logger.verbose(
      'proposal checks: assessment stored',
      llo({
        id: request.id,
        proposalId: request.proposalId,
        generation: request.generation,
        status: result.status,
        findings: result.findings.length,
        missingChecks: result.coverage.missing.length,
        promoted,
      }),
    )
  },

  /**
   * Reads the evidence block from the chain. The hash is captured on the request the first time;
   * afterwards a different hash at the same number means the block was replaced, and the
   * attempt fails for good rather than assess captured actions against another block's state.
   */
  async _pinEvidenceBlock(request: ProposalAssessment): Promise<boolean> {
    const { number, hash } = request.captured.evidenceBlock
    const block = await Web3Helper.getBlock(number, request.network)
    if (!block?.hash) throw new Error(`evidence block ${number} could not be read`)
    if (hash && hash.toLowerCase() !== block.hash.toLowerCase()) {
      await request.markFailed(
        new Error(`evidence block ${number} was replaced: captured ${hash}, chain ${block.hash}`),
      )
      logger.warn(
        'proposal checks: evidence block no longer canonical, attempt dropped',
        llo({ id: request.id, number, hash, chain: block.hash }),
      )
      return false
    }
    if (!hash) request.captured.evidenceBlock.hash = block.hash
    return true
  },
}

export default AssessmentExecutor
