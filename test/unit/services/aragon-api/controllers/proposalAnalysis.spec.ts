import ProposalAnalysisModule from '@modules/proposalAnalysis'
import ProposalAnalysisController from '@services/aragon-api/controllers/proposalAnalysis'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

describe('Controller: ProposalAnalysis', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('delegates to the module with the proposal id and the assistant override', async () => {
    const result = { proposalId: 'proposal-1' }
    const generate = sandbox.stub(ProposalAnalysisModule, 'generate').resolves(result as any)

    const returned = await ProposalAnalysisController.generate('proposal-1', { assistantUrl: 'http://localhost:4000' })

    expect(returned).to.equal(result)
    expect(generate.calledOnceWithExactly('proposal-1', { assistantUrl: 'http://localhost:4000' })).to.be.true
  })

  it('defaults to no options', async () => {
    const generate = sandbox.stub(ProposalAnalysisModule, 'generate').resolves({} as any)

    await ProposalAnalysisController.generate('proposal-1')

    expect(generate.firstCall.args).to.deep.equal(['proposal-1', {}])
  })

  it('lets exposable errors (404 allowlist, 400 not ready) pass through to the error middleware', async () => {
    const error = Object.assign(new Error('analysisNotAvailable'), { status: 404, exposeCustom_: true })
    sandbox.stub(ProposalAnalysisModule, 'generate').rejects(error)

    const thrown = await ProposalAnalysisController.generate('proposal-1').catch(e => e)

    expect(thrown).to.equal(error)
  })
})
