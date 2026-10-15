import { CHECK_MANIFEST } from '@modules/proposalChecks/checks/index'
import AssessmentEngine from '@modules/proposalChecks/engine'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import {
  type IAssessmentCheck,
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  IAssessmentFindingKind,
  type IAssessmentManifest,
  IAssessmentRequestStatus,
} from '@types'
import { expect } from 'chai'

const ok = (): IAssessmentCheckResult => ({ status: IAssessmentCheckStatus.Ok, findings: [] })
const entry = (id: string, run: IAssessmentCheck['run']): IAssessmentManifest[number] => [id, { id, run }]
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
  it('lists every rule of the source document once', () => {
    expect(CHECK_MANIFEST).to.have.length(27)
    expect(new Set(CHECK_MANIFEST.map(([id]) => id)).size).to.eq(27)
  })

  it('keeps the assessment incomplete while any rule has no implementation', async () => {
    const manifest = CHECK_MANIFEST.map(([id]) => [id, null] as const)

    const result = await AssessmentEngine.run(fakeAssessmentContext(), manifest)

    expect(result.status).to.eq(IAssessmentRequestStatus.Incomplete)
    expect(Object.keys(result.checks)).to.have.length(27)
    for (const [id] of manifest) {
      expect(result.checks[id].status).to.eq(IAssessmentCheckStatus.NeedsReview)
      expect(result.checks[id].reason).to.eq('check not implemented yet')
    }
    expect(result.coverage.missing).to.have.length(27)
    expect(result.findings).to.deep.eq([])
  })

  it('reports complete only once every rule is implemented and none needs review', async () => {
    const manifest = CHECK_MANIFEST.map(([id]) => entry(id, ok))

    const result = await AssessmentEngine.run(fakeAssessmentContext(), manifest)

    expect(result.status).to.eq(IAssessmentRequestStatus.Complete)
    expect(result.coverage.missing).to.deep.eq([])
  })

  it('collects findings from implemented checks and stamps the rule id on each', async () => {
    const manifest = [
      entry('assets/transfers', () => ({ status: IAssessmentCheckStatus.Ok, findings: [finding('a')] })),
      entry('assets/nfts', async () => ({ status: IAssessmentCheckStatus.Ok, findings: [finding('b')] })),
      ['execution/crossChain', null] as const,
    ]

    const result = await AssessmentEngine.run(fakeAssessmentContext(), manifest)

    expect(result.findings.map(f => [f.id, f.checkId])).to.deep.eq([
      ['a', 'assets/transfers'],
      ['b', 'assets/nfts'],
    ])
    expect(result.coverage.implemented).to.deep.eq(['assets/transfers', 'assets/nfts'])
    expect(result.coverage.missing).to.deep.eq(['execution/crossChain'])
    expect(result.status).to.eq(IAssessmentRequestStatus.Incomplete)
  })

  it('fails only the check that throws and keeps the others', async () => {
    const manifest = [
      entry('assets/transfers', ok),
      entry('control/permissions', () => {
        throw new Error('permission table exploded')
      }),
      entry('assets/nfts', () => ({ status: IAssessmentCheckStatus.Ok, findings: [finding('b')] })),
    ]

    const result = await AssessmentEngine.run(fakeAssessmentContext(), manifest)

    expect(result.checks['control/permissions'].status).to.eq(IAssessmentCheckStatus.Failed)
    expect(result.checks['control/permissions'].reason).to.eq('permission table exploded')
    expect(result.checks['assets/transfers'].status).to.eq(IAssessmentCheckStatus.Ok)
    expect(result.findings.map(f => f.id)).to.deep.eq(['b'])
    expect(result.status).to.eq(IAssessmentRequestStatus.Failed)
  })

  it('marks the assessment incomplete when a check needs review, and keeps its reason', async () => {
    const manifest = [
      entry('execution/decode', () => ({
        status: IAssessmentCheckStatus.NeedsReview,
        findings: [],
        reason: 'calldata of action 0 could not be decoded',
      })),
    ]

    const result = await AssessmentEngine.run(fakeAssessmentContext(), manifest)

    expect(result.status).to.eq(IAssessmentRequestStatus.Incomplete)
    expect(result.checks['execution/decode'].reason).to.eq('calldata of action 0 could not be decoded')
  })

  it('adds a reason when a check reports a non-ok status without one', async () => {
    const manifest = [entry('assets/transfers', () => ({ status: IAssessmentCheckStatus.NotApplicable, findings: [] }))]

    const result = await AssessmentEngine.run(fakeAssessmentContext(), manifest)

    expect(result.checks['assets/transfers'].reason).to.contain('without a reason')
  })
})
