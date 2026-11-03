import { createHash } from 'node:crypto'
import config from '@config'
import { Models } from '@dbModels'
import * as Errors from '@errors'
import {
  ErrorKeyEnum,
  type ITenderlyActionInput,
  ITenderlyOperation,
  type ITenderlyRequestMap,
  type ITenderlyResult,
  type ITenderlyResultMap,
} from '@types'
import { isAddress, isHexString, MaxUint256 } from 'ethers'

const TenderlyCache = {
  key(operation: keyof ITenderlyRequestMap, input: ITenderlyActionInput): string {
    try {
      const actions = input.actions.map(action => {
        const value = BigInt(action.value || '0')
        Errors.assertExposable(
          isAddress(action.to) && isHexString(action.data || '0x', true) && value >= 0n && value <= MaxUint256,
          ErrorKeyEnum.badSimulationRequest,
        )
        return [action.to.toLowerCase(), value.toString(), (action.data || '0x').toLowerCase()]
      })
      const fields = [
        input.proposalId,
        input.network,
        input.daoAddress.toLowerCase(),
        input.from.toLowerCase(),
        actions,
        {
          ...(operation === ITenderlyOperation.dispatch ? { simulationType: 'full' } : { allowFailureMap: 0 }),
          gas: 8000000,
          gasPrice: '0',
          value: '0',
          save: true,
          saveIfFails: true,
        },
      ]
      return `cache|v1|${operation}|${createHash('sha256').update(JSON.stringify(fields)).digest('hex')}`
    } catch {
      Errors.throwExposable(ErrorKeyEnum.badSimulationRequest)
    }
  },

  async read<K extends keyof ITenderlyResultMap>(
    operation: K,
    id: string,
    now: number,
  ): Promise<ITenderlyResult<K> | null> {
    try {
      const cached = await Models.TenderlyCallCache.readResult(operation, id, now)
      return cached?.fresh ? cached.result : null
    } catch {
      return null
    }
  },

  async write<K extends keyof ITenderlyResultMap>(
    operation: K,
    id: string,
    result: ITenderlyResult<K>,
    now: number,
  ): Promise<void> {
    const ttl =
      operation === ITenderlyOperation.proposal ? config.TENDERLY.RE_SIMULATION_TIME : config.TENDERLY.CACHE_TTL
    try {
      await Models.TenderlyCallCache.writeResult(operation, id, result, now, ttl, 0)
    } catch {}
  },
}

export default TenderlyCache
