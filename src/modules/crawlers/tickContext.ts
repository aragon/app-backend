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

  private async prefetchBlockTimestamps(): Promise<void> {
    const blockNumbers = [...this.logsByBlock.keys()]
    if (blockNumbers.length === 0) return

    const from = Math.min(...blockNumbers)
    const to = Math.max(...blockNumbers)

    try {
      const timestamps = await Web3BatchHelper.getBlocksTimestamps(from, to, this.network)
      for (const [key, ts] of Object.entries(timestamps)) {
        const blockNumber = Number(key.split('-').pop())
        this.blockTimestamps.set(blockNumber, ts)
      }
    } catch (error) {
      logger.error('Error prefetching block timestamps', llo({ from, to, network: this.network, error }))
    }
  }

  async getBlockTimestamp(blockNumber: number): Promise<number> {
    const cached = this.blockTimestamps.get(blockNumber)
    if (cached !== undefined) return cached

    const ts = await Web3Helper.getBlockTimestamp(blockNumber, this.network)
    this.blockTimestamps.set(blockNumber, ts)
    return ts
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
