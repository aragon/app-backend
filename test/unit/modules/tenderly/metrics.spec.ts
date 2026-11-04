import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import TenderlyMetrics from '@modules/tenderly/metrics'
import { ITenderlyCallCacheKind } from '@types'
import { expect } from 'chai'
import { Registry } from 'prom-client'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const NOW = Date.UTC(2030, 0, 1, 12, 0, 0)
const HOUR = '2030-01-01T12'

describe('Module: tenderly/metrics', () => {
  let sandbox: SinonSandbox
  let registry: Registry
  let clock: sinon.SinonStub
  let warn: sinon.SinonStub

  const seed = async (rows: { id: string; count: number }[]) => {
    await Models.TenderlyCallCache.create(
      rows.map(row => ({ ...row, kind: ITenderlyCallCacheKind.budget, purgeAt: new Date(NOW + 7_200_000) })),
    )
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    clock = sandbox.stub(Date, 'now').returns(NOW)
    warn = sandbox.stub(logger, 'warn')
    sandbox.stub(config.TENDERLY, 'API_BUDGET_PER_HOUR').value(300)
    sandbox.stub(config.TENDERLY, 'API_BUDGET_PER_DAO_PER_HOUR').value(20)
    sandbox.stub(config.CROSS_CHAIN_GAS, 'BUDGET_PER_CONTROLLER_PER_HOUR').value(7)
    registry = new Registry()
    TenderlyMetrics.register(registry)
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('registers twice without throwing', () => {
    expect(() => TenderlyMetrics.register(registry)).to.not.throw()
    expect(registry.getMetricsAsArray()).to.have.length(5)
  })

  it('reports the current hour and all configured limits with one read', async () => {
    await seed([
      { id: `budget|global|${HOUR}`, count: 301 },
      { id: 'budget|global|2030-01-01T11', count: 99 },
    ])
    const read = sandbox.spy(Models.TenderlyCallCache, 'hourBudgets')

    const snapshot = await registry.metrics()

    expect(snapshot).to.include('tenderly_budget_used{scope="global"} 301\n')
    expect(snapshot).to.include('tenderly_budget_limit{scope="global"} 300\n')
    expect(snapshot).to.include('tenderly_budget_limit{scope="dao"} 20\n')
    expect(snapshot).to.include('tenderly_budget_limit{scope="controller"} 7\n')
    expect(read.calledOnceWithExactly(NOW)).to.equal(true)
  })

  it('reports zero when the hour has no buckets', async () => {
    const snapshot = await registry.metrics()

    expect(snapshot).to.include('tenderly_budget_used{scope="global"} 0\n')
    for (const scope of ['dao', 'controller']) {
      expect(snapshot).to.include(`tenderly_budget_scopes_active{scope="${scope}"} 0\n`)
      expect(snapshot).to.include(`tenderly_budget_scopes_at_limit{scope="${scope}"} 0\n`)
    }
  })

  it('counts active and full scope buckets and drops them at the next hour', async () => {
    await seed([
      ...[0, 19, 20, 21].map((count, index) => ({
        id: `budget|v1|proposal|ethereumMainnet|dao${index}|${HOUR}`,
        count,
      })),
      ...[0, 6, 7, 8].map((count, index) => ({
        id: `budget|ethereumMainnet|controller${index}|${HOUR}`,
        count,
      })),
      { id: 'budget|v1|proposal|ethereumMainnet|oldDao|2030-01-01T11', count: 20 },
      { id: 'budget|ethereumMainnet|oldController|2030-01-01T11', count: 7 },
    ])

    const snapshot = await registry.metrics()
    for (const scope of ['dao', 'controller']) {
      expect(snapshot).to.include(`tenderly_budget_scopes_active{scope="${scope}"} 3\n`)
      expect(snapshot).to.include(`tenderly_budget_scopes_at_limit{scope="${scope}"} 2\n`)
    }

    clock.returns(NOW + 3_600_000)
    const nextHour = await registry.metrics()
    expect(nextHour).to.include('tenderly_budget_used{scope="global"} 0\n')
    for (const scope of ['dao', 'controller']) {
      expect(nextHour).to.include(`tenderly_budget_scopes_active{scope="${scope}"} 0\n`)
      expect(nextHour).to.include(`tenderly_budget_scopes_at_limit{scope="${scope}"} 0\n`)
    }
  })

  it('stamps the time after the read succeeds', async () => {
    sandbox.stub(Models.TenderlyCallCache, 'hourBudgets').callsFake(async () => {
      clock.returns(NOW + 1000)
      return []
    })

    const snapshot = await registry.metrics()

    expect(snapshot).to.include(`tenderly_metrics_collected_at_seconds ${(NOW + 1000) / 1000}\n`)
  })

  it('drops usage series, keeps the old stamp and warns when the read fails', async () => {
    const read = sandbox.stub(Models.TenderlyCallCache, 'hourBudgets').resolves([
      { id: `budget|global|${HOUR}`, count: 5 },
      { id: `budget|v1|proposal|ethereumMainnet|dao|${HOUR}`, count: 20 },
    ])
    await registry.metrics()
    clock.returns(NOW + 1000)
    read.rejects(new Error('mongo down'))

    const snapshot = await registry.metrics()

    expect(snapshot).to.not.include('tenderly_budget_used{')
    expect(snapshot).to.not.include('tenderly_budget_scopes_active{')
    expect(snapshot).to.not.include('tenderly_budget_scopes_at_limit{')
    expect(snapshot).to.include(`tenderly_metrics_collected_at_seconds ${NOW / 1000}\n`)
    expect(snapshot).to.include('tenderly_budget_limit{scope="global"} 300\n')
    expect(warn.calledOnceWith('Tenderly metrics: budget read failed')).to.equal(true)
  })

  it('keeps the stamp absent until the first successful read', async () => {
    const read = sandbox.stub(Models.TenderlyCallCache, 'hourBudgets').rejects(new Error('mongo down'))

    expect(await registry.metrics()).to.not.match(/^tenderly_metrics_collected_at_seconds /m)
    read.resolves([])
    expect(await registry.metrics()).to.include(`tenderly_metrics_collected_at_seconds ${NOW / 1000}\n`)
  })
})
