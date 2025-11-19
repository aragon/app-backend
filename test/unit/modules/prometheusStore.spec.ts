import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { PrometheusStore } from '@modules/prometheusStore'
import { Models } from '@dbModels'
import Logger from '@logger'
import * as promClient from 'prom-client'

describe('Module: PrometheusStore', () => {
  let sandbox: SinonSandbox
  let clock: sinon.SinonFakeTimers

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    clock = sinon.useFakeTimers()
  })

  afterEach(() => {
    sandbox.restore()
    clock.restore()
    PrometheusStore.clearInstances()
  })

  describe('getInstance', () => {
    it('returns singleton instance for service name', () => {
      const instance1 = PrometheusStore.getInstance('test-service')
      const instance2 = PrometheusStore.getInstance('test-service')

      expect(instance1).to.equal(instance2)
    })

    it('returns different instances for different service names', () => {
      const instance1 = PrometheusStore.getInstance('service-1')
      const instance2 = PrometheusStore.getInstance('service-2')

      expect(instance1).to.not.equal(instance2)
    })

    it('initializes with collectDefaultMetrics', async () => {
      const store = PrometheusStore.getInstance('test-service')
      const registry = store.getRegistry()
      const metrics = await registry.metrics()

      expect(metrics).to.include('service="test-service"')
    })
  })

  describe('start', () => {
    it('stores metrics immediately on start', async () => {
      const metricsData = '# HELP test_metric\ntest_metric 1'
      const findStub = sandbox.stub(Models.Metrics, 'findByServiceName').resolves(null)
      const createStub = sandbox.stub(Models.Metrics, 'create').resolves()

      const store = PrometheusStore.getInstance('test-service')
      const registry = store.getRegistry()
      sandbox.stub(registry, 'metrics').resolves(metricsData)

      await store.start()

      expect(findStub.calledOnce).to.be.true
      expect(createStub.calledOnce).to.be.true
      expect(createStub.firstCall.args[0]).to.deep.include({
        serviceName: 'test-service',
        metricsData,
      })
    })

    it('updates existing metrics on start', async () => {
      const metricsData = '# HELP test_metric\ntest_metric 1'
      const existingMetric = {
        update: sandbox.stub().resolves(),
      }
      const findStub = sandbox.stub(Models.Metrics, 'findByServiceName').resolves(existingMetric)

      const store = PrometheusStore.getInstance('test-service')
      const registry = store.getRegistry()
      sandbox.stub(registry, 'metrics').resolves(metricsData)

      await store.start()

      expect(findStub.calledOnce).to.be.true
      expect(existingMetric.update.calledOnce).to.be.true
      expect(existingMetric.update.firstCall.args[0]).to.deep.equal({
        metricsData,
      })
    })

    it('sets up 30s interval for storing metrics', async () => {
      const metricsData = '# HELP test_metric\ntest_metric 1'
      sandbox.stub(Models.Metrics, 'findByServiceName').resolves(null)
      const createStub = sandbox.stub(Models.Metrics, 'create').resolves()

      const store = PrometheusStore.getInstance('test-service')
      const registry = store.getRegistry()
      sandbox.stub(registry, 'metrics').resolves(metricsData)

      await store.start()

      expect(createStub.callCount).to.equal(1)

      await clock.tickAsync(30000)
      expect(createStub.callCount).to.equal(2)

      await clock.tickAsync(30000)
      expect(createStub.callCount).to.equal(3)
    })

    it('sets up 5min interval for cleanup', async () => {
      sandbox.stub(Models.Metrics, 'findByServiceName').resolves(null)
      sandbox.stub(Models.Metrics, 'create').resolves()

      const deleteStub = sandbox.stub(Models.Metrics, 'deleteMany').resolves({ deletedCount: 5 })

      const store = PrometheusStore.getInstance('test-service')
      const registry = store.getRegistry()
      sandbox.stub(registry, 'metrics').resolves('test')

      await store.start()

      expect(deleteStub.called).to.be.false

      await clock.tickAsync(300000)
      expect(deleteStub.calledOnce).to.be.true
    })

    it('logs error on storage failure', async () => {
      const error = new Error('Storage failed')
      sandbox.stub(Models.Metrics, 'findByServiceName').rejects(error)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const store = PrometheusStore.getInstance('test-service')
      const registry = store.getRegistry()
      sandbox.stub(registry, 'metrics').resolves('test')

      await store.start()

      expect(loggerErrorStub.called).to.be.true
    })
  })

  describe('stop', () => {
    it('stops store and cleanup intervals', async () => {
      sandbox.stub(Models.Metrics, 'findByServiceName').resolves(null)
      const createStub = sandbox.stub(Models.Metrics, 'create').resolves()
      const deleteStub = sandbox.stub(Models.Metrics, 'deleteMany').resolves({ deletedCount: 0 })

      const store = PrometheusStore.getInstance('test-service')
      const registry = store.getRegistry()
      sandbox.stub(registry, 'metrics').resolves('test')

      await store.start()

      expect(createStub.callCount).to.equal(1)

      await store.stop()

      await clock.tickAsync(30000)
      expect(createStub.callCount).to.equal(1)

      await clock.tickAsync(300000)
      expect(deleteStub.called).to.be.false
    })
  })

  describe('aggregateAllMetrics', () => {
    it('aggregates metrics from all services', async () => {
      const metrics = [
        { metricsData: '# service1\nmetric1 1' },
        { metricsData: '# service2\nmetric2 2' },
        { metricsData: '# service3\nmetric3 3' },
      ]

      sandbox.stub(Models.Metrics, 'findAllMetrics').resolves(metrics as any)

      const result = await PrometheusStore.aggregateAllMetrics()

      expect(result).to.equal('# service1\nmetric1 1\n# service2\nmetric2 2\n# service3\nmetric3 3')
    })

    it('returns empty string on error', async () => {
      const error = new Error('DB error')
      sandbox.stub(Models.Metrics, 'findAllMetrics').rejects(error)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await PrometheusStore.aggregateAllMetrics()

      expect(result).to.equal('')
      expect(loggerErrorStub.called).to.be.true
    })

    it('returns empty string when no metrics exist', async () => {
      sandbox.stub(Models.Metrics, 'findAllMetrics').resolves([])

      const result = await PrometheusStore.aggregateAllMetrics()

      expect(result).to.equal('')
    })
  })

  describe('cleanup', () => {
    it('deletes old metrics and logs count', async () => {
      const deleteStub = sandbox.stub(Models.Metrics, 'deleteMany').resolves({ deletedCount: 10 })
      const loggerInfoStub = sandbox.stub(Logger, 'info')

      sandbox.stub(Models.Metrics, 'findByServiceName').resolves(null)
      sandbox.stub(Models.Metrics, 'create').resolves()

      const store = PrometheusStore.getInstance('test-service')
      const registry = store.getRegistry()
      sandbox.stub(registry, 'metrics').resolves('test')

      await store.start()
      await clock.tickAsync(300000)

      expect(deleteStub.calledOnce).to.be.true
      expect(loggerInfoStub.calledWith('Cleaned up old metrics' as any)).to.be.true
    })

    it('does not log when no metrics deleted', async () => {
      const deleteStub = sandbox.stub(Models.Metrics, 'deleteMany').resolves({ deletedCount: 0 })
      const loggerInfoStub = sandbox.stub(Logger, 'info')

      sandbox.stub(Models.Metrics, 'findByServiceName').resolves(null)
      sandbox.stub(Models.Metrics, 'create').resolves()

      const store = PrometheusStore.getInstance('test-service')
      const registry = store.getRegistry()
      sandbox.stub(registry, 'metrics').resolves('test')

      await store.start()

      loggerInfoStub.resetHistory()

      await clock.tickAsync(300000)

      expect(deleteStub.calledOnce).to.be.true
      const cleanupLogs = loggerInfoStub.getCalls().filter(call => call.args[0][0] === 'Cleaned up old metrics')
      expect(cleanupLogs.length).to.equal(0)
    })

    it('logs error on cleanup failure', async () => {
      const error = new Error('Cleanup failed')
      sandbox.stub(Models.Metrics, 'deleteMany').rejects(error)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      sandbox.stub(Models.Metrics, 'findByServiceName').resolves(null)
      sandbox.stub(Models.Metrics, 'create').resolves()

      const store = PrometheusStore.getInstance('test-service')
      const registry = store.getRegistry()
      sandbox.stub(registry, 'metrics').resolves('test')

      await store.start()
      await clock.tickAsync(300000)

      expect(loggerErrorStub.called).to.be.true
    })
  })

  describe('getRegistry', () => {
    it('returns the prometheus registry', () => {
      const store = PrometheusStore.getInstance('test-service')
      const registry = store.getRegistry()

      expect(registry).to.be.instanceOf(promClient.Registry)
    })
  })
})
