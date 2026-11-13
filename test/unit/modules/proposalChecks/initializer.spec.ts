import InitializerCheck from '@modules/proposalChecks/checks/control/initializer'
import TransfersCheck from '@modules/proposalChecks/checks/assets/transfers'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { type IAssessmentContext, IAssessmentFindingKind, IAssessmentSeverity, type ISimulationFacts } from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'

const DAO = '0xaFe8123417B112B352B356F0eA50becC471Ed853'
const PLUGIN = '0xea817f210A3Bf9B6B9266aFb1cdf5dC534dD96Be'
const OWNER = '0x4444444444444444444444444444444444444444'
const NEW_IMPL = '0x3333333333333333333333333333333333333333'
const dao = new Interface([
  'function initialize(bytes,address,address,string)',
  'function initializeFrom(uint8,bytes)',
  'function upgradeToAndCall(address,bytes)',
  'function transfer(address,uint256)',
])
const initialize = () => dao.encodeFunctionData('initialize', ['0x', OWNER, OWNER, ''])
const call = (to: string, data: string) => ({ to, value: '0', data })
const simulated = (failureMap: string, actions: number): ISimulationFacts => ({
  ...fakeAssessmentContext().simulation,
  status: 'ok',
  reason: null,
  executions: [{ dao: DAO, actions, allowFailureMap: '0', failureMap }],
})
const ctxWith = (rawActions: any[], overrides: Partial<IAssessmentContext> = {}): IAssessmentContext => {
  const base = fakeAssessmentContext()
  return {
    ...base,
    request: { ...base.request, daoAddress: DAO },
    actions: AssessmentContextBuilder._flatten(rawActions, DAO),
    plugins: [{ address: PLUGIN, interfaceType: 'multisig', isSubPlugin: false }],
    ...overrides,
  }
}

describe('proposalChecks/checks/control/initializer', () => {
  it("grades the DAO's own initializer going through as high risk, naming who would get ROOT", () => {
    const ctx = ctxWith([call(DAO, initialize())], { simulation: simulated('0', 1) })

    const { findings } = InitializerCheck.run(ctx)

    expect(findings).to.have.length(1)
    expect([findings[0].kind, findings[0].severity]).to.deep.eq([IAssessmentFindingKind.Risk, IAssessmentSeverity.High])
    expect(findings[0].title).to.eq('Initializes the DAO again through initialize')
    expect(findings[0].details[0]).to.contain(`initialOwner = ${OWNER}`)
    expect(findings[0].details).to.include(`${OWNER} would receive ROOT on the DAO`)
    expect(findings[0].notify).to.be.true
  })

  it('leaves any other initializer that goes through, or one that reverts, for a person with the outcome named', () => {
    const ctx = ctxWith([call(PLUGIN, dao.encodeFunctionData('initializeFrom', [1, '0x'])), call(DAO, initialize())], {
      simulation: simulated('2', 2),
    })

    const { findings } = InitializerCheck.run(ctx)

    expect(findings.map(f => [f.id, f.kind, f.severity ?? null])).to.deep.eq([
      ['control/initializer:0', IAssessmentFindingKind.NeedsReview, null],
      ['control/initializer:1', IAssessmentFindingKind.NeedsReview, null],
    ])
    expect(findings[0].details).to.include('the call goes through in the simulation; what it rewrites is not read')
    expect(findings[1].title).to.contain('which reverts')
    expect(findings[1].details).to.include(
      'the call reverts in the simulation; whether the step was already completed is not established',
    )
  })

  it('needs review when the sequence was not simulated or the call sits inside a wrapper', () => {
    const inner = dao.encodeFunctionData('initializeFrom', [1, '0x'])
    const nested = new Interface(['function execute(bytes32,(address,uint256,bytes)[],uint256)']).encodeFunctionData(
      'execute',
      ['0x' + '11'.repeat(32), [[PLUGIN, 0, inner]], 0],
    )
    const notSimulated = InitializerCheck.run(ctxWith([call(DAO, initialize())])).findings
    const { findings } = InitializerCheck.run(ctxWith([call(DAO, nested)], { simulation: simulated('0', 1) }))

    expect(notSimulated[0].kind).to.eq(IAssessmentFindingKind.NeedsReview)
    expect(notSimulated[0].evidenceLimit).to.contain('the call was not simulated')
    expect(findings.map(f => [f.id, f.kind])).to.deep.eq([
      ['control/initializer:0/0', IAssessmentFindingKind.NeedsReview],
    ])
    expect(findings[0].title).to.eq(`Initializes the multisig plugin ${PLUGIN} again through initializeFrom`)
    expect(findings[0].details).to.include('whether the initialization step is still open could not be tested')
  })

  it('reads the call an upgrade carries from the action tree: an initializer is graded, an unreadable call is flagged, a transfer reaches its own rule', () => {
    const withInit = call(
      DAO,
      dao.encodeFunctionData('upgradeToAndCall', [NEW_IMPL, dao.encodeFunctionData('initializeFrom', [1, '0x'])]),
    )
    const withUnknown = call(PLUGIN, dao.encodeFunctionData('upgradeToAndCall', [NEW_IMPL, '0xdeadbeef']))
    const withTransfer = call(
      PLUGIN,
      dao.encodeFunctionData('upgradeToAndCall', [NEW_IMPL, dao.encodeFunctionData('transfer', [OWNER, 5])]),
    )
    const plain = call(PLUGIN, dao.encodeFunctionData('upgradeToAndCall', [NEW_IMPL, '0x']))
    const ctx = ctxWith([withInit, withUnknown, withTransfer, plain], { simulation: simulated('0', 4) })

    const { findings } = InitializerCheck.run(ctx)

    expect(findings.map(f => [f.id, f.kind])).to.deep.eq([
      ['control/initializer:0/0', IAssessmentFindingKind.NeedsReview],
      ['control/initializer:1/0', IAssessmentFindingKind.NeedsReview],
    ])
    expect(findings[0].title).to.eq('Initializes the DAO again through initializeFrom right after the upgrade')
    expect(findings[0].after).to.deep.include({ afterUpgrade: true, function: 'initializeFrom' })
    expect(findings[1].title).to.eq(
      `Runs a call on the multisig plugin ${PLUGIN} right after its upgrade that could not be read`,
    )
    expect(ctx.actions.find(a => a.path === '2/0')).to.deep.include({
      target: PLUGIN,
      caller: DAO,
      via: 'upgradeToAndCall',
    })
    expect(TransfersCheck.run(ctx).findings.map(f => f.actionPaths)).to.deep.eq([['2/0']])
    expect(ctx.actions.filter(a => a.path.startsWith('3/'))).to.deep.eq([])
  })

  it('is not applicable without actions and finds nothing without an initializer', () => {
    expect(InitializerCheck.run(ctxWith([])).status).to.eq('notApplicable')
    expect(
      InitializerCheck.run(ctxWith([call(PLUGIN, dao.encodeFunctionData('transfer', [OWNER, 1]))])).findings,
    ).to.deep.eq([])
  })
})
