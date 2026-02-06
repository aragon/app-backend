import config from '@config'
import { Models } from '@dbModels'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'modules:ReorgDetector' })

export interface IReorgResult {
  reorgedBlocks: Array<{
    blockNumber: number
    storedHash: string
    finalizedHash: string
  }>
  newBlocks: number[]
  unchangedBlocks: number[]
}

const ReorgDetector = {
  async checkForReorgs(network: NetworksEnum, fromBlock: number, toBlock: number): Promise<IReorgResult> {
    const result: IReorgResult = {
      reorgedBlocks: [],
      newBlocks: [],
      unchangedBlocks: [],
    }

    const storedRecords = await Models.BlockRecord.findByBlockRange(network, fromBlock, toBlock)
    const storedMap = new Map<number, string>(storedRecords.map(r => [r.blockNumber, r.blockHash as string]))

    for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber++) {
      const storedHash = storedMap.get(blockNumber)

      if (!storedHash) {
        // No BlockRecord = we never processed events for this block from latest
        // If finalized chain has events here, they are new (from reorg)
        result.newBlocks.push(blockNumber)
        continue
      }

      const finalizedBlock = await Web3Helper.getBlock(blockNumber, network)
      if (!finalizedBlock) {
        logger.warn('Could not fetch finalized block', llo({ network, blockNumber }))
        continue
      }

      if (storedHash === finalizedBlock.hash) {
        result.unchangedBlocks.push(blockNumber)
      } else {
        result.reorgedBlocks.push({
          blockNumber,
          storedHash: storedHash!,
          finalizedHash: finalizedBlock.hash!,
        })
      }
    }

    if (result.reorgedBlocks.length > 0) {
      logger.warn(
        'Reorgs detected',
        llo({
          network,
          fromBlock,
          toBlock,
          reorgedCount: result.reorgedBlocks.length,
          newCount: result.newBlocks.length,
          unchangedCount: result.unchangedBlocks.length,
        }),
      )
    }

    return result
  },

  async getLastFinalizedBlock(network: NetworksEnum): Promise<number | null> {
    const block = await Web3Helper.getBlockByTag('finalized', network)
    if (block?.number && block.number > 0) {
      return block.number
    }

    // Fallback for chains where 'finalized' tag is not supported (e.g. Chiliz via Ankr returns block 0)
    const latestBlock = await Web3Helper.getBlockByTag('latest', network)
    if (!latestBlock?.number) return null

    const networkKey = utils.networkToAragon(network)
    const finalityBlocks = config.SERVICES.ARAGON_REORGS.FINALIZED_OFFSET_BLOCKS[networkKey]
    if (!finalityBlocks) {
      logger.warn('No FINALIZED_OFFSET_BLOCKS configured for network', llo({ network, networkKey }))
      return null
    }
    const fallbackBlock = latestBlock.number - finalityBlocks
    logger.verbose(
      'Using latest - finalizedOffsetBlocks as finalized fallback',
      llo({ network, latestBlock: latestBlock.number, finalizedOffsetBlocks: finalityBlocks, fallbackBlock }),
    )
    return fallbackBlock
  },

  async updateBlockRecordHashes(
    network: NetworksEnum,
    blocks: Array<{ blockNumber: number; blockHash: string }>,
  ): Promise<void> {
    try {
      const records = blocks.map(b => ({
        network,
        blockNumber: b.blockNumber,
        blockHash: b.blockHash,
      }))
      await Models.BlockRecord.bulkUpsert(records)
    } catch (error) {
      logger.error('Error updating block record hashes', llo({ network, error }))
    }
  },

  getBlockRangeForCheck(lastFinalizedBlock: number, lastCheckedBlock: number): { fromBlock: number; toBlock: number } {
    const reorgDepth = config.SERVICES.ARAGON_REORGS.REORG_DEPTH
    const batchSize = config.SERVICES.ARAGON_REORGS.BATCH_SIZE

    const fromBlock = Math.max(lastCheckedBlock + 1, lastFinalizedBlock - reorgDepth)
    const toBlock = Math.min(fromBlock + batchSize - 1, lastFinalizedBlock)

    return { fromBlock, toBlock }
  },
}

export default ReorgDetector
