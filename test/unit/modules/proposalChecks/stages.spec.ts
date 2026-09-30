import { Models } from '@dbModels'
import ComponentsCheck from '@modules/proposalChecks/checks/control/components'
import OwnershipCheck from '@modules/proposalChecks/checks/control/ownership'
import PermissionsCheck from '@modules/proposalChecks/checks/control/permissions'
import StagesCheck from '@modules/proposalChecks/checks/voting/stages'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import PermissionState from '@modules/proposalChecks/permissions'
import StagesFacts from '@modules/proposalChecks/stages'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { fakeSettings } from '@test/mock/fakeSettings'
import { type IAssessmentContext, IAssessmentFindingKind, IAssessmentSeverity, type IStageConfig } from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'

const network = fakeSettings.network
const DAO = '0xaFe8123417B112B352B356F0eA50becC471Ed853'
const SPP = '0x1111111111111111111111111111111111111111'
const VOTING = '0x2222222222222222222222222222222222222222'
const VETO_A = '0x3333333333333333333333333333333333333333'
const VETO_B = '0x4444444444444444444444444444444444444444'
const DELAY = '0x5555555555555555555555555555555555555555'
const VAULT = '0x6666666666666666666666666666666666666666'
const ZERO = '0x0000000000000000000000000000000000000000'
const iface = new Interface([
  'function updateStages(((address,bool,bool,uint8)[],uint64,uint64,uint64,uint16,uint16,bool,bool)[])',
  'function setTxCooldown(uint256)',
  'function setGuardian(address)',
  'function revoke(address,address,bytes32)',
])
const stage = (bodies: string[], overrides: Partial<IStageConfig> = {}): IStageConfig => ({
  bodies,
  minAdvance: '0',
  maxAdvance: '604800',
  voteDuration: '259200',
  approvalThreshold: '1',
  vetoThreshold: '0',
  cancelable: false,
  editable: false,
  ...overrides,
})
const encode = (stages: IStageConfig[]) =>
  iface.encodeFunctionData('updateStages', [
    stages.map(s => [
      s.bodies.map(b => [b, false, true, 0]),
      s.maxAdvance,
      s.minAdvance,
      s.voteDuration,
      s.approvalThreshold,
      s.vetoThreshold,
      s.cancelable,
      s.editable,
    ]),
  ])
const update = (stages: IStageConfig[]) => ({ to: SPP, value: '0', data: encode(stages) })
const before = [stage([VOTING]), stage([VETO_A, VETO_B], { vetoThreshold: '1', cancelable: true })]
const ctxWith = (rawActions: any[], overrides: Partial<IAssessmentContext> = {}): IAssessmentContext => {
  const base = fakeAssessmentContext()
  return {
    ...base,
    request: { ...base.request, daoAddress: DAO },
    actions: AssessmentContextBuilder._flatten(rawActions, DAO),
    plugins: [{ address: SPP, interfaceType: 'spp', isSubPlugin: false }],
    stages: { '0': { before } },
    ...overrides,
  }
}

describe('proposalChecks/stages', () => {
  it('reads the proposed stages and the indexed stages at the block into the same shape', async () => {
    await Models.Setting.create({
      ...fakeSettings,
      pluginAddress: SPP,
      blockNumber: 50,
      stages: [
        {
          stageIndex: 0,
          plugins: [{ address: VOTING }],
          minAdvance: 0,
          maxAdvance: 604800,
          voteDuration: 259200,
          approvalThreshold: 1,
          vetoThreshold: 0,
          cancelable: false,
          editable: false,
        },
        {
          stageIndex: 1,
          plugins: [{ address: VETO_A }, { address: VETO_B }],
          minAdvance: 0,
          maxAdvance: 604800,
          voteDuration: 259200,
          approvalThreshold: 1,
          vetoThreshold: 1,
          cancelable: true,
          editable: false,
        },
      ],
    } as any)
    const actions = AssessmentContextBuilder._flatten([update([stage([VOTING])])], DAO)

    const proposed = StagesFacts.callOf(actions[0])
    const loaded = await StagesFacts.load(actions, network, 100)

    expect(proposed).to.deep.eq([stage([VOTING])])
    expect(loaded['0'].before).to.deep.eq(before)
    expect((await StagesFacts.load(actions, network, 10))['0'].before).to.eq(null)
  })
})

describe('proposalChecks/checks/voting/stages', () => {
  it('names every stage difference, labels a weakened veto, and says the change reaches only later proposals', () => {
    const ctx = ctxWith([
      update([
        stage([VOTING], { approvalThreshold: '2' }),
        stage([VETO_A], { vetoThreshold: '1', voteDuration: '3600', cancelable: false }),
      ]),
    ])

    const [finding] = StagesCheck.run(ctx).findings

    expect(finding.kind).to.eq(IAssessmentFindingKind.Change)
    expect(finding.labels).to.deep.eq(['protectionReduced'])
    expect(finding.title).to.eq(
      `Weakens a safeguard on the stages of the spp plugin ${SPP}: stage 1 approvals from 1 to 2; stage 2 loses body ${VETO_B}; stage 2 voting window from 259200 to 3600 seconds; stage 2 is no longer cancelable`,
    )
    expect(finding.details).to.include(
      'stages are stored into each proposal at creation, so this reaches only proposals created afterwards',
    )
    expect(finding.notify).to.be.true
  })

  it('grades removing a veto stage, or switching its veto off, as high with the label', () => {
    const removed = ctxWith([update([stage([VOTING])])])
    const off = ctxWith([update([stage([VOTING]), stage([VETO_A, VETO_B], { vetoThreshold: '0', cancelable: true })])])

    const [gone] = StagesCheck.run(removed).findings
    const [muted] = StagesCheck.run(off).findings

    expect([gone.kind, gone.severity, gone.labels]).to.deep.eq([
      IAssessmentFindingKind.Risk,
      IAssessmentSeverity.High,
      ['protectionReduced'],
    ])
    expect(gone.title).to.contain('Removes a safeguard from')
    expect(gone.title).to.contain('stage 2 removed')
    expect(muted.severity).to.eq(IAssessmentSeverity.High)
    expect(muted.title).to.contain('stage 2 vetoes needed from 1 to 0 (veto switched off)')
  })

  it('reports an unchanged rewrite as dashboard-only, and an update without indexed stages as a description with a limit', () => {
    const same = ctxWith([update(before)])
    const blind = ctxWith([update([stage([VOTING], { editable: true })])], { stages: {} })

    const [unchanged] = StagesCheck.run(same).findings
    const [described] = StagesCheck.run(blind).findings

    expect(unchanged.notify).to.be.false
    expect(unchanged.title).to.contain('with the values they already have')
    expect(described.title).to.eq(`Sets 1 stages on the spp plugin ${SPP}`)
    expect(described.details[0]).to.eq('stage 1: 1 body, 1 approvals, 0 vetoes, 259200s window, editable')
    expect(described.details).to.include('an editable proposal that is edited afterwards adopts the new stages')
    expect(described.evidenceLimit).to.contain('not indexed')
    expect(StagesCheck.run(ctxWith([])).status).to.eq('notApplicable')
  })
})

describe('proposalChecks: the protection label on the other rules', () => {
  it('marks a shortened Delay cooldown, a revoked cancel right and an emptied guardian seat', () => {
    const CANCEL = PermissionState.idOf('CANCEL_PERMISSION')
    const cooldown = { to: DELAY, value: '0', data: iface.encodeFunctionData('setTxCooldown', [0]) }
    const revoke = { to: DAO, value: '0', data: iface.encodeFunctionData('revoke', [SPP, VETO_A, CANCEL]) }
    const guardian = { to: VAULT, value: '0', data: iface.encodeFunctionData('setGuardian', [ZERO]) }
    const base = ctxWith([cooldown, revoke, guardian], {
      components: { '0': { targetName: 'Delay', before: '3600', installedName: null, installedCooldown: null } },
      permissions: {
        available: true,
        grants: {
          [PermissionState.key(SPP, VETO_A, CANCEL)]: {
            where: SPP,
            who: VETO_A,
            permissionId: CANCEL,
            condition: null,
          },
        },
      },
    })

    const [delay] = ComponentsCheck.run(base).findings
    const [cancel] = PermissionsCheck.run(base).findings
    const [seat] = OwnershipCheck.run(base).findings

    expect([delay.severity, delay.labels]).to.deep.eq([IAssessmentSeverity.High, ['protectionReduced']])
    expect([cancel.kind, cancel.labels]).to.deep.eq([IAssessmentFindingKind.Change, ['protectionReduced']])
    expect(cancel.title).to.contain('one fewer who can cancel')
    expect([seat.kind, seat.severity, seat.labels]).to.deep.eq([
      IAssessmentFindingKind.Risk,
      IAssessmentSeverity.High,
      ['protectionReduced'],
    ])
    expect(seat.title).to.eq(`Removes the guardian of contract ${VAULT}`)
  })
})
