import { Models } from '@dbModels'
import ActionsChangedCheck from '@modules/proposalChecks/checks/voting/actionsChanged'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { fakeProposalAssessment } from '@test/mock/fakeProposalAssessment'
import { DECATS, FARTDAO } from '@test/mock/proposalChecks/incidents'
import { type IAssessmentContext, IAssessmentCheckStatus, type IPreviousRevision } from '@types'
import { expect } from 'chai'

const previousOf = (overrides: Partial<IPreviousRevision['captured']> = {}): IPreviousRevision => {
  const captured = fakeProposalAssessment().captured
  return {
    generation: 1,
    revisionId: 'a'.repeat(64),
    causeId: 'created:0xtx:0',
    captured: { ...captured, ...overrides },
  }
}
const ctxWith = (
  previous: IPreviousRevision | null,
  captured: Partial<IAssessmentContext['captured']> = {},
): IAssessmentContext => {
  const base = fakeAssessmentContext()
  return { ...base, previous, captured: { ...base.captured, ...captured } }
}

describe('proposalChecks/checks/voting/actionsChanged', () => {
  it('has nothing to compare on a first revision', () => {
    const result = ActionsChangedCheck.run(ctxWith(null))

    expect(result.status).to.eq(IAssessmentCheckStatus.Ok)
    expect(result.reason).to.eq('first revision of this proposal')
    expect(result.findings).to.deep.eq([])
  })

  it('names every difference an edit made to the actions and sends it, marking the earlier analysis outdated', () => {
    const edited = [{ ...DECATS.rawActions[0], value: '7' }, FARTDAO.rawActions[1]]
    const result = ActionsChangedCheck.run(
      ctxWith(previousOf({ rawActions: [DECATS.rawActions[0]] }), {
        rawActions: edited,
        allowFailureMap: '1',
        metadataUri: 'ipfs://new',
      }),
    )

    const [finding] = result.findings
    expect(finding.id).to.eq('voting/actionsChanged:1')
    expect(finding.notify).to.be.true
    expect(finding.title).to.eq('The actions changed after the last analysis: 4 differences')
    expect(finding.details.slice(0, 4)).to.deep.eq([
      `action 0 value changed (now ${DECATS.rawActions[0].to}, 7 wei, 0xa9059cbb…)`,
      `action 1 added (${FARTDAO.rawActions[1].to}, ${FARTDAO.rawActions[1].value} wei, ${FARTDAO.rawActions[1].data.slice(0, 10)}…)`,
      'allowed failures from 0 to 1',
      'metadata reference from ipfs://QmFake to ipfs://new',
    ])
    expect(finding.details[4]).to.contain('generation 1) is outdated; every rule ran again on this revision')
    expect((finding.after as any).actionsTouched).to.be.true
  })

  it('reports an edit that only touches metadata or settings without the actions, and a no-op edit as dashboard-only', () => {
    const settingsOnly = ActionsChangedCheck.run(ctxWith(previousOf(), { storedSettings: { minDuration: 99 } }))
    const same = ActionsChangedCheck.run(ctxWith(previousOf()))

    expect(settingsOnly.findings[0].title).to.eq('The proposal was edited without touching its actions: 1 difference')
    expect(settingsOnly.findings[0].details[0]).to.eq('the stored configuration changed')
    expect((settingsOnly.findings[0].after as any).actionsTouched).to.be.false
    expect(same.findings[0].notify).to.be.false
    expect(same.findings[0].title).to.eq('The proposal was edited with no change to what it asks for')
  })

  it('finds the revision analysed before this one and none for the first', async () => {
    const first = fakeProposalAssessment()
    await Models.ProposalAssessment.create(first)
    await Models.ProposalAssessment.create({
      ...first,
      id: 'req-2',
      generation: 2,
      revisionId: 'r2',
      causeId: 'edited:0xe:1',
    })
    const third = await Models.ProposalAssessment.create({
      ...first,
      id: 'req-3',
      generation: 3,
      revisionId: 'r3',
      causeId: 'edited:0xf:1',
    })

    const previous = await AssessmentContextBuilder._previous(third)
    const none = await AssessmentContextBuilder._previous((await Models.ProposalAssessment.findOne({ id: first.id }))!)

    expect(previous).to.include({ generation: 2, revisionId: 'r2', causeId: 'edited:0xe:1' })
    expect(previous!.captured.rawActions).to.deep.eq(first.captured.rawActions)
    expect(none).to.eq(null)
  })
})
