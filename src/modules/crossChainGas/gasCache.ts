/**
 * Rules on top of the `CrossChainGasCache` model.
 */

import config from '@config'
import { Models } from '@dbModels'
import * as Errors from '@errors'
import logger from '@logger'
import { ErrorKeyEnum, type ICrossChainGasEstimate, type NetworksEnum } from '@types'
import { getAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'cross-chain-gas-cache' })

/**
 * Count one paid simulation. Controller bucket first, then the global one.
 *
 * `false` means a bucket is full. A cache that cannot be reached throws instead - see the catch.
 */
async function consumeSimulationBudget(
  network: NetworksEnum,
  controllerAddress: string,
  now: number,
): Promise<boolean> {
  try {
    const controller = getAddress(controllerAddress)

    const controllerAllowed = await Models.CrossChainGasCache.consumeBudget(
      Models.CrossChainGasCache.controllerBudgetId(network, controller, now),
      config.CROSS_CHAIN_GAS.BUDGET_PER_CONTROLLER_PER_HOUR,
      now,
    )

    if (!controllerAllowed) {
      logger.warn('Cross-chain gas: controller hourly budget exhausted', llo({ network, controllerAddress }))
      return false
    }

    const globalAllowed = await Models.CrossChainGasCache.consumeBudget(
      Models.CrossChainGasCache.globalBudgetId(now),
      config.CROSS_CHAIN_GAS.BUDGET_GLOBAL_PER_HOUR,
      now,
    )

    if (!globalAllowed) {
      logger.warn('Cross-chain gas: global hourly budget exhausted', llo({ network, controllerAddress }))
      return false
    }

    return true
  } catch (error) {
    // Fail closed. The budget is the only cap on what this endpoint can spend on Tenderly, so a
    // cache that cannot be read must stop the run, not wave it through. `tooBusy` and not the
    // budget key: nobody's budget ran out, the counter is simply unreadable right now.
    logger.error('Cross-chain gas: budget check failed, refusing the simulation', llo({ error }))
    Errors.throwExposable(ErrorKeyEnum.tooBusy)

    // Never reached, `throwExposable` always throws. Only here so the signature stays `boolean`.
    return false
  }
}

/** Read a stored measurement. `fresh` says if it is still inside the ttl. */
async function readSharedEstimate(
  key: string,
  now: number,
): Promise<{ result: ICrossChainGasEstimate; fresh: boolean } | null> {
  try {
    return await Models.CrossChainGasCache.readEstimate(key, now)
  } catch (error) {
    logger.error('Cross-chain gas: shared cache read failed', llo({ error }))
    return null
  }
}

async function writeSharedEstimate(key: string, result: ICrossChainGasEstimate, now: number): Promise<void> {
  try {
    await Models.CrossChainGasCache.writeEstimate(
      key,
      result,
      now,
      config.CROSS_CHAIN_GAS.CACHE_TTL,
      config.CROSS_CHAIN_GAS.STALE_WINDOW,
    )
  } catch (error) {
    logger.error('Cross-chain gas: shared cache write failed', llo({ error }))
  }
}

export default {
  consumeSimulationBudget,
  readSharedEstimate,
  writeSharedEstimate,
}
