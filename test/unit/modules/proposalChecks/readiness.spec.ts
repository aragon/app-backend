import Readiness, { type IReadinessProposal } from '@modules/proposalChecks/readiness'
import { type IExecutionValidation } from '@types'
import { expect } from 'chai'

const NOW = 1_700_000_000
const untested: IExecutionValidation = {
  status: 'unsupported',
  reason: 'not in this test',
  simulationId: null,
  block: 1,
}
const says = (status: IExecutionValidation['status']): IExecutionValidation => ({
  status,
  reason: null,
  simulationId: null,
  block: 1,
})
const votes = (yes: string, no: string, abstain = '0') => ({
  totalVotes: 3,
  votesByOption: [
    { type: 2, totalVotingPower: yes },
    { type: 3, totalVotingPower: no },
    { type: 1, totalVotingPower: abstain },
  ],
})
const token = (overrides: Partial<IReadinessProposal> = {}): IReadinessProposal => ({
  startDate: NOW - 1000,
  endDate: NOW + 1000,
  executed: { status: false },
  settings: { votingMode: 0, supportThreshold: 500000, minParticipation: 150000 },
  snapshot: { totalSupply: '1000' },
  metrics: votes('0', '0'),
  ...overrides,
})

describe('proposalChecks/readiness', () => {
  it('reads a token vote through its phases: not started, open, passed and executable, or defeated', () => {
    const early = Readiness.evaluate(token({ startDate: NOW + 100 }), 'tokenVoting', NOW, untested)
    const open = Readiness.evaluate(token({ metrics: votes('600', '100') }), 'tokenVoting', NOW, untested)
    const passed = Readiness.evaluate(
      token({ endDate: NOW - 1, metrics: votes('600', '100') }),
      'tokenVoting',
      NOW,
      untested,
    )
    const defeated = Readiness.evaluate(
      token({ endDate: NOW - 1, metrics: votes('100', '600') }),
      'tokenVoting',
      NOW,
      untested,
    )

    expect(early).to.include({
      supported: true,
      executableNow: false,
      earliestExecution: NOW + 1000,
      nextBoundary: NOW + 100,
    })
    expect(early.remaining.map(r => r.id)).to.deep.eq(['voting-start', 'support', 'participation'])
    expect(open).to.include({ executableNow: false, earliestExecution: NOW + 1000, nextBoundary: NOW + 1000 })
    expect(open.remaining.map(r => r.id)).to.deep.eq(['voting-end'])
    expect(open.deadlines).to.deep.eq([{ id: 'voting-end', at: NOW + 1000, description: 'voting ends' }])
    expect(passed).to.include({ executableNow: true, earliestExecution: NOW - 1, outcome: null, nextBoundary: null })
    expect(passed.remaining).to.deep.eq([])
    expect(defeated).to.include({ executableNow: false, outcome: 'defeated' })
  })

  it('executes early only when no remaining vote could turn the outcome and participation is reached', () => {
    const settings = { votingMode: 1, supportThreshold: 500000, minParticipation: 150000 }
    const decided = Readiness.evaluate(token({ settings, metrics: votes('600', '100') }), 'tokenVoting', NOW, untested)
    const undecided = Readiness.evaluate(
      token({ settings, metrics: votes('400', '100') }),
      'tokenVoting',
      NOW,
      untested,
    )
    const noSupply = Readiness.evaluate(
      token({ settings, snapshot: null, metrics: votes('600', '100') }),
      'tokenVoting',
      NOW,
      untested,
    )

    expect(decided).to.include({ executableNow: true, earliestExecution: NOW })
    expect(undecided).to.include({ executableNow: false, earliestExecution: NOW + 1000 })
    expect(noSupply.executableNow).to.eq(false)
    expect(noSupply.limits[0]).to.contain('total voting power at the snapshot is not indexed')

    const endedWithoutSupply = Readiness.evaluate(
      token({ endDate: NOW - 1, snapshot: null, metrics: votes('600', '100') }),
      'tokenVoting',
      NOW,
      untested,
    )
    expect(endedWithoutSupply).to.include({ executableNow: null, outcome: null })
    expect(endedWithoutSupply.limits[endedWithoutSupply.limits.length - 1]).to.contain(
      'whether the vote passed is not known without the eligible supply',
    )
  })

  it('stands at the evidence block: a later execution does not count, and the tally the plugin held then replaces the index', () => {
    const laterExecuted = token({
      executed: { status: true, blockNumber: 500 },
      endDate: NOW - 1,
      metrics: votes('600', '100'),
    })
    const evidence = {
      block: 400,
      voting: {
        status: 'ok' as const,
        reason: null,
        block: 400,
        chain: {
          open: true,
          executed: false,
          votingMode: 0,
          supportThreshold: '500000',
          startDate: NOW - 1000,
          endDate: NOW - 1,
          snapshotBlock: 399,
          minVotingPower: '150',
          eligibleSupply: '1000',
          tally: { yes: '100', no: '600', abstain: '0' },
        },
        indexed: {
          votingMode: 0,
          supportThreshold: null,
          minParticipation: null,
          startDate: null,
          endDate: null,
          totalSupply: null,
          tally: null,
        },
      },
      stages: {
        status: 'unsupported' as const,
        reason: null,
        block: 400,
        chain: null,
        indexed: { stageIndex: null, lastStageTransition: null },
        stage: null,
        bodies: [],
      },
    }

    const atBlock = Readiness.evaluate(laterExecuted, 'tokenVoting', NOW, untested, evidence)
    const today = Readiness.evaluate(laterExecuted, 'tokenVoting', NOW, untested)

    expect(atBlock).to.include({ outcome: 'defeated', executableNow: false })
    expect(today).to.include({ outcome: 'executed' })
  })

  it('counts participation against the minimum the contract froze, not the ratio the index holds', () => {
    const chainVote = (minVotingPower: string) => ({
      block: 400,
      voting: {
        status: 'ok' as const,
        reason: null,
        block: 400,
        chain: {
          open: false,
          executed: false,
          votingMode: 0,
          supportThreshold: '500000',
          startDate: NOW - 1000,
          endDate: NOW - 1,
          snapshotBlock: 399,
          minVotingPower,
          eligibleSupply: '1000',
          tally: { yes: '600', no: '100', abstain: '0' },
        },
        indexed: {
          votingMode: 0,
          supportThreshold: null,
          minParticipation: null,
          startDate: null,
          endDate: null,
          totalSupply: null,
          tally: null,
        },
      },
      stages: {
        status: 'unsupported' as const,
        reason: null,
        block: 400,
        chain: null,
        indexed: { stageIndex: null, lastStageTransition: null },
        stage: null,
        bodies: [],
      },
    })
    // The index holds 15% of 1000, which 700 votes clear; the contract asked for 900.
    const ended = token({ endDate: NOW - 1, metrics: votes('600', '100') })

    const strict = Readiness.evaluate(ended, 'tokenVoting', NOW, untested, chainVote('900'))
    const met = Readiness.evaluate(ended, 'tokenVoting', NOW, untested, chainVote('700'))

    expect(strict).to.include({ outcome: 'defeated', executableNow: false })
    expect(strict.remaining.map(r => r.id)).to.deep.eq(['participation'])
    expect(met).to.include({ outcome: null, executableNow: true })
  })

  it('drops a defeat the plugin contradicts, instead of reporting both', () => {
    const defeated = Readiness.evaluate(
      token({ endDate: NOW - 1, metrics: votes('100', '600') }),
      'tokenVoting',
      NOW,
      says('executable'),
    )

    expect(defeated).to.include({ executableNow: true, outcome: null })
    expect(defeated.remaining).to.deep.eq([])
    expect(defeated.limits[defeated.limits.length - 1]).to.contain(
      'the plugin accepted execution although the indexed tally read as defeated',
    )
  })

  it('reads a multisig: approvals against the requirement, execution only inside the window, expiry after it', () => {
    const multisig = (approvals: number, overrides: Partial<IReadinessProposal> = {}): IReadinessProposal => ({
      startDate: NOW - 10,
      endDate: NOW + 500,
      executed: { status: false },
      settings: { minApprovals: 2 },
      metrics: { totalVotes: approvals, votesByOption: [] },
      ...overrides,
    })

    const short = Readiness.evaluate(multisig(1), 'multisig', NOW, untested)
    const ready = Readiness.evaluate(multisig(2), 'multisig', NOW, untested)
    const expired = Readiness.evaluate(multisig(2, { endDate: NOW - 1 }), 'multisig', NOW, untested)

    expect(short).to.include({ executableNow: false, earliestExecution: null, nextBoundary: NOW + 500 })
    expect(short.remaining).to.deep.eq([{ id: 'approvals', description: '1 of 2 approvals' }])
    expect(short.deadlines[0]).to.include({ id: 'expiry', at: NOW + 500 })
    expect(ready).to.include({ executableNow: true, earliestExecution: NOW })
    expect(expired).to.include({ executableNow: false, outcome: 'expired' })
  })

  it('reads a staged processor: the current stage window, its deadlines, the stages after it, and expiry past the latest advance', () => {
    const spp = (overrides: Partial<IReadinessProposal> = {}): IReadinessProposal => ({
      startDate: NOW - 100,
      executed: { status: false },
      settings: {
        stages: [
          { minAdvance: 200, maxAdvance: 1000, voteDuration: 500, plugins: [{}, {}] },
          { minAdvance: 0, maxAdvance: 3000, voteDuration: 600, plugins: [{}] },
        ],
      },
      stageIndex: 0,
      lastStageTransition: NOW - 100,
      ...overrides,
    })

    const first = Readiness.evaluate(spp(), 'spp', NOW, untested)
    const last = Readiness.evaluate(spp({ stageIndex: 1, lastStageTransition: NOW - 50 }), 'spp', NOW, untested)
    const expired = Readiness.evaluate(spp({ lastStageTransition: NOW - 2000 }), 'spp', NOW, untested)

    expect(first).to.include({ executableNow: null, earliestExecution: null, nextBoundary: NOW + 100 })
    expect(first.remaining.map(r => r.id)).to.deep.eq(['stage-1-results', 'stage-1-min-advance', 'stage-2'])
    expect(first.deadlines.map(d => [d.id, d.at])).to.deep.eq([
      ['stage-1-vote-end', NOW + 400],
      ['stage-1-max-advance', NOW + 900],
    ])
    expect(last).to.include({ earliestExecution: NOW - 50, nextBoundary: NOW + 550 })
    expect(last.remaining.map(r => r.id)).to.deep.eq(['stage-2-results'])
    expect(expired).to.include({ outcome: 'expired', executableNow: false })
  })

  it('takes terminal outcomes, the admin plugin, and unsupported or missing proposals as given', () => {
    expect(Readiness.evaluate(token({ executed: { status: true } }), 'tokenVoting', NOW, untested)).to.include({
      outcome: 'executed',
      executableNow: false,
    })
    expect(Readiness.evaluate(token({ cancelTxInfo: { blockNumber: 1 } }), 'tokenVoting', NOW, untested)).to.include({
      outcome: 'cancelled',
    })
    expect(Readiness.evaluate(token(), 'admin', NOW, untested)).to.include({ supported: true, executableNow: true })
    expect(Readiness.evaluate(token(), 'gauge', NOW, untested)).to.include({ supported: false, executableNow: null })
    expect(Readiness.evaluate(null, 'tokenVoting', NOW, untested).limits).to.deep.eq(['the proposal is not indexed'])
  })

  it("lets the plugin's own answer at the block override the arithmetic in both directions", () => {
    const passedButRefused = Readiness.evaluate(
      token({ endDate: NOW - 1, metrics: votes('600', '100') }),
      'tokenVoting',
      NOW,
      says('notYet'),
    )
    const openButAllowed = Readiness.evaluate(
      token({ metrics: votes('0', '0') }),
      'tokenVoting',
      NOW,
      says('executable'),
    )

    const passedButReverted = Readiness.evaluate(
      token({ endDate: NOW - 1, metrics: votes('600', '100') }),
      'tokenVoting',
      NOW,
      { ...says('reverted'), reason: 'boom' },
    )
    expect(passedButReverted.executableNow).to.eq(false)
    expect(passedButReverted.limits[passedButReverted.limits.length - 1]).to.contain(
      'the execution test reverted at the block: boom',
    )
    expect(passedButRefused.executableNow).to.eq(false)
    expect(passedButRefused.limits[passedButRefused.limits.length - 1]).to.contain(
      'the plugin refused execution at the block',
    )
    expect(openButAllowed).to.include({ executableNow: true })
    expect(openButAllowed.remaining).to.deep.eq([])
  })

  it('says which dates, settings or stages are not indexed instead of guessing', () => {
    const noDates = Readiness.evaluate(
      token({ startDate: undefined, endDate: undefined }),
      'tokenVoting',
      NOW,
      untested,
    )
    const noParticipation = Readiness.evaluate(
      token({ settings: { votingMode: 0, supportThreshold: 500000 } }),
      'tokenVoting',
      NOW,
      untested,
    )
    const lockNoSettings = Readiness.evaluate(token({ settings: null }), 'lockToVote', NOW, untested)
    const multisigNoSettings = Readiness.evaluate(token({ settings: null }), 'multisig', NOW, untested)
    const sppNoStages = Readiness.evaluate(token({ settings: null }), 'spp', NOW, untested)
    const sppNoStart = Readiness.evaluate(
      token({ startDate: undefined, settings: { stages: [{ minAdvance: 0 }] } }),
      'spp',
      NOW,
      untested,
    )
    const unknownPlugin = Readiness.evaluate(token(), null, NOW, untested)

    expect(noDates).to.include({ supported: true, executableNow: null })
    expect(noDates.limits).to.deep.eq(['voting dates or settings are not indexed'])
    expect(noParticipation.limits).to.deep.eq(['voting dates or settings are not indexed'])
    expect(lockNoSettings.limits).to.deep.eq([
      'locked voting power can grow while the vote is open, so the tally below can move',
      'voting dates or settings are not indexed',
    ])
    expect(multisigNoSettings.limits).to.deep.eq(['dates or the required approvals are not indexed'])
    expect(sppNoStages.limits).to.deep.eq(['the stages of this proposal are not indexed'])
    expect(sppNoStart.limits).to.deep.eq(['the start of the current stage is not indexed'])
    expect(unknownPlugin).to.include({ plugin: 'unknown', supported: false })
    expect(unknownPlugin.limits).to.deep.eq(['no readiness adapter for plugin type unknown'])
  })

  it('waits for a multisig window to open and says when the approvals so far are not indexed', () => {
    const notOpen = Readiness.evaluate(
      {
        startDate: NOW + 100,
        endDate: NOW + 500,
        executed: { status: false },
        settings: { minApprovals: 2 },
        metrics: null,
      },
      'multisig',
      NOW,
      untested,
    )

    expect(notOpen).to.include({ executableNow: false, earliestExecution: null, nextBoundary: NOW + 100 })
    expect(notOpen.remaining).to.deep.eq([
      { id: 'voting-start', description: 'the approval window has not opened' },
      { id: 'approvals', description: 'unknown of 2 approvals' },
    ])
    expect(notOpen.limits).to.include('approvals so far are not indexed')
  })

  it('reads a stage with no vote end and no latest advance as open with no deadline', () => {
    const open = Readiness.evaluate(
      { startDate: NOW - 100, executed: { status: false }, settings: { stages: [{}] } },
      'spp',
      NOW,
      untested,
    )

    expect(open).to.include({ executableNow: null, earliestExecution: NOW - 100, nextBoundary: null })
    expect(open.remaining).to.deep.eq([
      { id: 'stage-1-results', description: 'the 0 bodies of stage 1 have to report' },
    ])
    expect(open.deadlines).to.deep.eq([])
  })

  it('takes the stage, execution and cancellation the processor held at the block over the index', () => {
    const spp: IReadinessProposal = {
      startDate: NOW - 100,
      executed: { status: true, blockNumber: 500 },
      settings: {
        stages: [
          { minAdvance: 0, maxAdvance: 1000, plugins: [{}] },
          { minAdvance: 0, maxAdvance: 1000, plugins: [{}, {}] },
        ],
      },
      stageIndex: 0,
      lastStageTransition: NOW - 100,
    }
    const atBlock = (canceled: boolean) => ({
      block: 400,
      voting: {
        status: 'unsupported' as const,
        reason: null,
        block: 400,
        chain: null,
        indexed: {
          votingMode: null,
          supportThreshold: null,
          minParticipation: null,
          startDate: null,
          endDate: null,
          totalSupply: null,
          tally: null,
        },
      },
      stages: {
        status: 'ok' as const,
        reason: null,
        block: 400,
        chain: {
          currentStage: 1,
          lastStageTransition: NOW - 50,
          executed: false,
          canceled,
          approvals: '0',
          vetoes: '0',
        },
        indexed: { stageIndex: 0, lastStageTransition: NOW - 100 },
        stage: null,
        bodies: [],
      },
    })

    const second = Readiness.evaluate(spp, 'spp', NOW, untested, atBlock(false))
    const canceled = Readiness.evaluate(spp, 'spp', NOW, untested, atBlock(true))

    expect(second).to.include({ outcome: null, earliestExecution: NOW - 50, nextBoundary: NOW + 950 })
    expect(second.remaining.map(r => r.id)).to.deep.eq(['stage-2-results'])
    expect(canceled).to.include({ outcome: 'cancelled', executableNow: false })
  })

  it('does not count a cancellation after the block, and reads a chain vote with no eligible supply', () => {
    const cancelledLater = token({
      cancelTxInfo: { blockNumber: 500 },
      settings: null,
      endDate: NOW - 1,
      metrics: votes('600', '100'),
    })
    const evidence = {
      block: 400,
      voting: {
        status: 'ok' as const,
        reason: null,
        block: 400,
        chain: {
          open: false,
          executed: false,
          votingMode: 0,
          supportThreshold: '500000',
          startDate: NOW - 1000,
          endDate: NOW - 1,
          snapshotBlock: 399,
          minVotingPower: '150',
          eligibleSupply: null,
          tally: { yes: '600', no: '100', abstain: '0' },
        },
        indexed: {
          votingMode: 0,
          supportThreshold: null,
          minParticipation: null,
          startDate: null,
          endDate: null,
          totalSupply: null,
          tally: null,
        },
      },
      stages: {
        status: 'unsupported' as const,
        reason: null,
        block: 400,
        chain: null,
        indexed: { stageIndex: null, lastStageTransition: null },
        stage: null,
        bodies: [],
      },
    }

    const atBlock = Readiness.evaluate(cancelledLater, 'tokenVoting', NOW, untested, evidence)
    const today = Readiness.evaluate(cancelledLater, 'tokenVoting', NOW, untested)

    expect(atBlock).to.include({ outcome: null, executableNow: true, earliestExecution: NOW - 1 })
    expect(today).to.include({ outcome: 'cancelled' })
  })

  it('says no reason was given when the execution test reverts without one', () => {
    const reverted = Readiness.evaluate(token(), 'tokenVoting', NOW, says('reverted'))

    expect(reverted.executableNow).to.eq(false)
    expect(reverted.limits[reverted.limits.length - 1]).to.eq(
      'the execution test reverted at the block: no reason given',
    )
  })
})
