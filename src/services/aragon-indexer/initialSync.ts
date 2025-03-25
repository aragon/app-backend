import logger from '@logger'
import { type IInitailCrawlParams, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import configIndexer from '@indexer/configIndexer'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:SyncAll' })

export const InitialSync = {
  tokenEvents: ['Transfer', 'DelegateVotesChanged'],

  start: async (network: NetworksEnum, lastSyncBlock: number) => {
    logger.verbose(
      'Start InitialSync',
      llo({
        network,
        startTimestamp: Date.now(),
      }),
    )

    try {
      const currentBlockNumber = await Web3Helper.getBlockNumber('latest', network)

      // Run tasks sequentially to avoid resource contention
      await InitialSync.syncPluginEvents(network, lastSyncBlock, currentBlockNumber)
      await InitialSync.syncTransferEvents(network, lastSyncBlock, currentBlockNumber)

      logger.verbose(
        'Completed InitialSync',
        llo({
          network,
          lastSyncBlock,
          currentBlockNumber,
          endTimestamp: Date.now(),
        }),
      )
    } catch (error) {
      logger.error(
        'Error in InitialSync.start',
        llo({
          network,
          lastSyncBlock,
          error,
        }),
      )
    }
  },

  async syncPluginEvents(network: NetworksEnum, lastBlockNumber: number, toBlockNumber: number) {
    const pluginEvents = configIndexer
      .filter(eventConfig => eventConfig.enableHistorical === false)
      .filter(eventConfig => {
        return !InitialSync.tokenEvents.includes(eventConfig.event)
      })

    await InitialSync.processEventsWithChunking({
      network,
      events: pluginEvents,
      fromBlock: lastBlockNumber,
      toBlock: toBlockNumber,
      chunkSize: 100000,
      errorLabel: 'Plugin Events Sync',
    })
  },

  async syncTransferEvents(network: NetworksEnum, lastBlockNumber: number, toBlockNumber: number) {
    const tokenEvents = configIndexer.filter(eventConfig => InitialSync.tokenEvents.includes(eventConfig.event))

    await InitialSync.processEventsWithChunking({
      network,
      events: tokenEvents,
      fromBlock: lastBlockNumber,
      toBlock: toBlockNumber,
      chunkSize: 50000,
      errorLabel: 'Token Events Sync',
      forceChunking: true,
    })
  },

  async processEventsWithChunking(params: IInitailCrawlParams) {
    const {
      network,
      events,
      fromBlock,
      toBlock,
      chunkSize = 100000,
      errorLabel = 'Event Sync',
      forceChunking = false,
    } = params

    if (!network || !events) {
      return
    }

    const blockRange = toBlock - fromBlock
    const shouldChunk = forceChunking || blockRange > chunkSize

    if (!shouldChunk) {
      return InitialSync.executeCrawler({
        network,
        events,
        fromBlock,
        toBlock,
        errorLabel,
      })
    }

    logger.verbose(
      `Chunking ${errorLabel}`,
      llo({
        network,
        blockRange,
        chunkSize,
        chunks: Math.ceil(blockRange / chunkSize),
      }),
    )

    let processedChunks = 0
    const totalChunks = Math.ceil(blockRange / chunkSize)

    for (let chunkStart = fromBlock; chunkStart < toBlock; chunkStart += chunkSize) {
      const chunkEnd = Math.min(chunkStart + chunkSize - 1, toBlock)
      processedChunks++

      try {
        await InitialSync.executeCrawler({
          network,
          events,
          fromBlock: chunkStart,
          toBlock: chunkEnd,
          errorLabel: `${errorLabel} (${chunkStart}-${chunkEnd})`,
        })

        logger.verbose(
          `Chunk progress for ${errorLabel}`,
          llo({
            network,
            progress: `${processedChunks}/${totalChunks}`,
            percentage: Math.round((processedChunks / totalChunks) * 100),
            currentChunk: { start: chunkStart, end: chunkEnd },
          }),
        )
      } catch (error) {
        logger.error(
          `Error processing chunk in ${errorLabel}`,
          llo({
            network,
            chunkStart,
            chunkEnd,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      }
    }
  },

  async executeCrawler({ network, events, fromBlock, toBlock, errorLabel }: Partial<IInitailCrawlParams>) {
    if (!network || !events) {
      return
    }

    logger.verbose(
      `Starting crawler for ${errorLabel}`,
      llo({
        network,
        fromBlock,
        toBlock,
        eventsCount: events.length,
      }),
    )

    const crawler = new BlockchainLogCrawler({
      network,
      events,
      fromBlock,
      toBlock,
      onError: async error => {
        logger.error(
          `Error in ${errorLabel}`,
          llo({
            error,
          }),
        )
      },
      logService: null,
      stopOnError: false,
    })

    return crawler.crawl()
  },
}
