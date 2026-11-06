import ConditionsCheck from '@modules/proposalChecks/checks/control/conditions'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import PermissionState from '@modules/proposalChecks/permissions'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { IAssessmentFindingKind, IAssessmentSeverity, type IPermissionTable } from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'

const DAO = '0xaFe8123417B112B352B356F0eA50becC471Ed853'
const PLUGIN = '0xea817f210A3Bf9B6B9266aFb1cdf5dC534dD96Be'
const COND_A = '0x4444444444444444444444444444444444444444'
const COND_B = '0x5555555555555555555555555555555555555555'
const EXECUTE = PermissionState.idOf('EXECUTE_PERMISSION')
const CREATE = PermissionState.idOf('CREATE_PROPOSAL_PERMISSION')
const dao = new Interface([
  'function grant(address,address,bytes32)',
  'function grantWithCondition(address,address,bytes32,address)',
  'function revoke(address,address,bytes32)',
])
const cond = new Interface([
  'function allowSelector(bytes4)',
  'function disallowSelector(bytes4)',
  'function setRules(uint256)',
])
const call = (fn: string, args: any[]) => ({ to: DAO, value: '0', data: dao.encodeFunctionData(fn, args) })
const onCond = (target: string, fn: string, args: any[]) => ({
  to: target,
  value: '0',
  data: cond.encodeFunctionData(fn, args),
})
const table = (...items: [string, string, string, string | null][]): IPermissionTable => ({
  available: true,
  grants: Object.fromEntries(
    items.map(([where, who, permissionId, condition]) => [
      PermissionState.key(where, who, permissionId),
      { where, who, permissionId, condition },
    ]),
  ),
})
// Condition updaters have no built-in signature; in production the verified source decodes them, here the test does.
const decodeConditionCalls = (actions: ReturnType<typeof AssessmentContextBuilder._flatten>) =>
  actions.map(a => {
    if (a.decoding !== 'unknown') return a
    try {
      const parsed = cond.parseTransaction({ data: a.data })
      if (!parsed) return a
      return { ...a, decoding: 'known' as const, decoded: { signature: parsed.signature, name: parsed.name, args: {} } }
    } catch {
      return a
    }
  })
const ctxWith = (rawActions: any[], permissions: IPermissionTable) => {
  const base = fakeAssessmentContext()
  return {
    ...base,
    request: { ...base.request, daoAddress: DAO },
    actions: decodeConditionCalls(AssessmentContextBuilder._flatten(rawActions, DAO)),
    permissions,
  }
}

describe('proposalChecks/checks/control/conditions', () => {
  it('grades removing the condition on a powerful permission as high, and adding one as a change', () => {
    const removed = ConditionsCheck.run(
      ctxWith(
        [call('revoke', [DAO, PLUGIN, EXECUTE]), call('grant', [DAO, PLUGIN, EXECUTE])],
        table([DAO, PLUGIN, EXECUTE, COND_A]),
      ),
    ).findings
    expect(removed).to.have.length(1)
    expect(removed[0].kind).to.eq(IAssessmentFindingKind.Risk)
    expect(removed[0].severity).to.eq(IAssessmentSeverity.High)
    expect(removed[0].title).to.contain('Removes the condition on EXECUTE_PERMISSION')

    const added = ConditionsCheck.run(
      ctxWith(
        [call('revoke', [DAO, PLUGIN, EXECUTE]), call('grantWithCondition', [DAO, PLUGIN, EXECUTE, COND_A])],
        table([DAO, PLUGIN, EXECUTE, null]),
      ),
    ).findings
    expect(added[0].kind).to.eq(IAssessmentFindingKind.Change)
    expect(added[0].title).to.contain(`behind condition ${COND_A}`)
  })

  it('needs review when one condition is swapped for another, and stays quiet when the grant merely repeats', () => {
    const swapped = ConditionsCheck.run(
      ctxWith(
        [call('revoke', [DAO, PLUGIN, EXECUTE]), call('grantWithCondition', [DAO, PLUGIN, EXECUTE, COND_B])],
        table([DAO, PLUGIN, EXECUTE, COND_A]),
      ),
    ).findings
    expect(swapped[0].kind).to.eq(IAssessmentFindingKind.NeedsReview)
    expect(swapped[0].details[0]).to.contain(`${COND_A} is replaced by ${COND_B}`)

    const same = ConditionsCheck.run(
      ctxWith(
        [call('revoke', [DAO, PLUGIN, EXECUTE]), call('grantWithCondition', [DAO, PLUGIN, EXECUTE, COND_A])],
        table([DAO, PLUGIN, EXECUTE, COND_A]),
      ),
    ).findings
    expect(same).to.deep.eq([])
  })

  it('folds the changes in order, so a condition added and removed again in one batch is reported twice', () => {
    const findings = ConditionsCheck.run(
      ctxWith(
        [
          call('revoke', [DAO, PLUGIN, EXECUTE]),
          call('grantWithCondition', [DAO, PLUGIN, EXECUTE, COND_A]),
          call('revoke', [DAO, PLUGIN, EXECUTE]),
          call('grant', [DAO, PLUGIN, EXECUTE]),
        ],
        table([DAO, PLUGIN, EXECUTE, null]),
      ),
    ).findings

    expect(findings.map(f => [f.kind, f.severity ?? null])).to.deep.eq([
      [IAssessmentFindingKind.Change, null],
      [IAssessmentFindingKind.Risk, IAssessmentSeverity.High],
    ])
    expect(findings[0].title).to.contain('Puts')
    expect(findings[1].title).to.contain('Removes the condition')
    expect(findings[1].details[0]).to.contain(`was limited by ${COND_A}`)
  })

  it('needs review for any call on a condition contract, whatever the call is named', () => {
    const permissions = table([DAO, PLUGIN, EXECUTE, COND_A], [PLUGIN, DAO, CREATE, COND_B])
    const findings = ConditionsCheck.run(
      ctxWith([onCond(COND_A, 'allowSelector', ['0x12345678']), onCond(COND_B, 'setRules', [1])], permissions),
    ).findings

    expect(findings.map(f => [f.kind, f.severity ?? null])).to.deep.eq([
      [IAssessmentFindingKind.NeedsReview, null],
      [IAssessmentFindingKind.NeedsReview, null],
    ])
    expect(findings[0].title).to.contain('which guards EXECUTE_PERMISSION, through allowSelector')
    expect(findings[1].title).to.contain('CREATE_PROPOSAL_PERMISSION')
    expect(findings[0].evidenceLimit).to.contain('condition contracts are not interpreted')
  })

  it('needs review for a call it cannot read on a condition, including one the proposal itself introduces', () => {
    const introduced = call('grantWithCondition', [DAO, PLUGIN, EXECUTE, COND_B])
    const opaque = { to: COND_B, value: '0', data: '0xdeadbeef00' }
    const findings = ConditionsCheck.run(ctxWith([introduced, opaque], table([DAO, PLUGIN, CREATE, null]))).findings

    expect(findings).to.have.length(1)
    expect(findings[0].kind).to.eq(IAssessmentFindingKind.NeedsReview)
    expect(findings[0].title).to.contain('with a call that could not be read')
    expect(findings[0].evidenceLimit).to.contain('condition contracts are not interpreted')
  })

  it('has nothing to say about proposals that touch no condition', () => {
    const result = ConditionsCheck.run(
      ctxWith([call('grant', [DAO, PLUGIN, EXECUTE])], table([DAO, PLUGIN, CREATE, COND_A])),
    )
    expect(result).to.deep.eq({ status: 'ok', findings: [] })
  })
})
