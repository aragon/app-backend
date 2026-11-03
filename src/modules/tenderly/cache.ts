import { createHash } from 'node:crypto'
import config from '@config'
import { Models } from '@dbModels'
import * as Errors from '@errors'
import {
  ErrorKeyEnum,
  type ICrossChainGasAction,
  type ITenderlyActionInput,
  ITenderlyOperation,
  type ITenderlyRequestMap,
  type ITenderlyResult,
  type ITenderlyResultMap,
  type NetworksEnum,
} from '@types'
import { isAddress, isHexString, keccak256, MaxUint256, toUtf8Bytes } from 'ethers'

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

  crossChainGasKey(
    network: NetworksEnum,
    controllerAddress: string,
    destinationChainId: number,
    actions: ICrossChainGasAction[],
  ): string {
    const actionsHash = keccak256(
      toUtf8Bytes(
        JSON.stringify(
          actions.map(action => [action.to.toLowerCase(), action.value, (action.data || '0x').toLowerCase()]),
        ),
      ),
    )
    return `${network}|${controllerAddress.toLowerCase()}|${destinationChainId}|${actionsHash}`
  },

  async read<K extends keyof ITenderlyResultMap>(
    operation: K,
    id: string,
    now: number,
  ): Promise<ITenderlyResult<K> | null> {
    const retained = await TenderlyCache.readRetained(operation, id, now)
    return retained?.fresh ? retained.result : null
  },

  async readRetained<K extends keyof ITenderlyResultMap>(
    operation: K,
    id: string,
    now: number,
  ): Promise<{ result: ITenderlyResult<K>; fresh: boolean } | null> {
    try {
      return await Models.TenderlyCallCache.readResult(operation, id, now)
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
    let ttl = config.TENDERLY.CACHE_TTL
    if (operation === ITenderlyOperation.proposal) ttl = config.TENDERLY.RE_SIMULATION_TIME
    if (operation === ITenderlyOperation.crossChainGas) ttl = config.CROSS_CHAIN_GAS.CACHE_TTL
    const staleWindow = operation === ITenderlyOperation.crossChainGas ? config.CROSS_CHAIN_GAS.STALE_WINDOW : 0
    try {
      await Models.TenderlyCallCache.writeResult(operation, id, result, now, ttl, staleWindow)
    } catch {}
  },
}

export default TenderlyCache
