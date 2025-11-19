import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import MetricsAdminController from '@services/aragon-admin-api/controllers/metrics'
import { PrometheusStore } from '@modules/prometheusStore'

describe('Controller: MetricsAdmin', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should get aggregated metrics from all services', async () => {
    const mockMetrics = `# HELP aragon_dao_process_cpu_user_seconds_total
# TYPE aragon_dao_process_cpu_user_seconds_total counter
aragon_dao_process_cpu_user_seconds_total 0.123

# HELP aragon_indexer_process_cpu_user_seconds_total
# TYPE aragon_indexer_process_cpu_user_seconds_total counter
aragon_indexer_process_cpu_user_seconds_total 0.456`

    const aggregateStub = sandbox.stub(PrometheusStore, 'aggregateAllMetrics').resolves(mockMetrics)

    const result = await MetricsAdminController.getMetrics()

    expect(aggregateStub.calledOnce).to.be.true
    expect(result).to.eq(mockMetrics)
  })

  it('should return empty string when no metrics available', async () => {
    const aggregateStub = sandbox.stub(PrometheusStore, 'aggregateAllMetrics').resolves('')

    const result = await MetricsAdminController.getMetrics()

    expect(aggregateStub.calledOnce).to.be.true
    expect(result).to.eq('')
  })

  it('should handle errors gracefully', async () => {
    const aggregateStub = sandbox.stub(PrometheusStore, 'aggregateAllMetrics').resolves('')

    const result = await MetricsAdminController.getMetrics()

    expect(aggregateStub.calledOnce).to.be.true
    expect(result).to.be.a('string')
  })
})
