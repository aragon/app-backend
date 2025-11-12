import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import MetricsAdminRouter from '@services/aragon-admin-api/routers/metrics'
import MetricsAdminController from '@services/aragon-admin-api/controllers/metrics'

describe('Router: MetricsAdmin', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should get metrics with correct content type', async () => {
    const mockMetrics = `# HELP aragon_dao_process_cpu_user_seconds_total
# TYPE aragon_dao_process_cpu_user_seconds_total counter
aragon_dao_process_cpu_user_seconds_total 0.123`

    sandbox.stub(MetricsAdminController, 'getMetrics').resolves(mockMetrics)

    const ctx: any = {
      set: sinon.stub(),
    }

    await MetricsAdminRouter.getMetrics(ctx)

    expect(ctx.set.calledWith('Content-Type', 'text/plain; version=0.0.4')).to.be.true
    expect(ctx.body).to.eq(mockMetrics)
  })
})
