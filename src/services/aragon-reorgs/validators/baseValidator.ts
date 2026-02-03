import logger from '@logger'
import { type ILogInfo, type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'reorgs:validators' })

export type ValidatorFn = (parsedEvent: LogDescription, info: ILogInfo) => Promise<void>

export interface IReorgValidatorConfig {
  event: string
  topic: string | string[]
  config: Array<{
    abi: any[]
    validator: ValidatorFn
  }>
}

export function logValid(eventName: string, info: ILogInfo, extra?: Record<string, any>): void {
  logger.verbose(`${eventName}: valid`, llo({ ...info, ...extra }))
}

export function logMismatch(eventName: string, info: ILogInfo, extra?: Record<string, any>): void {
  logger.error(`${eventName}: blockNumber mismatch`, llo({ ...info, ...extra }))
}

export function logNotFound(eventName: string, info: ILogInfo, extra?: Record<string, any>): void {
  logger.error(`${eventName}: record not found`, llo({ ...info, ...extra }))
}

export function logCumulative(eventName: string, info: ILogInfo, extra?: Record<string, any>): void {
  logger.error(`${eventName}: cumulative event in reorged block`, llo({ ...info, ...extra }))
}

export function logOrphan(collectionName: string, network: NetworksEnum, id: string, blockNumber: number): void {
  logger.error(`Orphan ${collectionName} detected`, llo({ network, id, blockNumber }))
}
