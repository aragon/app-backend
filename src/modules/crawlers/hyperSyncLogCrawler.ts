import { type HypersyncClient } from '@envio-dev/hypersync-client'
import config from '@config'
import utils from '@helpers/utils'
import logger from '@logger'
import {
  type IHyperCrawlParam,
  type IHyperLogFilter,
  type IHyperLogSelection,
  type IHyperStreamConfig,
  type IHyperSyncStats,
  type IIndexerConfig,
  type NetworksEnum,
} from '@types'
import { type Log } from 'ethers'
import HyperSyncClientModule from './hyperSyncClient'
import { LogProcessingEngine } from './logProcessingEngine'
import { ProgressTracker } from './progressTracker'

const llo = logger.logMeta.bind(null, { service: 'modules:HyperSyncLogCrawler' })

// Only the columns our handlers actually read. Every extra field is bytes on the
// wire and, because the server sizes each response by bytes, fewer blocks per request.
const LOG_FIELDS = [
  'LogIndex',
  'TransactionIndex',
  'TransactionHash',
  'BlockNumber',
  'Address',
  'Data',
  'Topic0',
  'Topic1',
  'Topic2',
  'Topic3',
]
// Only blocks carrying a matched log are returned, so asking for timestamps costs
// almost nothing and saves the handlers a getBlock per block.
const BLOCK_FIELDS = ['Number', 'Timestamp']

/**
 * Fetches event logs from Envio HyperSync and hands them to LogProcessingEngine.
 *
 * Block boundaries are the thing to keep straight here. HyperSync ranges are
 * [fromBlock, toBlock) and `nextBlock` in a response is the first block NOT yet
 * scanned — the same meaning ConfigIndexer.lastSync carries. ProgressTracker.saveProgress
 * stores its argument + 1, so it gets `nextBlock - 1`.
 */
class HyperSyncLogCrawler {
  private readonly params: IHyperCrawlParam
  private readonly engine: LogProcessingEngine
  private readonly progressTracker?: ProgressTracker
  private readonly streamConfig: IHyperStreamConfig
  private readonly getClient: (network: NetworksEnum) => HypersyncClient

  private crawling = false
  private shutdown = false
  private stats: IHyperSyncStats = { nbSuccess: 0, nbError: 0, nbTotal: 0, lastSync: 0, batches: 0, scanned: 0 }

  constructor(params: IHyperCrawlParam, deps?: { getClient?: (network: NetworksEnum) => HypersyncClient }) {
    this.params = params
    this.getClient = deps?.getClient ?? HyperSyncClientModule.getClient

    this.engine = new LogProcessingEngine({
      events: params.events,
      isTopicObject: false,
      onlyHistorical: params.onlyHistorical,
      stopOnError: params.stopOnError,
      network: params.network,
      onError: params.onError,
    })

    if (params.logService) {
      this.progressTracker = new ProgressTracker({
        network: params.network,
        service: params.logService,
        initialBlock: params.fromBlock ?? config.NODES[utils.networkToAragon(params.network)].FROM_BLOCK,
      })
    }

    this.streamConfig = {
      concurrency: config.HYPERSYNC.CONCURRENCY,
      responseBytesTarget: config.HYPERSYNC.RESPONSE_BYTES_TARGET,
      ...params.streamConfig,
    }
  }

  /**
   * Stream every matching log from the resolved start block, in order, saving
   * progress after each batch is fully handled.
   */
  async crawl(): Promise<void> {
    if (this.crawling) throw new Error('Already crawling')

    this.crawling = true
    this.shutdown = false

    const { network, address, logService } = this.params
    const fromBlock = await this.getStartBlock()
    const query = this.buildQuery(fromBlock)

    logger.verbose('HyperSync crawl start', llo({ network, logService, fromBlock, toBlock: this.params.toBlock }))

    let stream
    try {
      stream = await this.getClient(network).stream(query as any, this.streamConfig as any)

      while (!this.shutdown) {
        const res = await stream.recv()
        if (res === null) break

        this.stats.batches++
        this.stats.scanned += res.data.logs?.length ?? 0

        let logs = HyperSyncLogCrawler.shapeLogs(res.data.logs ?? [])
        if (this.params.filterLogs && logs.length > 0) {
          logs = await this.params.filterLogs(logs)
        }

        if (logs.length > 0) {
          const sorted = this.engine.sortLogs(logs)
          this.engine.updateTotalCount(sorted.length)
          await this.engine.processLogs(
            sorted,
            {
              fromBlock: query.fromBlock,
              toBlock: res.nextBlock - 1,
              latestBlock: res.archiveHeight ?? 0,
              blockTimestamps: HyperSyncLogCrawler.blockTimestamps(res.data.blocks),
            },
            // No strategy: the engine only calls TickContext.init() for the realtime
            // RPC strategies, and init() would fetch block timestamps we just seeded.
            undefined,
            Array.isArray(address) ? address.join(',') : (address as string | undefined),
            logService || undefined,
          )

          const stats = this.engine.getProcessingStats()
          this.stats.nbSuccess = stats.nbSuccess
          this.stats.nbError = stats.nbError
          this.stats.nbTotal = stats.nbTotal
          this.stats.lastSync = stats.lastSync
        }

        // Only after the batch is fully handled — a crash mid-batch replays it.
        await this.progressTracker?.saveProgress(res.nextBlock - 1)

        logger.verbose(
          'HyperSync batch',
          llo({
            network,
            logService,
            nextBlock: res.nextBlock,
            archiveHeight: res.archiveHeight,
            matched: logs.length,
            scanned: this.stats.scanned,
            // Captured for reorg work later; nothing acts on it yet.
            rollbackGuard: res.rollbackGuard?.blockNumber,
          }),
        )
      }

      logger.verbose('HyperSync crawl end', llo({ network, logService, ...this.stats }))
    } catch (error: any) {
      this.shutdown = true
      this.stats.nbError++
      logger.error('HyperSync crawl failed', llo({ network, logService, error: error?.message }))
      this.params.onError(error instanceof Error ? error : new Error(String(error)))
    } finally {
      await stream?.close().catch(() => {})
      this.crawling = false
    }
  }

  /**
   * Where to resume. ConfigIndexer.lastSync is already the first unscanned block,
   * which is what HyperSync wants as an inclusive fromBlock — no conversion here.
   */
  async getStartBlock(): Promise<number> {
    if (this.progressTracker) {
      const { block } = await this.progressTracker.getStartingBlock()
      return block
    }
    return this.params.fromBlock ?? config.NODES[utils.networkToAragon(this.params.network)].FROM_BLOCK
  }

  buildQuery(fromBlock: number) {
    return {
      fromBlock,
      // Exclusive upper bound, HyperSync's convention. Omitted means "to the head".
      ...(this.params.toBlock ? { toBlock: this.params.toBlock } : {}),
      logs: this.buildLogSelections(),
      fieldSelection: { log: LOG_FIELDS, block: BLOCK_FIELDS },
    } as any
  }

  /**
   * The query's log selections, which the server ORs together.
   *
   * `logSelections` passes through untouched, so positional topics, per-selection
   * addresses and exclude filters all reach the server. The default without it is
   * every configured topic0, narrowed by `address` when one is given.
   */
  buildLogSelections(): Array<IHyperLogFilter | IHyperLogSelection> {
    if (this.params.logSelections?.length) return this.params.logSelections

    const topics = this.engine.buildTopics(this.params.events as IIndexerConfig[])
    const addresses = this.params.address
      ? Array.isArray(this.params.address)
        ? (this.params.address as string[])
        : [this.params.address as string]
      : undefined

    return [{ ...(addresses ? { address: addresses } : {}), topics: [topics] }]
  }

  /**
   * An address as a 32-byte topic value, for matching an indexed address argument —
   * e.g. `topics: [[transferTopic], [], [asTopic(dao)]]` for transfers into a DAO.
   */
  static asTopic(value: string): string {
    return `0x${value.replace(/^0x/, '').toLowerCase().padStart(64, '0')}`
  }

  /**
   * HyperSync logs into the ethers Log shape the processing engine expects.
   *
   * Two traps: HyperSync pads `topics` to four entries with nulls and
   * Interface.parseLog throws on those, and the log index is read as `index` by
   * sortLogs but as `index ?? logIndex` by parseInfoLog — hence both.
   */
  static shapeLogs(raw: any[]): Log[] {
    return raw.map(
      log =>
        ({
          address: log.address,
          data: log.data ?? '0x',
          topics: (log.topics ?? []).filter((topic: any) => !!topic),
          blockNumber: Number(log.blockNumber),
          transactionHash: log.transactionHash,
          transactionIndex: Number(log.transactionIndex),
          index: Number(log.logIndex),
          logIndex: Number(log.logIndex),
          removed: false,
        }) as unknown as Log,
    )
  }

  /** blockNumber -> timestamp for the blocks a batch returned. */
  static blockTimestamps(blocks: any[] = []): Map<number, number> {
    const timestamps = new Map<number, number>()
    for (const block of blocks) timestamps.set(Number(block.number), Number(block.timestamp))
    return timestamps
  }

  async end(): Promise<void> {
    await this.progressTracker?.markAsEnded()
  }

  stop(): void {
    this.shutdown = true
  }

  getStats(): IHyperSyncStats {
    return { ...this.stats }
  }
}

export { HyperSyncLogCrawler }
