import { Models } from '@dbModels'
import Metrics from '@models/schema/metrics'
import { expect } from 'chai'
import { afterEach, beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model: Metrics', () => {
  let sandbox: SinonSandbox
  let rawMetrics: Partial<Metrics>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawMetrics = {
      serviceName: 'aragon-dao',
      metricsData: '# HELP test_metric Test metric\n# TYPE test_metric counter\ntest_metric 1',
    }
  })

  afterEach(async () => {
    sandbox?.restore()
    await Models.Metrics.deleteMany({})
  })

  it('Should create Metrics', async () => {
    const entityId = Models.Metrics.getEntityId(rawMetrics.serviceName!)
    const metrics = await Models.Metrics.create(rawMetrics)
    expect(metrics.id).to.eq(entityId)
    expect(metrics.serviceName).to.eq(rawMetrics.serviceName)
    expect(metrics.metricsData).to.eq(rawMetrics.metricsData)
  })

  it('Should getEntityId', () => {
    const serviceName = 'aragon-indexer'
    const entityId = Models.Metrics.getEntityId(serviceName)
    expect(entityId).to.eq(`metrics-${serviceName}`)
  })

  it('Should findByServiceName', async () => {
    const createdMetrics = await Models.Metrics.create(rawMetrics)
    const foundMetrics = await Models.Metrics.findByServiceName(rawMetrics.serviceName!)
    expect(foundMetrics?.id).to.eq(createdMetrics.id)
    expect(foundMetrics?.serviceName).to.eq(rawMetrics.serviceName)
  })

  it('Should return null when service not found', async () => {
    const foundMetrics = await Models.Metrics.findByServiceName('non-existent-service')
    expect(foundMetrics).to.be.null
  })

  it('Should findAllMetrics', async () => {
    await Models.Metrics.create(rawMetrics)
    await Models.Metrics.create({
      serviceName: 'aragon-indexer',
      metricsData: '# HELP test_metric2\ntest_metric2 2',
    })
    await Models.Metrics.create({
      serviceName: 'aragon-transfers',
      metricsData: '# HELP test_metric3\ntest_metric3 3',
    })

    const allMetrics = await Models.Metrics.findAllMetrics()
    expect(allMetrics).to.have.lengthOf(3)
  })

  it('Should update Metrics', async () => {
    const metrics = await Models.Metrics.create(rawMetrics)
    const newMetricsData = '# HELP updated_metric\nupdated_metric 100'
    const updatedMetrics = await metrics.update({
      metricsData: newMetricsData,
    })
    expect(updatedMetrics.metricsData).to.eq(newMetricsData)
    expect(updatedMetrics.serviceName).to.eq(rawMetrics.serviceName)
  })

  it('Should not update required field with falsy value', async () => {
    const metrics = await Models.Metrics.create(rawMetrics)
    const originalServiceName = metrics.serviceName

    await metrics.update({
      serviceName: null as any,
    })

    expect(metrics.serviceName).to.eq(originalServiceName)
  })

  it('Should skip update when field does not exist in schema', async () => {
    const metrics = await Models.Metrics.create(rawMetrics)

    await metrics.update({
      nonExistentField: 'some value',
    } as any)

    expect(metrics).to.exist
  })

  it('Should reload', async () => {
    const createdMetrics = await Models.Metrics.create(rawMetrics)
    await createdMetrics.reload()

    expect(createdMetrics.serviceName).to.eq(rawMetrics.serviceName)
    expect(createdMetrics.metricsData).to.eq(rawMetrics.metricsData)
  })

  it('Should handle multiple updates to same service', async () => {
    const metrics = await Models.Metrics.create(rawMetrics)

    const update1 = '# HELP metric1\nmetric1 10'
    await metrics.update({ metricsData: update1 })
    expect(metrics.metricsData).to.eq(update1)

    const update2 = '# HELP metric2\nmetric2 20'
    await metrics.update({ metricsData: update2 })
    expect(metrics.metricsData).to.eq(update2)

    expect(metrics.serviceName).to.eq(rawMetrics.serviceName)
  })

  it('Should enforce unique serviceName', async () => {
    await Models.Metrics.create(rawMetrics)

    try {
      await Models.Metrics.create(rawMetrics)
      expect.fail('Should have thrown duplicate key error')
    } catch (error: any) {
      expect(error.code).to.eq(11000)
    }
  })

  it('Should handle large metricsData', async () => {
    const largeMetricsData = Array(1000)
      .fill('# HELP test_metric Test metric\n# TYPE test_metric counter\ntest_metric{label="value"} 1\n')
      .join('')
    const metrics = await Models.Metrics.create({
      serviceName: 'aragon-gateway',
      metricsData: largeMetricsData,
    })
    expect(metrics.metricsData).to.eq(largeMetricsData)
  })
})
