import AssessmentEngine from '@modules/proposalChecks/engine'
import { REQUIRED_CHECK_IDS } from '@modules/proposalChecks/registry'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import {
  type IAssessmentCheck,
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  IAssessmentFindingKind,
  IAssessmentRequestStatus,
} from '@types'
import { expect } from 'chai'

const check = (id: string, run: IAssessmentCheck['run']): IAssessmentCheck => ({ id, run })
const ok = (): IAssessmentCheckResult => ({ status: IAssessmentCheckStatus.Ok, findings: [] })
const finding = (id: string) => ({
  id,
  checkId: 'wrong-on-purpose',
  kind: IAssessmentFindingKind.Change,
  labels: [],
  notify: true,
  title: 'x',
  details: [],
  actionPaths: ['0'],
})

describe('proposalChecks/engine', () => {
  it('keeps the assessment incomplete while any required rule has no implementation', async () => {
    const result = await AssessmentEngine.run(fakeAssessmentContext(), [])

    expect(result.status).to.eq(IAssessmentRequestStatus.Incomplete)
    expect(Object.keys(result.checks)).to.have.length(REQUIRED_CHECK_IDS.length)
    for (const id of REQUIRED_CHECK_IDS) {
      expect(result.checks[id]).to.eq(IAssessmentCheckStatus.NeedsReview)
      expect(result.reasons[id]).to.eq('check not implemented yet')
    }
    expect(result.coverage.missing).to.have.length(27)
    expect(result.findings).to.deep.eq([])
  })

  it('reports complete only once every required rule is implemented and none needs review', async () => {
    const checks = REQUIRED_CHECK_IDS.map(id => check(id, ok))

    const result = await AssessmentEngine.run(fakeAssessmentContext(), checks)

    expect(result.status).to.eq(IAssessmentRequestStatus.Complete)
    expect(result.coverage.missing).to.deep.eq([])
  })

  it('collects findings from implemented checks and stamps the check id on each', async () => {
    const checks = [
      check('assets/transfers', () => ({ status: IAssessmentCheckStatus.Ok, findings: [finding('a')] })),
      check('assets/nfts', async () => ({ status: IAssessmentCheckStatus.Ok, findings: [finding('b')] })),
    ]

    const result = await AssessmentEngine.run(fakeAssessmentContext(), checks)

    expect(result.findings.map(f => [f.id, f.checkId])).to.deep.eq([
      ['a', 'assets/transfers'],
      ['b', 'assets/nfts'],
    ])
    expect(result.coverage.implemented).to.deep.eq(['assets/transfers', 'assets/nfts'])
    expect(result.status).to.eq(IAssessmentRequestStatus.Incomplete)
  })

  it('fails only the check that throws and keeps the others', async () => {
    const checks = [
      check('assets/transfers', ok),
      check('control/permissions', () => {
        throw new Error('permission table exploded')
      }),
      check('assets/nfts', () => ({ status: IAssessmentCheckStatus.Ok, findings: [finding('b')] })),
    ]

    const result = await AssessmentEngine.run(fakeAssessmentContext(), checks)

    expect(result.checks['control/permissions']).to.eq(IAssessmentCheckStatus.Failed)
    expect(result.reasons['control/permissions']).to.eq('permission table exploded')
    expect(result.checks['assets/transfers']).to.eq(IAssessmentCheckStatus.Ok)
    expect(result.findings.map(f => f.id)).to.deep.eq(['b'])
    expect(result.status).to.eq(IAssessmentRequestStatus.Failed)
  })

  it('marks the assessment incomplete when a check needs review, and keeps its reason', async () => {
    const checks = [
      check('execution/decode', () => ({
        status: IAssessmentCheckStatus.NeedsReview,
        findings: [],
        reason: 'calldata of action 0 could not be decoded',
      })),
    ]

    const result = await AssessmentEngine.run(fakeAssessmentContext(), checks)

    expect(result.status).to.eq(IAssessmentRequestStatus.Incomplete)
    expect(result.reasons['execution/decode']).to.eq('calldata of action 0 could not be decoded')
  })

  it('adds a reason when a check reports a non-ok status without one', async () => {
    const checks = [check('assets/transfers', () => ({ status: IAssessmentCheckStatus.NotApplicable, findings: [] }))]

    const result = await AssessmentEngine.run(fakeAssessmentContext(), checks)

    expect(result.reasons['assets/transfers']).to.contain('without a reason')
  })
})
