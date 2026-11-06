import BottleneckModule from '@modules/bottleneck'
import StagesValidationCheck from '@modules/proposalChecks/checks/validation/stages'
import VotingValidationCheck from '@modules/proposalChecks/checks/validation/voting'
import ProviderModule from '@modules/provider'
import VotingEvidence from '@modules/proposalChecks/votingEvidence'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { fakeProposalAssessment } from '@test/mock/fakeProposalAssessment'
import { type IAssessmentContext, IAssessmentCheckStatus, type IStageEvidence, type IVotingEvidence } from '@types'
import { expect } from 'chai'
import { AbiCoder, Interface } from 'ethers'
import sinon from 'sinon'

const BODY_A = '0x1111111111111111111111111111111111111111'
const BODY_B = '0x2222222222222222222222222222222222222222'
const tokenVoting = new Interface([
  'function getProposal(uint256) view returns (bool open, bool executed, (uint8 votingMode, uint32 supportThreshold, uint64 startDate, uint64 endDate, uint64 snapshotBlock, uint256 minVotingPower) parameters, (uint256 abstain, uint256 yes, uint256 no) tally, (address to, uint256 value, bytes data)[] actions, uint256 allowFailureMap)',
  'function totalVotingPower(uint256) view returns (uint256)',
])
const staged = new Interface([
  'function getProposal(uint256) view returns ((uint128 allowFailureMap, uint64 lastStageTransition, uint16 currentStage, uint16 stageConfigIndex, bool executed, bool canceled, address creator, (address to, uint256 value, bytes data)[] actions, (address target, uint8 operation) targetConfig))',
  'function getBodyProposalId(uint256,uint16,address) view returns (uint256)',
  'function getBodyResult(uint256,uint16,address) view returns (uint8)',
  'function getProposalTally(uint256,uint16) view returns (uint256 approvals, uint256 vetoes)',
])
const coder = AbiCoder.defaultAbiCoder()
const indexed = {
  startDate: 100,
  endDate: 200,
  settings: { votingMode: 1, supportThreshold: 500000, minParticipation: 150000 },
  snapshot: { totalSupply: '1000' },
  metrics: {
    votesByOption: [
      { type: 2, totalVotingPower: '600' },
      { type: 3, totalVotingPower: '100' },
    ],
  },
}
const chainVote = (
  overrides: Partial<NonNullable<IVotingEvidence['chain']>> = {},
): NonNullable<IVotingEvidence['chain']> => ({
  open: true,
  executed: false,
  votingMode: 1,
  supportThreshold: '500000',
  startDate: 100,
  endDate: 200,
  snapshotBlock: 99,
  minVotingPower: '135',
  eligibleSupply: '900',
  tally: { yes: '600', no: '100', abstain: '0' },
  ...overrides,
})
const votingCtx = (evidence: Partial<IVotingEvidence>): IAssessmentContext => {
  const base = fakeAssessmentContext()
  return {
    ...base,
    votingEvidence: {
      status: 'ok',
      reason: null,
      block: 150,
      chain: chainVote(),
      indexed: {
        votingMode: 1,
        supportThreshold: '500000',
        minParticipation: '150000',
        startDate: 100,
        endDate: 200,
        totalSupply: '900',
        tally: { yes: '600', no: '100', abstain: '0' },
      },
      ...evidence,
    },
  }
}
const stageCtx = (evidence: Partial<IStageEvidence>): IAssessmentContext => {
  const base = fakeAssessmentContext()
  return {
    ...base,
    stageEvidence: {
      status: 'ok',
      reason: null,
      block: 150,
      chain: {
        currentStage: 1,
        lastStageTransition: 120,
        executed: false,
        canceled: false,
        approvals: '1',
        vetoes: '0',
      },
      indexed: { stageIndex: 1, lastStageTransition: 120 },
      stage: { approvalThreshold: '1', vetoThreshold: '1' },
      bodies: [
        {
          body: BODY_A,
          isManual: false,
          chainChildId: '7',
          chainResult: 'approval',
          indexedChildIndex: '7',
          indexedResult: 'approval',
        },
        {
          body: BODY_B,
          isManual: false,
          chainChildId: '8',
          chainResult: 'none',
          indexedChildIndex: '8',
          indexedResult: null,
        },
      ],
      ...evidence,
    },
  }
}

describe('proposalChecks/votingEvidence', () => {
  const sandbox = sinon.createSandbox()
  afterEach(() => sandbox.restore())
  const request = fakeProposalAssessment()

  it('reads a token vote and its eligible supply at the snapshot from the plugin at the evidence block', async () => {
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: () => Promise<unknown>) => fn() } as any)
    const provider = {
      call: sandbox
        .stub()
        .callsFake(async (tx: { data: string }) =>
          tx.data.startsWith(tokenVoting.getFunction('totalVotingPower')!.selector)
            ? coder.encode(['uint256'], [900])
            : tokenVoting.encodeFunctionResult('getProposal', [
                true,
                false,
                [1, 500000, 100, 200, 99, 135],
                [0, 600, 100],
                [],
                0,
              ]),
        ),
      getNetwork: async () => ({ chainId: 1n }),
      resolveName: async (n: string) => n,
    }
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(provider as any)

    const evidence = await VotingEvidence.voting(request, indexed, 'tokenVoting', '0')

    expect(evidence.status).to.eq('ok')
    expect(evidence.chain).to.deep.eq(chainVote())
    expect(evidence.indexed).to.deep.eq({
      votingMode: 1,
      supportThreshold: '500000',
      minParticipation: '150000',
      startDate: 100,
      endDate: 200,
      totalSupply: '1000',
      tally: { yes: '600', no: '100', abstain: '0' },
    })
    expect(provider.call.args.every(a => a[0].blockTag === request.captured.evidenceBlock.number)).to.be.true
  })

  it('reads a staged proposal with the child and the reported result of every body of its current stage', async () => {
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: () => Promise<unknown>) => fn() } as any)
    const sel = (name: string) => staged.getFunction(name)!.selector
    const provider = {
      call: sandbox.stub().callsFake(async (tx: { data: string }) => {
        if (tx.data.startsWith(sel('getProposal')))
          return staged.encodeFunctionResult('getProposal', [[0, 120, 1, 0, false, false, BODY_A, [], [BODY_A, 0]]])
        if (tx.data.startsWith(sel('getProposalTally'))) return coder.encode(['uint256', 'uint256'], [1, 0])
        if (tx.data.startsWith(sel('getBodyProposalId')))
          return coder.encode(['uint256'], [tx.data.includes(BODY_A.slice(2).toLowerCase()) ? 7 : 0])
        return coder.encode(['uint8'], [tx.data.includes(BODY_A.slice(2).toLowerCase()) ? 1 : 0])
      }),
      getNetwork: async () => ({ chainId: 1n }),
      resolveName: async (n: string) => n,
    }
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(provider as any)
    const proposal = {
      stageIndex: 1,
      lastStageTransition: 120,
      settings: {
        stages: [
          { plugins: [] },
          {
            approvalThreshold: 1,
            vetoThreshold: 1,
            plugins: [{ address: BODY_A }, { address: BODY_B, isManual: true }],
          },
        ],
      },
      subProposals: [{ pluginAddress: BODY_A, proposalIndex: '7', stageIndex: 1 }],
      results: [{ pluginAddress: BODY_A, resultType: 1, stage: 1 }],
    }

    const evidence = await VotingEvidence.stages(request, proposal, 'spp', '3')

    expect(evidence.status, evidence.reason ?? '').to.eq('ok')
    expect(evidence.chain).to.deep.eq({
      currentStage: 1,
      lastStageTransition: 120,
      executed: false,
      canceled: false,
      approvals: '1',
      vetoes: '0',
    })
    expect(evidence.stage).to.deep.eq({ approvalThreshold: '1', vetoThreshold: '1' })
    expect(evidence.bodies).to.deep.eq([
      {
        body: BODY_A,
        isManual: false,
        chainChildId: '7',
        chainResult: 'approval',
        indexedChildIndex: '7',
        indexedResult: 'approval',
      },
      {
        body: BODY_B,
        isManual: true,
        chainChildId: null,
        chainResult: 'none',
        indexedChildIndex: null,
        indexedResult: null,
      },
    ])
  })

  it('says so for a plugin it does not read, and reports a failed read as such', async () => {
    const other = await VotingEvidence.voting(request, indexed, 'multisig', '0')
    expect(other.status).to.eq('unsupported')
    expect(other.reason).to.contain('token voting only')
    expect((await VotingEvidence.stages(request, null, 'tokenVoting', '0')).status).to.eq('unsupported')

    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: () => Promise<unknown>) => fn() } as any)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      call: sandbox.stub().rejects(new Error('archive node down')),
      getNetwork: async () => ({ chainId: 1n }),
      resolveName: async (n: string) => n,
    } as any)
    const failed = await VotingEvidence.voting(request, indexed, 'tokenVoting', '0')
    expect(failed.status).to.eq('failed')
    expect(failed.reason).to.contain('archive node down')
  })
})

describe('proposalChecks/checks/validation/voting', () => {
  it('is ok when tally and eligible supply reconcile, noting other differences on the dashboard only', () => {
    const result = VotingValidationCheck.run(
      votingCtx({
        indexed: {
          votingMode: 1,
          supportThreshold: '500000',
          minParticipation: '150000',
          startDate: 100,
          endDate: 200,
          totalSupply: '1000',
          tally: { yes: '600', no: '100', abstain: '0' },
        },
      }),
    )

    expect(result.status).to.eq(IAssessmentCheckStatus.Ok)
    expect(result.reason).to.contain('reconciled at block 150, snapshot block 99, 1 indexed value(s) differ')
    expect(result.findings).to.have.length(1)
    expect(result.findings[0].notify).to.be.false
    expect(result.findings[0].details[0]).to.contain(
      'total supply of 1000; the eligible voting supply at snapshot block 99 is 900',
    )
  })

  it('needs review when the tally disagrees or the eligible supply could not be read', () => {
    const tally = VotingValidationCheck.run(
      votingCtx({ chain: chainVote({ tally: { yes: '650', no: '100', abstain: '0' } }) }),
    )
    const supply = VotingValidationCheck.run(votingCtx({ chain: chainVote({ eligibleSupply: null }) }))

    expect(tally.status).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(tally.reason).to.contain('tally differs: chain yes 650')
    expect(supply.status).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(supply.reason).to.contain('eligible supply at snapshot block 99 could not be read')
  })

  it('notes a frozen minimum voting power that does not follow from the indexed participation setting', () => {
    const result = VotingValidationCheck.run(votingCtx({ chain: chainVote({ minVotingPower: '200' }) }))

    expect(result.status).to.eq(IAssessmentCheckStatus.Ok)
    expect(result.findings[0].details[0]).to.contain(
      'minimum voting power frozen into the proposal is 200, the indexed participation setting over the eligible supply gives 135',
    )
  })

  it('is not applicable for plugins it does not read and needs review when the read failed', () => {
    expect(
      VotingValidationCheck.run(votingCtx({ status: 'unsupported', reason: 'multisig', chain: null })).status,
    ).to.eq(IAssessmentCheckStatus.NotApplicable)
    expect(VotingValidationCheck.run(votingCtx({ status: 'failed', reason: 'down', chain: null })).status).to.eq(
      IAssessmentCheckStatus.NeedsReview,
    )
  })
})

describe('proposalChecks/checks/validation/stages', () => {
  it('is ok when the stage, children and results match, counting the bodies still to report', () => {
    const result = StagesValidationCheck.run(stageCtx({}))

    expect(result.status).to.eq(IAssessmentCheckStatus.Ok)
    expect(result.reason).to.eq(
      'stage 2 verified at block 150: 1 approvals and 0 vetoes against 1 needed and 1 to veto, 1 of 2 bodies still to report',
    )
    expect(result.findings).to.deep.eq([])
  })

  it('needs review for a missing child, a child known under another id, a differing result, or a stage the index disagrees on', () => {
    const missing = StagesValidationCheck.run(
      stageCtx({
        bodies: [
          {
            body: BODY_A,
            isManual: false,
            chainChildId: null,
            chainResult: 'none',
            indexedChildIndex: null,
            indexedResult: null,
          },
        ],
      }),
    )
    const otherId = StagesValidationCheck.run(
      stageCtx({
        bodies: [
          {
            body: BODY_A,
            isManual: false,
            chainChildId: '7',
            chainResult: 'none',
            indexedChildIndex: '9',
            indexedResult: null,
          },
        ],
      }),
    )
    const differs = StagesValidationCheck.run(
      stageCtx({
        bodies: [
          {
            body: BODY_A,
            isManual: false,
            chainChildId: '7',
            chainResult: 'veto',
            indexedChildIndex: '7',
            indexedResult: 'approval',
          },
        ],
      }),
    )
    const stage = StagesValidationCheck.run(stageCtx({ indexed: { stageIndex: 0, lastStageTransition: 120 } }))

    expect(missing.reason).to.contain(`body ${BODY_A} has no child proposal for stage 2`)
    expect(otherId.reason).to.contain('is 7 on chain but 9 in the index')
    expect(differs.reason).to.contain('reported veto on chain, the index holds approval')
    expect(stage.reason).to.contain('the processor is in stage 2, the index says stage 1')
    expect([missing, otherId, differs, stage].every(r => r.status === IAssessmentCheckStatus.NeedsReview)).to.be.true
  })

  it('leaves a manual body without a child alone, and notes a result the index has not recorded yet', () => {
    const result = StagesValidationCheck.run(
      stageCtx({
        bodies: [
          {
            body: BODY_B,
            isManual: true,
            chainChildId: null,
            chainResult: 'approval',
            indexedChildIndex: null,
            indexedResult: null,
          },
        ],
      }),
    )

    expect(result.status).to.eq(IAssessmentCheckStatus.Ok)
    expect(result.findings[0].details[0]).to.contain(
      'has reported approval on chain; the index has not recorded it yet',
    )
    expect(result.findings[0].notify).to.be.false
  })
})
