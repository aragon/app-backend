/**
 * Rules on top of the `TenderlyCallCache` model.
 */

import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import { type ICrossChainGasEstimate, ITenderlyOperation } from '@types'

const llo = logger.logMeta.bind(null, { service: 'cross-chain-gas-cache' })

/** Read a stored measurement. `fresh` says if it is still inside the ttl. */
async function readSharedEstimate(
  key: string,
  now: number,
): Promise<{ result: ICrossChainGasEstimate; fresh: boolean } | null> {
  try {
    return await Models.TenderlyCallCache.readResult(ITenderlyOperation.crossChainGas, key, now)
  } catch (error) {
    logger.error('Cross-chain gas: shared cache read failed', llo({ error }))
    return null
  }
}

async function writeSharedEstimate(key: string, result: ICrossChainGasEstimate, now: number): Promise<void> {
  try {
    await Models.TenderlyCallCache.writeResult(
      ITenderlyOperation.crossChainGas,
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
  readSharedEstimate,
  writeSharedEstimate,
}
