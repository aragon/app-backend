import CheckRegistry, { REQUIRED_CHECK_IDS } from '@modules/proposalChecks/registry'
import { type IAssessmentCheck, IAssessmentCheckStatus } from '@types'
import { expect } from 'chai'

const check = (id: string): IAssessmentCheck => ({
  id,
  run: () => ({ status: IAssessmentCheckStatus.Ok, findings: [] }),
})

describe('proposalChecks/registry', () => {
  it('lists every rule of the source document that becomes a check', () => {
    expect(REQUIRED_CHECK_IDS).to.have.length(27)
    expect(new Set(REQUIRED_CHECK_IDS).size).to.eq(27)
  })

  it('reports coverage from the checks it was given', () => {
    const byId = CheckRegistry.index([check('assets/transfers')])

    const coverage = CheckRegistry.coverage(byId)

    expect(coverage.implemented).to.deep.eq(['assets/transfers'])
    expect(coverage.missing).to.have.length(26)
    expect(coverage.missing).to.not.include('assets/transfers')
  })

  it('refuses a check id that is not a rule, and a rule listed twice', () => {
    expect(() => CheckRegistry.index([check('assets/somethingElse')])).to.throw()
    expect(() => CheckRegistry.index([check('assets/transfers'), check('assets/transfers')])).to.throw()
  })
})
