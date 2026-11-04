import config from '@config'
import { Models } from '@dbModels'
import * as Errors from '@errors'
import logger from '@logger'
import type TenderlyCallCache from '@models/schema/tenderlyCallCache'
import { ErrorKeyEnum, ITenderlyOperation } from '@types'
import { Counter, Gauge, type Registry } from 'prom-client'

const llo = logger.logMeta.bind(null, { service: 'tenderly:metrics' })

const TenderlyMetrics = {
  charged: new Counter({
    name: 'tenderly_budget_charged_total',
    help: 'Budget units consumed per operation, not Tenderly bills; a charge can still die on the deadline',
    labelNames: ['operation'],
    registers: [],
  }),
  refused: new Counter({
    name: 'tenderly_refused_total',
    help: 'Shared runs that ended in an error, including limit refusals served from a kept gas estimate',
    labelNames: ['operation', 'reason'],
    registers: [],
  }),

  register(registry: Registry) {
    for (const name of [
      'tenderly_budget_used',
      'tenderly_budget_limit',
      'tenderly_budget_scopes_active',
      'tenderly_budget_scopes_at_limit',
      'tenderly_metrics_collected_at_seconds',
      'tenderly_budget_charged_total',
      'tenderly_refused_total',
    ])
      registry.removeSingleMetric(name)

    TenderlyMetrics.charged.reset()
    TenderlyMetrics.refused.reset()
    registry.registerMetric(TenderlyMetrics.charged)
    registry.registerMetric(TenderlyMetrics.refused)
    for (const operation of Object.values(ITenderlyOperation)) {
      TenderlyMetrics.charged.inc({ operation }, 0)
      for (const reason of ['limit', 'busy', 'check_failed', 'failed']) {
        TenderlyMetrics.refused.inc({ operation, reason }, 0)
      }
    }

    let collected = Promise.resolve()
    new Gauge({
      name: 'tenderly_budget_used',
      help: 'Budget units consumed from the API-wide bucket this UTC hour, not Tenderly bills',
      labelNames: ['scope'],
      registers: [registry],
      collect() {
        this.reset()
        active.reset()
        atLimit.reset()
        collected = Models.TenderlyCallCache.hourBudgets(Date.now())
          .then(rows => {
            this.set({ scope: 'global' }, rows.find(row => row.id.split('|')[1] === 'global')?.count ?? 0)
            const scopes = TenderlyMetrics._scopes(rows)
            for (const scope of ['dao', 'controller'] as const) {
              active.set({ scope }, scopes[scope].active)
              atLimit.set({ scope }, scopes[scope].atLimit)
            }
            collectedAt.set(Date.now() / 1000)
          })
          .catch(error => {
            logger.warn('Tenderly metrics: budget read failed', llo({ error }))
          })
        return collected
      },
    })

    new Gauge({
      name: 'tenderly_budget_limit',
      help: 'Configured budget units per UTC hour for each scope',
      labelNames: ['scope'],
      registers: [registry],
      collect() {
        this.reset()
        this.set({ scope: 'global' }, config.TENDERLY.API_BUDGET_PER_HOUR)
        this.set({ scope: 'dao' }, config.TENDERLY.API_BUDGET_PER_DAO_PER_HOUR)
        this.set({ scope: 'controller' }, config.CROSS_CHAIN_GAS.BUDGET_PER_CONTROLLER_PER_HOUR)
      },
    })

    const active = new Gauge({
      name: 'tenderly_budget_scopes_active',
      help: 'DAO operation and network buckets or controller buckets with units consumed this UTC hour',
      labelNames: ['scope'],
      registers: [registry],
      collect: () => collected,
    })
    const atLimit = new Gauge({
      name: 'tenderly_budget_scopes_at_limit',
      help: 'DAO or controller buckets at or over their limit this UTC hour',
      labelNames: ['scope'],
      registers: [registry],
      collect: () => collected,
    })
    const collectedAt = new Gauge({
      name: 'tenderly_metrics_collected_at_seconds',
      help: 'Unix time of the last successful budget read',
      registers: [registry],
      collect: () => collected,
    })
    collectedAt.remove()
  },

  reason(error: unknown) {
    if (!Errors.isExposableError(error)) return 'failed'
    switch (error.message) {
      case ErrorKeyEnum.simulationBudgetExhausted:
      case ErrorKeyEnum.crossChainGasBudgetExhausted:
        return 'limit'
      case ErrorKeyEnum.tooBusy:
        return 'busy'
      case ErrorKeyEnum.simulationBudgetCheckFailed:
        return 'check_failed'
      default:
        return 'failed'
    }
  },

  async track<T>(operation: ITenderlyOperation, work: () => Promise<T>): Promise<T> {
    try {
      return await work()
    } catch (error) {
      TenderlyMetrics.refused.inc({ operation, reason: TenderlyMetrics.reason(error) })
      throw error
    }
  },

  _scopes(rows: Pick<TenderlyCallCache, 'id' | 'count'>[]) {
    const scopes = { dao: { active: 0, atLimit: 0 }, controller: { active: 0, atLimit: 0 } }
    for (const row of rows) {
      const kind = row.id.split('|')[1]
      if (kind === 'global' || row.count <= 0) continue
      const scope = kind === 'v1' ? 'dao' : 'controller'
      const limit =
        scope === 'dao'
          ? config.TENDERLY.API_BUDGET_PER_DAO_PER_HOUR
          : config.CROSS_CHAIN_GAS.BUDGET_PER_CONTROLLER_PER_HOUR
      scopes[scope].active++
      if (row.count >= limit) scopes[scope].atLimit++
    }
    return scopes
  },
}

export default TenderlyMetrics
