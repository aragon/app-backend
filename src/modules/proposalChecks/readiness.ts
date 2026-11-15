import { type IExecutionValidation, type IReadiness, type IStageEvidence, type IVotingEvidence } from '@types'

/** OSx vote options: none, abstain, yes, no. */
const ABSTAIN = 1
const YES = 2
const NO = 3
const RATIO_BASE = 1_000_000n
const EARLY_EXECUTION_MODE = 1

/** The slice of a proposal document the adapters read; everything is optional because indexed data varies by plugin. */
export interface IReadinessProposal {
  startDate?: number
  endDate?: number
  executed?: { status?: boolean; blockNumber?: number | null } | null
  cancelTxInfo?: { blockNumber?: number | null } | null
  settings?: {
    votingMode?: number
    supportThreshold?: number
    minParticipation?: number
    minApprovals?: number
    stages?: Array<{ minAdvance?: number; maxAdvance?: number; voteDuration?: number; plugins?: unknown[] }>
  } | null
  /** The minimum voting power frozen into the proposal on chain; it beats the indexed ratio. */
  minVotingPower?: string
  snapshot?: { totalSupply?: string; membersCount?: number } | null
  metrics?: { totalVotes?: number; votesByOption?: Array<{ type: number; totalVotingPower?: string }> } | null
  stageIndex?: number
  lastStageTransition?: number
  stageExecutions?: Array<{ status?: boolean; stageIndex?: number | null }>
}

interface ITally {
  yes: bigint
  no: bigint
  abstain: bigint
  supply: bigint | null
}

/**
 * Says where a proposal stands on its way to execution at the evidence time, from the indexed
 * proposal and the plugin's own rules: a vote that has not ended, an approval count not yet
 * reached, a stage window not yet open are states to wait through, not gaps. The plugin's
 * execute, tested at the block, has the last word on "executable now": the adapter's arithmetic
 * never overrides a refusal from the contract.
 */
const Readiness = {
  evaluate(
    indexedProposal: IReadinessProposal | null,
    interfaceType: string | null,
    now: number,
    validation: IExecutionValidation,
    evidence?: { block: number; voting: IVotingEvidence; stages: IStageEvidence },
  ): IReadiness {
    const proposal = indexedProposal && evidence ? Readiness._atBlock(indexedProposal, evidence) : indexedProposal
    const base: IReadiness = {
      plugin: interfaceType ?? 'unknown',
      supported: false,
      earliestExecution: null,
      executableNow: null,
      remaining: [],
      deadlines: [],
      outcome: null,
      nextBoundary: null,
      limits: [],
    }
    if (!proposal) return { ...base, limits: ['the proposal is not indexed'] }
    if (proposal.executed?.status) return { ...base, supported: true, outcome: 'executed', executableNow: false }
    if (proposal.cancelTxInfo) return { ...base, supported: true, outcome: 'cancelled', executableNow: false }

    let readiness: IReadiness
    switch (interfaceType) {
      case 'tokenVoting':
      case 'lockToVote':
        readiness = Readiness._majority(proposal, now, base, interfaceType === 'lockToVote')
        break
      case 'multisig':
        readiness = Readiness._multisig(proposal, now, base)
        break
      case 'admin':
        readiness = { ...base, supported: true, executableNow: true, earliestExecution: proposal.startDate ?? null }
        break
      case 'spp':
        readiness = Readiness._staged(proposal, now, base)
        break
      default:
        return { ...base, limits: [`no readiness adapter for plugin type ${interfaceType ?? 'unknown'}`] }
    }
    return Readiness._reconcile(readiness, validation)
  },

  /**
   * Token voting and lock-to-vote: support is yes over yes plus no and must exceed the threshold,
   * participation counts every vote against the supply and must reach the minimum. Early
   * execution passes once no remaining vote could turn the outcome. A passed proposal stays
   * executable; a failed one is defeated once the vote ends.
   */
  _majority(proposal: IReadinessProposal, now: number, base: IReadiness, live: boolean): IReadiness {
    const start = proposal.startDate ?? null
    const end = proposal.endDate ?? null
    const settings = proposal.settings ?? {}
    const tally = Readiness._tally(proposal)
    const limits = live ? ['locked voting power can grow while the vote is open, so the tally below can move'] : []
    const frozen = proposal.minVotingPower
    if (start === null || end === null || settings.supportThreshold === undefined) {
      return { ...base, supported: true, limits: [...limits, 'voting dates or settings are not indexed'] }
    }
    if (frozen === undefined && settings.minParticipation === undefined) {
      return { ...base, supported: true, limits: [...limits, 'voting dates or settings are not indexed'] }
    }
    const threshold = BigInt(settings.supportThreshold)
    const supportReached = (RATIO_BASE - threshold) * tally.yes > threshold * tally.no
    // The contract froze its own minimum when the proposal was created; the indexed ratio is only
    // used when that number could not be read, since the two can disagree.
    const participationReached =
      frozen !== undefined
        ? tally.yes + tally.no + tally.abstain >= BigInt(frozen)
        : tally.supply !== null && tally.supply > 0n
          ? (tally.yes + tally.no + tally.abstain) * RATIO_BASE >= BigInt(settings.minParticipation!) * tally.supply
          : null
    const remaining: IReadiness['remaining'] = []
    if (!supportReached)
      remaining.push({ id: 'support', description: 'yes votes do not exceed the support threshold over yes plus no' })
    if (participationReached === false)
      remaining.push({ id: 'participation', description: 'votes cast do not reach the minimum participation' })
    if (participationReached === null)
      limits.push('total voting power at the snapshot is not indexed, so participation is not computed')

    if (now < start) {
      return {
        ...base,
        supported: true,
        executableNow: false,
        earliestExecution: settings.votingMode === EARLY_EXECUTION_MODE ? start : end,
        remaining: [{ id: 'voting-start', description: 'voting has not started' }, ...remaining],
        deadlines: [{ id: 'voting-end', at: end, description: 'voting ends' }],
        nextBoundary: start,
        limits,
      }
    }
    if (now < end) {
      const early =
        settings.votingMode === EARLY_EXECUTION_MODE &&
        tally.supply !== null &&
        participationReached === true &&
        (RATIO_BASE - threshold) * tally.yes > threshold * (tally.supply - tally.yes - tally.abstain)
      return {
        ...base,
        supported: true,
        executableNow: early,
        earliestExecution: early ? now : end,
        remaining: early ? [] : [{ id: 'voting-end', description: 'voting has not ended' }, ...remaining],
        deadlines: [{ id: 'voting-end', at: end, description: 'voting ends' }],
        nextBoundary: end,
        limits,
      }
    }
    // Support alone can defeat; without the supply, whether participation was reached stays open.
    if (!supportReached || participationReached === false) {
      return {
        ...base,
        supported: true,
        executableNow: false,
        remaining,
        deadlines: [],
        outcome: 'defeated',
        nextBoundary: null,
        limits,
      }
    }
    const passed = participationReached === true
    return {
      ...base,
      supported: true,
      executableNow: passed ? true : null,
      earliestExecution: passed ? end : null,
      remaining: passed ? [] : remaining,
      deadlines: [],
      outcome: null,
      nextBoundary: null,
      limits: passed ? limits : [...limits, 'whether the vote passed is not known without the eligible supply'],
    }
  },

  /** The multisig executes once the approvals are in, and only until its end date. */
  _multisig(proposal: IReadinessProposal, now: number, base: IReadiness): IReadiness {
    const start = proposal.startDate ?? null
    const end = proposal.endDate ?? null
    const needed = proposal.settings?.minApprovals ?? null
    const approvals = proposal.metrics?.totalVotes ?? null
    if (start === null || end === null || needed === null) {
      return { ...base, supported: true, limits: ['dates or the required approvals are not indexed'] }
    }
    const limits = ['the approval count is the index of today, not the one at the evidence block']
    if (approvals === null) limits.push('approvals so far are not indexed')
    const enough = approvals !== null && approvals >= needed
    if (now > end) {
      return {
        ...base,
        supported: true,
        executableNow: false,
        outcome: 'expired',
        limits: [...limits, 'the approval window closed before execution'],
      }
    }
    const remaining: IReadiness['remaining'] = []
    if (now < start) remaining.push({ id: 'voting-start', description: 'the approval window has not opened' })
    if (!enough) remaining.push({ id: 'approvals', description: `${approvals ?? 'unknown'} of ${needed} approvals` })
    return {
      ...base,
      supported: true,
      executableNow: enough && now >= start,
      earliestExecution: enough ? Math.max(now, start) : null,
      remaining,
      deadlines: [{ id: 'expiry', at: end, description: 'the proposal expires unexecuted' }],
      nextBoundary: now < start ? start : end,
      limits,
    }
  },

  /**
   * A staged processor moves stage by stage: the current stage can advance between its earliest
   * and latest advance times once its bodies report, and expires past the latest. What the bodies
   * have reported is not folded here; the execute test at the block says whether it can run.
   */
  _staged(proposal: IReadinessProposal, now: number, base: IReadiness): IReadiness {
    const stages = proposal.settings?.stages ?? []
    const index = proposal.stageIndex ?? 0
    const stage = stages[index]
    if (!stage) return { ...base, supported: true, limits: ['the stages of this proposal are not indexed'] }
    const stageStart = proposal.lastStageTransition ?? proposal.startDate ?? null
    if (stageStart === null)
      return { ...base, supported: true, limits: ['the start of the current stage is not indexed'] }
    const earliest = stageStart + (stage.minAdvance ?? 0)
    const latest = stage.maxAdvance ? stageStart + stage.maxAdvance : null
    const voteEnd = stage.voteDuration ? stageStart + stage.voteDuration : null
    const last = index === stages.length - 1
    if (latest !== null && now > latest) {
      return {
        ...base,
        supported: true,
        executableNow: false,
        outcome: 'expired',
        limits: [`stage ${index + 1} was not advanced before its latest advance time`],
      }
    }
    const remaining: IReadiness['remaining'] = [
      {
        id: `stage-${index + 1}-results`,
        description: `the ${(stage.plugins ?? []).length} bodies of stage ${index + 1} have to report`,
      },
    ]
    if (now < earliest)
      remaining.push({
        id: `stage-${index + 1}-min-advance`,
        description: `stage ${index + 1} cannot advance before its earliest advance time`,
      })
    for (let later = index + 1; later < stages.length; later++)
      remaining.push({ id: `stage-${later + 1}`, description: `stage ${later + 1} has to pass` })
    const deadlines: IReadiness['deadlines'] = []
    if (voteEnd !== null)
      deadlines.push({
        id: `stage-${index + 1}-vote-end`,
        at: voteEnd,
        description: `voting on stage ${index + 1} ends`,
      })
    if (latest !== null)
      deadlines.push({
        id: `stage-${index + 1}-max-advance`,
        at: latest,
        description: `stage ${index + 1} must advance by then`,
      })
    const boundaries = [earliest, voteEnd, latest].filter((t): t is number => t !== null && t > now)
    return {
      ...base,
      supported: true,
      executableNow: null,
      earliestExecution: last ? earliest : null,
      remaining,
      deadlines,
      nextBoundary: boundaries.length ? Math.min(...boundaries) : null,
      limits: ['what the stage bodies reported is not folded here; the execute test at the block decides'],
    }
  },

  /**
   * The proposal as it stood at the evidence block, not as the mutable index holds it today: an
   * execution or cancellation after the block has not happened yet, and where the plugin was
   * read at the block (a token vote, a staged proposal) its tally, dates and stage replace the
   * index. A multisig's approval count is only known as of today, which is said.
   */
  _atBlock(
    proposal: IReadinessProposal,
    evidence: { block: number; voting: IVotingEvidence; stages: IStageEvidence },
  ): IReadinessProposal {
    const at: IReadinessProposal = { ...proposal }
    if (proposal.executed?.status && proposal.executed.blockNumber && proposal.executed.blockNumber > evidence.block)
      at.executed = { status: false }
    if (proposal.cancelTxInfo?.blockNumber && proposal.cancelTxInfo.blockNumber > evidence.block) at.cancelTxInfo = null
    const vote = evidence.voting.chain
    if (vote) {
      at.executed = { status: vote.executed }
      at.startDate = vote.startDate
      at.endDate = vote.endDate
      at.settings = {
        ...(proposal.settings ?? {}),
        votingMode: vote.votingMode,
        supportThreshold: Number(vote.supportThreshold),
      }
      at.minVotingPower = vote.minVotingPower
      at.snapshot = { totalSupply: vote.eligibleSupply ?? undefined }
      at.metrics = {
        totalVotes: proposal.metrics?.totalVotes,
        votesByOption: [
          { type: YES, totalVotingPower: vote.tally.yes },
          { type: NO, totalVotingPower: vote.tally.no },
          { type: ABSTAIN, totalVotingPower: vote.tally.abstain },
        ],
      }
    }
    const stage = evidence.stages.chain
    if (stage) {
      at.executed = { status: stage.executed }
      if (stage.canceled) at.cancelTxInfo = { blockNumber: evidence.block }
      at.stageIndex = stage.currentStage
      at.lastStageTransition = stage.lastStageTransition
    }
    return at
  },

  _tally(proposal: IReadinessProposal): ITally {
    const power = (type: number) =>
      BigInt(proposal.metrics?.votesByOption?.find(v => v.type === type)?.totalVotingPower ?? '0')
    const supply = proposal.snapshot?.totalSupply ? BigInt(proposal.snapshot.totalSupply) : null
    return { yes: power(YES), no: power(NO), abstain: power(ABSTAIN), supply }
  },

  /** The contract's own answer wins over the arithmetic: it was asked at the evidence block. */
  _reconcile(readiness: IReadiness, validation: IExecutionValidation): IReadiness {
    if (validation.status === 'executable') {
      const contradicted = readiness.outcome === 'defeated'
      return {
        ...readiness,
        executableNow: true,
        remaining: [],
        outcome: contradicted ? null : readiness.outcome,
        limits: contradicted
          ? [...readiness.limits, 'the plugin accepted execution although the indexed tally read as defeated']
          : readiness.limits,
      }
    }
    if (validation.status === 'reverted') {
      return {
        ...readiness,
        executableNow: false,
        limits: [
          ...readiness.limits,
          `the execution test reverted at the block: ${validation.reason ?? 'no reason given'}`,
        ],
      }
    }
    if (validation.status === 'notYet' && readiness.executableNow === true) {
      return {
        ...readiness,
        executableNow: false,
        limits: [
          ...readiness.limits,
          'the plugin refused execution at the block although the indexed tally says it should pass',
        ],
      }
    }
    return readiness
  },
}

export default Readiness
