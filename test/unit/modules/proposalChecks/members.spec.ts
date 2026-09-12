import { Models } from '@dbModels'
import BottleneckModule from '@modules/bottleneck'
import MembersCheck from '@modules/proposalChecks/checks/voting/members'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import MembershipFacts from '@modules/proposalChecks/members'
import RecipientResolver from '@modules/proposalChecks/recipients'
import ProviderModule from '@modules/provider'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { ProposalList } from '@test/mock/fakeProposal'
import { fakeSettings } from '@test/mock/fakeSettings'
import {
  type IAssessmentContext,
  IAssessmentFindingKind,
  IAssessmentSeverity,
  type IMembershipFacts,
  type IResolvedAddress,
} from '@types'
import { expect } from 'chai'
import { AbiCoder, Interface } from 'ethers'
import sinon from 'sinon'

const DAO = '0xaFe8123417B112B352B356F0eA50becC471Ed853'
const MULTISIG = fakeSettings.pluginAddress
const SAFE = '0x2222222222222222222222222222222222222222'
const A = '0x1111111111111111111111111111111111111111'
const B = '0x3333333333333333333333333333333333333333'
const C = '0x4444444444444444444444444444444444444444'
const SENTINEL = '0x0000000000000000000000000000000000000001'
const iface = new Interface([
  'function addAddresses(address[])',
  'function removeAddresses(address[])',
  'function addOwnerWithThreshold(address,uint256)',
  'function removeOwner(address,address,uint256)',
  'function swapOwner(address,address,address)',
  'function changeThreshold(uint256)',
  'function updateMultisigSettings((bool,uint16))',
])
const call = (to: string, fn: string, args: any[]) => ({ to, value: '0', data: iface.encodeFunctionData(fn, args) })
const facts = (overrides: Partial<IMembershipFacts> = {}): IMembershipFacts => ({
  kind: 'multisig',
  count: 3,
  threshold: 2,
  listed: { [A.toLowerCase()]: true, [B.toLowerCase()]: true, [C.toLowerCase()]: false },
  openProposals: [],
  ...overrides,
})
const ctxWith = (rawActions: any[], overrides: Partial<IAssessmentContext> = {}): IAssessmentContext => {
  const base = fakeAssessmentContext()
  return {
    ...base,
    request: { ...base.request, daoAddress: DAO },
    actions: AssessmentContextBuilder._flatten(rawActions, DAO),
    plugins: [{ address: MULTISIG, interfaceType: 'multisig', isSubPlugin: false }],
    memberships: { [MULTISIG.toLowerCase()]: facts(), [SAFE.toLowerCase()]: facts({ kind: 'safe' }) },
    ...overrides,
  }
}
const grades = (ctx: IAssessmentContext) => MembersCheck.run(ctx).findings.map(f => [f.id, f.kind, f.severity ?? null])

describe('proposalChecks/members', () => {
  const sandbox = sinon.createSandbox()
  afterEach(() => sandbox.restore())

  it('reads the address-list and Safe member calls into one shape and lists incoming members as beneficiaries', () => {
    const actions = AssessmentContextBuilder._flatten(
      [
        call(MULTISIG, 'addAddresses', [[A, B]]),
        call(MULTISIG, 'removeAddresses', [[C]]),
        call(SAFE, 'addOwnerWithThreshold', [A, 2]),
        call(SAFE, 'removeOwner', [SENTINEL, B, 1]),
        call(SAFE, 'swapOwner', [SENTINEL, B, C]),
        call(SAFE, 'changeThreshold', [3]),
        call(MULTISIG, 'updateMultisigSettings', [[true, 4]]),
      ],
      DAO,
    )

    expect(
      actions
        .map(a => MembershipFacts.callOf(a)!)
        .map(c => [c.kind, c.members, c.newMember, c.threshold, c.safe, c.settingsOnly]),
    ).to.deep.eq([
      ['add', [A, B], null, null, false, false],
      ['remove', [C], null, null, false, false],
      ['add', [A], null, '2', true, false],
      ['remove', [B], null, '1', true, false],
      ['swap', [B], C, null, true, false],
      ['threshold', [], null, '3', true, false],
      ['threshold', [], null, '4', false, true],
    ])
    expect(RecipientResolver.beneficiaries(actions)).to.deep.eq([A, B, C])
  })

  it('reads an address list at the block: count, each touched address, the indexed approvals and the open proposals', async () => {
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: () => Promise<unknown>) => fn() } as any)
    const coder = AbiCoder.defaultAbiCoder()
    const provider = {
      call: sandbox
        .stub()
        .callsFake(async (tx: { data: string }) =>
          tx.data.startsWith(iface.getFunction('addAddresses')!.selector)
            ? '0x'
            : tx.data.length === 10 + 64
              ? coder.encode(['uint256'], [3])
              : coder.encode(['bool'], [tx.data.includes(A.slice(2).toLowerCase())]),
        ),
      getNetwork: async () => ({ chainId: 1n }),
      resolveName: async (n: string) => n,
    }
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(provider as any)
    await Models.Setting.create({ ...fakeSettings, blockNumber: 50, minApprovals: 2 })
    const open = await Models.Proposal.create({ ...ProposalList[0], pluginAddress: MULTISIG, endDate: 2_000_000_000 })
    const actions = AssessmentContextBuilder._flatten([call(MULTISIG, 'removeAddresses', [[A, C]])], DAO)

    const loaded = await MembershipFacts.load(actions, fakeSettings.network, {
      number: 100,
      hash: null,
      time: 1_900_000_000,
    })

    expect(loaded[MULTISIG.toLowerCase()]).to.deep.eq({
      kind: 'multisig',
      count: 3,
      threshold: 2,
      listed: { [A.toLowerCase()]: true, [C.toLowerCase()]: false },
      openProposals: [open.id],
    })
    expect(provider.call.args.every(a => a[0].blockTag === 100)).to.be.true
  })

  it('reads a Safe at the block through its owners and threshold', async () => {
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: () => Promise<unknown>) => fn() } as any)
    const coder = AbiCoder.defaultAbiCoder()
    const provider = {
      call: sandbox
        .stub()
        .callsFake(async (tx: { data: string }) =>
          tx.data.startsWith('0xa0e67e2b') ? coder.encode(['address[]'], [[A, B]]) : coder.encode(['uint256'], [2]),
        ),
      getNetwork: async () => ({ chainId: 1n }),
      resolveName: async (n: string) => n,
    }
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(provider as any)
    const actions = AssessmentContextBuilder._flatten([call(SAFE, 'removeOwner', [SENTINEL, B, 1])], DAO)

    const loaded = await MembershipFacts.load(actions, fakeSettings.network, { number: 100, hash: null, time: 1 })

    expect(loaded[SAFE.toLowerCase()]).to.deep.eq({
      kind: 'safe',
      count: 2,
      threshold: 2,
      listed: { [B.toLowerCase()]: true },
      openProposals: [],
    })
  })
})

describe('proposalChecks/checks/voting/members', () => {
  it('reports each member change, says who was not a member, and lists the open proposals a removed member can still approve', () => {
    const ctx = ctxWith([call(MULTISIG, 'addAddresses', [[C, A]]), call(MULTISIG, 'removeAddresses', [[B, C]])], {
      memberships: { [MULTISIG.toLowerCase()]: facts({ openProposals: ['p-1', 'p-2'] }) },
    })

    const { findings } = MembersCheck.run(ctx)

    expect(grades(ctx)).to.deep.eq([
      ['voting/members:add:0', IAssessmentFindingKind.Change, null],
      ['voting/members:remove:1', IAssessmentFindingKind.Change, null],
    ])
    expect(findings[0].title).to.eq(`Adds ${C}, ${A} to the multisig plugin ${MULTISIG}`)
    expect(findings[0].details).to.include(`${A} is already a member`)
    expect(findings[1].details).to.include('a removed member can still approve the proposals already open: p-1, p-2')
    expect(findings.every(f => f.notify)).to.be.true
  })

  it('flags a removal the plugin refuses, and the outcome when nobody can reach the threshold or one signer decides alone', () => {
    const refused = ctxWith([call(MULTISIG, 'removeAddresses', [[A, B]])])
    const ordered = ctxWith([
      call(MULTISIG, 'updateMultisigSettings', [[true, 1]]),
      call(MULTISIG, 'removeAddresses', [[A, B]]),
    ])
    const unreachable = ctxWith([call(SAFE, 'changeThreshold', [5])])

    const [removal, outcome] = MembersCheck.run(refused).findings
    const orderedFindings = MembersCheck.run(ordered).findings
    const [threshold, safeOutcome] = MembersCheck.run(unreachable).findings

    expect(removal.details).to.include(
      'this removal leaves 1 members for 2 required approvals; the plugin refuses it unless the threshold is lowered first',
    )
    expect([outcome.kind, outcome.severity]).to.deep.eq([IAssessmentFindingKind.Risk, IAssessmentSeverity.High])
    expect(outcome.title).to.eq(`Leaves the multisig plugin ${MULTISIG} unable to approve anything`)
    expect(orderedFindings.map(f => f.id)).to.deep.eq([
      'voting/members:remove:1',
      `voting/members:outcome:${MULTISIG.toLowerCase()}`,
    ])
    expect(orderedFindings[0].details).to.not.include.members(['refuses'])
    expect(orderedFindings[1].title).to.contain('a single signer able to act')
    expect(threshold.details).to.include('sets 5 required signatures for 3 owners; the Safe refuses it')
    expect(safeOutcome.title).to.eq(`Leaves Safe ${SAFE} unable to approve anything`)
  })

  it('tags a new member that is an unverified contract, and says when the membership at the block was not read', () => {
    const unverified: IResolvedAddress = {
      address: C,
      kind: 'contract',
      verified: false,
      contractName: null,
      deployedAtBlock: null,
      deployedAt: null,
      deployer: null,
      deployedByCreator: null,
      recentlyDeployed: null,
    }
    const ctx = ctxWith([call(SAFE, 'swapOwner', [SENTINEL, B, C])], {
      recipients: { [C.toLowerCase()]: unverified },
      memberships: {},
    })

    const [finding] = MembersCheck.run(ctx).findings

    expect(finding.kind).to.eq(IAssessmentFindingKind.NeedsReview)
    expect(finding.title).to.eq(`Replaces ${B} with ${C} on ${SAFE}`)
    expect(finding.details[0]).to.contain(`new member ${C} is a contract with no verified source`)
    expect(finding.evidenceLimit).to.contain('membership at the evidence block not read')
    expect(MembersCheck.run(ctx).findings).to.have.length(1)
  })

  it('leaves a settings-only threshold move to the settings rule but folds it, and is not applicable without actions', () => {
    const ctx = ctxWith([
      call(MULTISIG, 'updateMultisigSettings', [[true, 3]]),
      call(MULTISIG, 'removeAddresses', [[A]]),
    ])

    const { findings } = MembersCheck.run(ctx)

    expect(findings.map(f => f.id)).to.deep.eq([
      'voting/members:remove:1',
      `voting/members:outcome:${MULTISIG.toLowerCase()}`,
    ])
    expect(findings[0].details[0]).to.contain('leaves 2 members for 3 required approvals')
    expect(MembersCheck.run(ctxWith([])).status).to.eq('notApplicable')
  })
})
