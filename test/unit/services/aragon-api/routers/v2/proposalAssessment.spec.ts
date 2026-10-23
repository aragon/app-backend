import ProposalAssessmentController from '@api/controllers/proposalAssessment'
import ProposalAssessmentRouter from '@api/routers/v2/proposalAssessment'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

describe('RouterV2: ProposalAssessment', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('passes the proposal id to the controller and returns its body', async () => {
    const stub = sandbox.stub(ProposalAssessmentController, 'getLatest').resolves({ proposalId: 'p1' } as any)
    const ctx: any = { params: { proposalId: 'p1' }, query: {}, request: {}, throw: sandbox.stub() }

    await ProposalAssessmentRouter.getLatest(ctx)

    expect(stub.calledOnceWith('p1')).to.be.true
    expect(ctx.body).to.deep.eq({ proposalId: 'p1' })
  })

  it('passes the proposal id and the pagination to the history controller', async () => {
    const stub = sandbox.stub(ProposalAssessmentController, 'getHistory').resolves({ data: [] } as any)
    const ctx: any = {
      params: { proposalId: 'p1' },
      query: { page: '2', pageSize: '5' },
      request: {},
      throw: sandbox.stub(),
    }

    await ProposalAssessmentRouter.getHistory(ctx)

    expect(stub.calledOnce).to.be.true
    expect(stub.args[0][0]).to.eq('p1')
    expect(stub.args[0][1]).to.include({ page: 2, pageSize: 5 })
    expect(ctx.body).to.deep.eq({ data: [] })
  })

  it('mounts both routes under a proposal id', () => {
    const paths = ProposalAssessmentRouter.router().stack.map(layer => `${layer.methods.join(',')} ${layer.path}`)
    expect(paths).to.include('HEAD,GET /:proposalId/assessment')
    expect(paths).to.include('HEAD,GET /:proposalId/assessments')
  })
})
