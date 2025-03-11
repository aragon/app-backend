import { Interface, type Log, type LogDescription } from 'ethers'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { type IIndexerConfig, type NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'modules:EventListener' })
const DEFAULT_BATCH_WINDOW_MS = 15_000

class EventListenerV2 {
  public network: NetworksEnum
  public configLogs: IIndexerConfig[]
  private blockBuffer: number[] = []
  private batchTimeout?: NodeJS.Timeout
  private isProcessing = false
  private readonly batchWindowMs: number

  constructor(network: NetworksEnum, configLogs: IIndexerConfig[], batchWindowMs = DEFAULT_BATCH_WINDOW_MS) {
    this.network = network
    this.configLogs = configLogs
    this.batchWindowMs = batchWindowMs
  }

  async handleEvent(txLog: Log) {
    try {
      const eventConfig = this.configLogs.find(item => item.topic === txLog.topics[0])
      if (!eventConfig) return

      let parsedEvent: LogDescription | null = null
      let matchingHandler: any = null

      for (const configItem of eventConfig.config) {
        const iFace = new Interface(configItem.abi)
        try {
          parsedEvent = Web3Helper.parseLog(txLog, iFace)
          if (parsedEvent) {
            matchingHandler = configItem.handler
            break
          }
        } catch (_) {
          // skip
        }
      }

      if (!parsedEvent) return

      const info = Web3Helper.parseInfoLog(txLog, parsedEvent.name, this.network)
      await matchingHandler?.(parsedEvent, info)
    } catch (error) {
      logger.error('Error handling eventListener', llo({ error, network: this.network, txLog }))
    }
  }

  subscribeEventsByNewBlock() {
    logger.verbose('Start batched real-time listening', llo({ network: this.network }))
    ProviderModule.subscribeToNewBlock(this.network, this.handleOnNewBlock.bind(this))
  }

  async handleOnNewBlock(blockNumber: number) {
    if (this.blockBuffer.includes(blockNumber)) return

    this.blockBuffer.push(blockNumber)
    this.scheduleBatchProcessing()
  }

  private scheduleBatchProcessing() {
    if (this.batchTimeout || this.isProcessing) return

    this.batchTimeout = setTimeout(async () => {
      await this.processBatch()
      this.batchTimeout = undefined
    }, this.batchWindowMs)
  }

  private async processBatch() {
    if (this.isProcessing || this.blockBuffer.length === 0) return

    this.isProcessing = true
    const blocks = [...new Set(this.blockBuffer)].sort((a, b) => a - b)
    this.blockBuffer = []

    try {
      const provider = ProviderModule.getAnyRpcProvider(this.network)
      const [fromBlock, toBlock] = [blocks[0], blocks[blocks.length - 1]]

      const logs = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(this.network)!.schedule(async () =>
          provider.getLogs({
            fromBlock: '0x' + fromBlock.toString(16),
            toBlock: '0x' + toBlock.toString(16),
          }),
        ),
      )

      if (!logs || logs.length === 0) return

      // Group logs by block number and sort blocks
      const blocksWithLogs = this.groupLogsByBlock(logs, blocks)

      // Process each block in order
      for (const { blockNumber, logs: blockLogs } of blocksWithLogs) {
        const sortedLogs = this.sortLogsByPriority(blockLogs)
        for (const log of sortedLogs) {
          await this.handleEvent(log)
        }
        await this.saveProgress(blockNumber, this.network)
      }
    } catch (error) {
      logger.error('Batch processing failed', llo({ error, network: this.network }))
      this.blockBuffer.push(...blocks) // Requeue blocks on failure
    } finally {
      this.isProcessing = false
      this.scheduleBatchProcessing()
    }
  }

  private groupLogsByBlock(logs: Log[], expectedBlocks: number[]) {
    const blockMap = new Map<number, Log[]>()

    for (const block of expectedBlocks) {
      blockMap.set(block, [])
    }

    for (const log of logs) {
      const blockNumber = Number(log.blockNumber)
      if (blockMap.has(blockNumber)) {
        blockMap.get(blockNumber)!.push(log)
      }
    }

    return Array.from(blockMap.entries()).map(([blockNumber, logs]) => ({
      blockNumber,
      logs,
      hasLogs: logs.length > 0,
    }))
  }

  private sortLogsByPriority(logs: Log[]) {
    const priorityTopics = this.configLogs.map(config => config.topic)
    return logs.sort((a, b) => priorityTopics.indexOf(a.topics[0]) - priorityTopics.indexOf(b.topics[0]))
  }

  async saveProgress(blockNumber: number, network: NetworksEnum) {
    try {
      await DbTx.executeTxFn(async ({ session }) => {
        const existingConfig = await Models.ConfigIndexer.findExistingLog(
          {
            network,
            service: `indexer-${network}`,
          },
          { session },
        )

        if (!existingConfig || existingConfig.lastSync >= blockNumber) {
          return false
        }

        await existingConfig.update({ lastSync: blockNumber }, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('update last block', llo({ blockNumber, network }))
      })
    } catch (error) {
      logger.error('Error saving progress - last block', llo({ error, blockNumber, network }))
    }
  }
}

export default EventListenerV2
