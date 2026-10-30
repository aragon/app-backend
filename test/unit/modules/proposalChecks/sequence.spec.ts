import SequenceCheck from '@modules/proposalChecks/checks/execution/sequence'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { DECATS, FARTDAO } from '@test/mock/proposalChecks/incidents'
import { type IAssessmentContext, IAssessmentCheckStatus, type ISimulationFacts } from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'

const OTHER_DAO = '0x1111111111111111111111111111111111111111'
const SAFE = '0x2222222222222222222222222222222222222222'
const daoIface = new Interface(['function execute(bytes32,(address,uint256,bytes)[],uint256)'])
const execute = (actions: { to: string; value: string; data: string }[]) =>
  daoIface.encodeFunctionData('execute', ['0x' + '00'.repeat(32), actions.map(a => [a.to, a.value, a.data]), 0])
const safeIface = new Interface(['function execTransactionFromModule(address,uint256,bytes,uint8)'])

const ctxWith = (rawActions: any[], simulation: Partial<ISimulationFacts>): IAssessmentContext => {
  const base = fakeAssessmentContext()
  return {
    ...base,
    request: { ...base.request, daoAddress: FARTDAO.daoAddress },
    captured: { ...base.captured, rawActions },
    actions: AssessmentContextBuilder._flatten(rawActions, FARTDAO.daoAddress),
    simulation: { ...base.simulation, ...simulation },
  }
}
const executed = (failureMap: string, allowFailureMap = '0', dao = FARTDAO.daoAddress) => ({
  dao,
  actions: FARTDAO.rawActions.length,
  allowFailureMap,
  failureMap,
})

describe('proposalChecks/checks/execution/sequence', () => {
  it('is ok when the DAO executed every action without a failure', () => {
    const result = SequenceCheck.run(
      ctxWith(FARTDAO.rawActions, { status: 'ok', reason: null, executions: [executed('0')] }),
    )

    expect(result).to.deep.eq({ status: IAssessmentCheckStatus.Ok, findings: [] })
  })

  it('needs review naming the actions that failed inside execute, and says which were allowed to', () => {
    const result = SequenceCheck.run(
      ctxWith(FARTDAO.rawActions, { status: 'ok', reason: null, executions: [executed('3', '2')] }),
    )

    expect(result.status).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(result.reason).to.eq('actions failed inside execute: 0, 1 (allowed to fail, still failed)')
  })

  it('needs review when execute reverted, when it never completed, or when it was not tested', () => {
    const reverted = SequenceCheck.run(ctxWith(FARTDAO.rawActions, { status: 'reverted', reason: 'DaoUnauthorized' }))
    expect(reverted.status).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(reverted.reason).to.eq('execute reverted: DaoUnauthorized')

    const noEvent = SequenceCheck.run(
      ctxWith(FARTDAO.rawActions, { status: 'ok', reason: null, executions: [executed('0', '0', DECATS.daoAddress)] }),
    )
    expect(noEvent.status).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(noEvent.reason).to.contain('no completed execute on the DAO')

    const untested = SequenceCheck.run(
      ctxWith(FARTDAO.rawActions, { status: 'unsupported', reason: 'no simulation support for x' }),
    )
    expect(untested.status).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(untested.reason).to.eq('action sequence not tested: no simulation support for x')
  })

  it('reads every nested DAO execute, naming an inner failure by its path', () => {
    const inner = FARTDAO.rawActions[1]
    const rawActions = [{ to: OTHER_DAO, value: '0', data: execute([inner, inner]) }]
    const executions = [{ dao: OTHER_DAO, actions: 2, allowFailureMap: '2', failureMap: '2' }, executed('0')]

    const result = SequenceCheck.run(ctxWith(rawActions, { status: 'ok', reason: null, executions }))

    expect(result.status).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(result.reason).to.eq('actions failed inside execute: 0/1 (allowed to fail, still failed)')
  })

  it('needs review when a nested execute never completed, and when a wrapper reports nothing about its calls', () => {
    const rawActions = [{ to: OTHER_DAO, value: '0', data: execute([FARTDAO.rawActions[1]]) }]
    const missing = SequenceCheck.run(ctxWith(rawActions, { status: 'ok', reason: null, executions: [executed('0')] }))
    expect(missing.status).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(missing.reason).to.contain('the simulation reports 1 completed executes, the action tree has 2')

    const viaSafe = [
      {
        to: SAFE,
        value: '0',
        data: safeIface.encodeFunctionData('execTransactionFromModule', [
          FARTDAO.rawActions[1].to,
          0,
          FARTDAO.rawActions[1].data,
          0,
        ]),
      },
    ]
    const opaque = SequenceCheck.run(ctxWith(viaSafe, { status: 'ok', reason: null, executions: [executed('0')] }))
    expect(opaque.status).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(opaque.reason).to.contain('outcome of inner calls not verified at 0')
  })

  it('matches executes on the same DAO by their order of completion, so a failure lands on the right route', () => {
    const inner = FARTDAO.rawActions[1]
    const rawActions = [
      { to: OTHER_DAO, value: '0', data: execute([inner]) },
      {
        to: SAFE,
        value: '0',
        data: safeIface.encodeFunctionData('execTransactionFromModule', [OTHER_DAO, 0, execute([inner]), 0]),
      },
    ]
    const executions = [
      { dao: OTHER_DAO, actions: 1, allowFailureMap: '0', failureMap: '1' },
      { dao: OTHER_DAO, actions: 1, allowFailureMap: '0', failureMap: '0' },
      executed('0'),
    ]

    const result = SequenceCheck.run(ctxWith(rawActions, { status: 'ok', reason: null, executions }))

    expect(result.reason).to.contain('actions failed inside execute: 0/0')
    expect(result.reason).to.not.contain('1/0/0')
  })

  it('needs review past the DAO action limit and is not applicable to a signalling proposal', () => {
    const many = Array.from({ length: 257 }, () => FARTDAO.rawActions[0])
    const tooMany = SequenceCheck.run(ctxWith(many, { status: 'ok', reason: null }))
    expect(tooMany.status).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(tooMany.reason).to.contain('257 actions exceed the DAO limit of 256')

    expect(SequenceCheck.run(ctxWith([], { status: 'ok', reason: null })).status).to.eq(
      IAssessmentCheckStatus.NotApplicable,
    )
  })
})
