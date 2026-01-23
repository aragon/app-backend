import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'modules:ReorgDetector' })

export interface IReorgDetectionResult {
  reorgDetected: boolean
  reorgedBlockNumber?: number
  reorgDepth?: number
  expectedHash?: string
  actualParentHash?: string
}

export class ReorgDetector {
  private readonly network: NetworksEnum
  private readonly service: string
  private readonly maxDepth: number

  constructor(network: NetworksEnum, service: string, maxDepth = 10) {
    this.network = network
    this.service = service
    this.maxDepth = maxDepth
  }

  /**
   * Record block verification after processing a block
   */
  async recordBlock(blockNumber: number): Promise<void> {
    try {
      const block = await Web3Helper.getBlock(blockNumber, this.network)
      if (!block || !block.hash || !block.parentHash) {
        logger.warn('Could not fetch block for verification', llo({ blockNumber, network: this.network }))
        return
      }

      await Models.BlockVerification.upsert({
        network: this.network,
        blockNumber,
        blockHash: block.hash,
        parentHash: block.parentHash,
      })

      logger.verbose(
        'Recorded block verification',
        llo({
          network: this.network,
          service: this.service,
          blockNumber,
          blockHash: block.hash.slice(0, 18) + '...',
        }),
      )
    } catch (error) {
      logger.error(
        'Error recording block verification',
        llo({
          blockNumber,
          network: this.network,
          error: (error as Error).message,
        }),
      )
    }
  }

  /**
   * Detect reorg by checking if current block's parentHash matches previous block's hash
   * If mismatch found, walks back up to maxDepth blocks to find the fork point
   */
  async detectReorg(currentBlockNumber: number): Promise<IReorgDetectionResult> {
    try {
      const prevBlockNumber = currentBlockNumber - 1
      const prevRecord = await Models.BlockVerification.findByBlock(this.network, prevBlockNumber)

      if (!prevRecord) {
        return { reorgDetected: false }
      }

      const currentBlock = await Web3Helper.getBlock(currentBlockNumber, this.network)
      if (!currentBlock || !currentBlock.parentHash) {
        return { reorgDetected: false }
      }

      if (currentBlock.parentHash !== prevRecord.blockHash) {
        const forkPoint = await this.findForkPoint(currentBlockNumber)
        const reorgDepth = forkPoint ? currentBlockNumber - forkPoint : 1

        const canonicalPrevBlock = await Web3Helper.getBlock(prevBlockNumber, this.network)
        if (canonicalPrevBlock?.hash && canonicalPrevBlock?.parentHash) {
          await prevRecord.updateCanonicalHash(canonicalPrevBlock.hash, canonicalPrevBlock.parentHash)
        } else {
          await prevRecord.markReorged()
        }

        logger.error(
          'REORG DETECTED',
          llo({
            network: this.network,
            service: this.service,
            reorgedBlockNumber: prevBlockNumber,
            reorgDepth,
            forkPoint,
            expectedHash: prevRecord.blockHash,
            actualParentHash: currentBlock.parentHash,
            currentBlockNumber,
          }),
        )

        return {
          reorgDetected: true,
          reorgedBlockNumber: prevBlockNumber,
          reorgDepth,
          expectedHash: prevRecord.blockHash,
          actualParentHash: currentBlock.parentHash,
        }
      }

      return { reorgDetected: false }
    } catch (error) {
      logger.error(
        'Error detecting reorg',
        llo({
          currentBlockNumber,
          network: this.network,
          error: (error as Error).message,
        }),
      )
      return { reorgDetected: false }
    }
  }

  /**
   * Walk back up to maxDepth blocks to find where the chain diverged
   */
  private async findForkPoint(currentBlockNumber: number): Promise<number | null> {
    try {
      for (let depth = 1; depth <= this.maxDepth; depth++) {
        const blockNumber = currentBlockNumber - depth
        const record = await Models.BlockVerification.findByBlock(this.network, blockNumber)

        if (!record) {
          return null // No more records to check
        }

        const canonicalBlock = await Web3Helper.getBlock(blockNumber, this.network)
        if (!canonicalBlock || !canonicalBlock.hash) {
          continue
        }

        if (canonicalBlock.hash === record.blockHash) {
          return blockNumber
        }

        if (canonicalBlock.parentHash) {
          await record.updateCanonicalHash(canonicalBlock.hash, canonicalBlock.parentHash)
        } else {
          await record.markReorged()
        }
      }

      // Couldn't find fork point within maxDepth
      logger.warn(
        'Reorg depth exceeds maxDepth',
        llo({
          network: this.network,
          service: this.service,
          maxDepth: this.maxDepth,
          currentBlockNumber,
        }),
      )
      return null
    } catch (error) {
      logger.error(
        'Error finding fork point',
        llo({
          currentBlockNumber,
          network: this.network,
          error: (error as Error).message,
        }),
      )
      return null
    }
  }

  /**
   * Find all reorged blocks for this network
   */
  async getReorgedBlocks() {
    return await Models.BlockVerification.findReorgedBlocks(this.network)
  }
}
