import ExecutionValidationCheck from '@modules/proposalChecks/checks/validation/execution'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { IAssessmentCheckStatus, type IExecutionValidation } from '@types'
import { expect } from 'chai'

const ctxWith = (validation: Partial<IExecutionValidation>) => {
  const base = fakeAssessmentContext()
  return { ...base, validation: { ...base.validation, ...validation } }
}

describe('proposalChecks/checks/validation/execution', () => {
  it('is ok whether the proposal is executable now or simply not passed yet, and says which', () => {
    const now = ExecutionValidationCheck.run(ctxWith({ status: 'executable', reason: null }))
    expect(now.status).to.eq(IAssessmentCheckStatus.Ok)
    expect(now.reason).to.contain('executable by anyone at block')

    const later = ExecutionValidationCheck.run(ctxWith({ status: 'notYet', reason: 'ProposalExecutionForbidden(1)' }))
    expect(later.status).to.eq(IAssessmentCheckStatus.Ok)
    expect(later.reason).to.contain('not executable yet at block')
    expect(later.reason).to.contain('ProposalExecutionForbidden(1)')
  })

  it('needs review when execution is refused for another reason, or was never tested', () => {
    const refused = ExecutionValidationCheck.run(ctxWith({ status: 'reverted', reason: 'DaoUnauthorized' }))
    expect(refused.status).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(refused.reason).to.eq('execution test refused: DaoUnauthorized')

    const untested = ExecutionValidationCheck.run(
      ctxWith({ status: 'unsupported', reason: 'no execution entry point known for spp' }),
    )
    expect(untested.status).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(untested.reason).to.eq('execution not tested: no execution entry point known for spp')
  })

  it('is not applicable to a signalling proposal', () => {
    expect(ExecutionValidationCheck.run({ ...ctxWith({}), actions: [] }).status).to.eq(
      IAssessmentCheckStatus.NotApplicable,
    )
  })
})
