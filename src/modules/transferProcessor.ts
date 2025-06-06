import async from 'async'
import { ethers, Interface, type Log } from 'ethers'

const govTokenInterface = new Interface(['event Transfer(address indexed from, address indexed to, uint256 value)'])

interface TransferProcessorConfig {
  concurrency?: number
  chunkSize?: number
}

interface ProcessedTransferLog extends Log {
  logIndex: any
  fromAddress: string
  toAddress: string
  amount: bigint
  shardKey: string
}

interface ShardedChunk {
  shardKey: string
  logs: ProcessedTransferLog[]
}

type TransferHandler = (logs: ProcessedTransferLog[]) => Promise<void>

class TransferEventsProcessor {
  private readonly queue: async.QueueObject<ShardedChunk>
  private readonly config: Required<TransferProcessorConfig>
  private readonly transferHandler: TransferHandler

  constructor(transferHandler: TransferHandler, config: TransferProcessorConfig = {}) {
    this.config = {
      concurrency: config.concurrency ?? 10,
      chunkSize: config.chunkSize ?? 1000,
    }

    this.transferHandler = transferHandler
    this.queue = async.queue(this._worker.bind(this) as any, this.config.concurrency)
  }

  /**
   * Process transfer logs with address sharding for parallel execution
   */
  async processTransferLogs(logs: Log[]): Promise<void> {
    try {
      const processedLogs = this._decodeTransferLogs(logs)

      const shardedGroups = this._groupByAddressShards(processedLogs)

      await this._queueShardedChunks(shardedGroups)

      await this._waitForCompletion()
    } catch (error) {
      throw error
    }
  }

  /**
   * Queue worker - processes a chunk of transfers for a specific shard
   */
  private async _worker(chunk: ShardedChunk): Promise<void> {
    try {
      const sortedLogs = chunk.logs.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber
        if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex
        return a.logIndex - b.logIndex
      })

      await this.transferHandler(sortedLogs)
    } catch (error) {
      throw error
    }
  }

  /**
   * Decode transfer logs and extract from/to addresses
   */
  private _decodeTransferLogs(logs: Log[]): ProcessedTransferLog[] {
    const processedLogs: any[] = []

    for (const log of logs) {
      try {
        const decoded = govTokenInterface.parseLog(log)
        if (!decoded || decoded.name !== 'Transfer') continue

        const { from, to, value } = decoded.args
        const fromAddress = ethers.getAddress(from)
        const toAddress = ethers.getAddress(to)
        const tokenAddress = ethers.getAddress(log.address)
        const amount = BigInt(value.toString())

        // Create shard key: token and sorted addresses to ensure same shard for both directions
        const addresses = [fromAddress, toAddress].sort()
        const shardKey = `${tokenAddress}:${addresses[0]}:${addresses[1]}`

        processedLogs.push({
          fromAddress,
          toAddress,
          amount,
          shardKey,
          logIndex: log.index,
          ...log,
        })
      } catch (error) {
        // Skip invalid logs
        continue
      }
    }

    return processedLogs
  }

  /**
   * Group processed logs by shard key (token + address pair)
   */
  private _groupByAddressShards(logs: ProcessedTransferLog[]): Map<string, ProcessedTransferLog[]> {
    const shardGroups = new Map<string, ProcessedTransferLog[]>()

    for (const log of logs) {
      if (!shardGroups.has(log.shardKey)) {
        shardGroups.set(log.shardKey, [])
      }
      shardGroups.get(log.shardKey)!.push(log)
    }

    return shardGroups
  }

  /**
   * Create chunks from sharded groups and queue them for processing
   */
  private async _queueShardedChunks(shardGroups: Map<string, ProcessedTransferLog[]>): Promise<void> {
    for (const [shardKey, logs] of shardGroups) {
      // Split large shards into chunks
      const chunks = this._chunkArray(logs, this.config.chunkSize)

      for (const chunkLogs of chunks) {
        this.queue.push({
          shardKey,
          logs: chunkLogs,
        })
      }
    }
  }

  /**
   * Wait for all queue tasks to complete
   */
  private async _waitForCompletion(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.queue.idle()) {
        resolve()
        return
      }

      this.queue.error(error => {
        reject(error)
      })

      this.queue.drain(() => {
        resolve()
      })
    })
  }

  /**
   * Utility function to chunk arrays
   */
  private _chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize))
    }
    return chunks
  }

  /**
   * Get current queue statistics
   */
  getStats(): { queueLength: number; running: number; concurrency: number } {
    return {
      queueLength: this.queue.length(),
      running: this.queue.running(),
      concurrency: this.config.concurrency,
    }
  }

  destroy(): void {
    this.queue.kill()
  }
}

export default TransferEventsProcessor
