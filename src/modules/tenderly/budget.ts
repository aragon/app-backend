import config from '@config'
import { Models } from '@dbModels'
import * as Errors from '@errors'
import logger from '@logger'
import { ErrorKeyEnum, ITenderlyOperation, type ITenderlySendContext } from '@types'
import { getAddress } from 'ethers'
import TenderlyMetrics from './metrics'

const llo = logger.logMeta.bind(null, { service: 'tenderly-budget' })

const TenderlyBudget = {
  async consumeApiBudget(context: ITenderlySendContext, now: number): Promise<void> {
    const gas = context.operation === ITenderlyOperation.crossChainGas
    const store = Models.TenderlyCallCache
    const scopeId = gas
      ? store.controllerBudgetId(context.network, getAddress(context.controllerAddress), now)
      : `budget|v1|${context.operation}|${context.network}|${getAddress(TenderlyBudget._owner(context))}|${store.hourBucket(now)}`
    const limit = gas
      ? config.CROSS_CHAIN_GAS.BUDGET_PER_CONTROLLER_PER_HOUR
      : config.TENDERLY.API_BUDGET_PER_DAO_PER_HOUR
    const errorKey = gas ? ErrorKeyEnum.crossChainGasBudgetExhausted : ErrorKeyEnum.simulationBudgetExhausted

    Errors.assertExposable(Date.now() < context.deadlineAt, ErrorKeyEnum.tooBusy)
    // Known issue (APP-1446): the scope is charged before the API-wide bucket is checked, so when that bucket is full
    // the refused request still costs the scope one unit, and writes to its counter, though no run reaches Tenderly.
    Errors.assertExposable(await TenderlyBudget._consume(scopeId, limit, now), errorKey)
    Errors.assertExposable(Date.now() < context.deadlineAt, ErrorKeyEnum.tooBusy)
    Errors.assertExposable(
      await TenderlyBudget._consume(store.globalBudgetId(now), config.TENDERLY.API_BUDGET_PER_HOUR, now),
      errorKey,
    )
    TenderlyMetrics.charged.inc({ operation: context.operation })
  },

  /** Who pays: the DAO, or the Safe for a Safe run. Same per-hour limit for both. */
  _owner(context: Exclude<ITenderlySendContext, { operation: ITenderlyOperation.crossChainGas }>): string {
    return 'safeAddress' in context ? context.safeAddress : context.daoAddress
  },

  async _consume(id: string, limit: number, now: number): Promise<boolean> {
    try {
      return await Models.TenderlyCallCache.consumeBudget(id, limit, now)
    } catch (error) {
      logger.error('Tenderly: budget check failed, refusing the simulation', llo({ id, error }))
      Errors.throwExposable(ErrorKeyEnum.simulationBudgetCheckFailed)
    }
  },
}

export default TenderlyBudget
