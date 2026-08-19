import Web3Helper from '@helpers/web3'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import logger from '@logger'
import type { NetworksEnum } from '@types'
import type { Log } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'modules:TickContext' })

export class TickContext {
  private readonly network: NetworksEnum
  private readonly rawLogs: Log[]
  private logsByBlock = new Map<number, Log[]>()
  private logsByTxHash = new Map<string, Log[]>()
  private blockTimestamps = new Map<number, number>()
  private cache = new Map<string, any>()
  private initialized = false

  constructor(network: NetworksEnum, logs: Log[]) {
    this.network = network
    this.rawLogs = logs
  }

  async init(): Promise<void> {
    if (this.initialized) return

    for (const log of this.rawLogs) {
      const blockLogs = this.logsByBlock.get(log.blockNumber) || []
      blockLogs.push(log)
      this.logsByBlock.set(log.blockNumber, blockLogs)

      const txLogs = this.logsByTxHash.get(log.transactionHash) || []
      txLogs.push(log)
      this.logsByTxHash.set(log.transactionHash, txLogs)
    }

    await this.prefetchBlockTimestamps()
    this.initialized = true
  }

  /**
   * Take block timestamps the caller already has, so they are not fetched again.
   * Existing entries win — a seed never overwrites something already resolved.
   */
  seedBlockTimestamps(timestamps: Map<number, number>): void {
    for (const [blockNumber, timestamp] of timestamps) {
      if (!this.blockTimestamps.has(blockNumber)) this.blockTimestamps.set(blockNumber, timestamp)
    }
  }

  private async prefetchBlockTimestamps(): Promise<void> {
    // Seeded blocks are already answered, so only the rest costs a request.
    const blockNumbers = [...this.logsByBlock.keys()].filter(bn => !this.blockTimestamps.has(bn))
    if (blockNumbers.length === 0) return

    try {
      const timestamps = await Web3BatchHelper.getBlocksTimestamps(blockNumbers, this.network)
      for (const [bn, ts] of timestamps) this.blockTimestamps.set(bn, ts)
    } catch (error) {
      logger.error(
        'Error prefetching block timestamps',
        llo({ count: blockNumbers.length, network: this.network, error }),
      )
    }
  }

  async getBlockTimestamp(blockNumber: number): Promise<number> {
    const cached = this.blockTimestamps.get(blockNumber)
    if (cached !== undefined) return cached

    const ts = await Web3Helper.getBlockTimestamp(blockNumber, this.network)
    this.blockTimestamps.set(blockNumber, ts)
    return ts
  }

  async getBlockTimestamps(blockNumbers: number[]): Promise<Map<number, number>> {
    const uncached = blockNumbers.filter(bn => !this.blockTimestamps.has(bn))
    if (uncached.length > 0) {
      const fetched = await Web3BatchHelper.getBlocksTimestamps(uncached, this.network)
      for (const [bn, ts] of fetched) this.blockTimestamps.set(bn, ts)
    }
    const result = new Map<number, number>()
    for (const bn of blockNumbers) {
      const ts = this.blockTimestamps.get(bn)
      if (ts !== undefined) result.set(bn, ts)
    }
    return result
  }

  getLogsByBlock(blockNumber: number): Log[] {
    return this.logsByBlock.get(blockNumber) || []
  }

  async getLogsByTxHash(txHash: string): Promise<Log[]> {
    const cached = this.logsByTxHash.get(txHash)
    if (cached) return cached

    const receipt = await Web3Helper.getTransactionReceipt(txHash, this.network)
    if (receipt) {
      this.logsByTxHash.set(txHash, receipt.logs as unknown as Log[])
      return receipt.logs as unknown as Log[]
    }
    return []
  }

  async getOrFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    if (this.cache.has(key)) return this.cache.get(key) as T
    const value = await fetcher()
    this.cache.set(key, value)
    return value
  }

  toJSON() {
    return { initialized: this.initialized, network: this.network, logs: this.rawLogs.length }
  }

  clear(): void {
    this.logsByBlock.clear()
    this.logsByTxHash.clear()
    this.blockTimestamps.clear()
    this.cache.clear()
    this.initialized = false
  }
}
