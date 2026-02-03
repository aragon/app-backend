import config from '@config'
import { Models } from '@dbModels'
import { NetworkHelper } from '@helpers/network'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { ProgressTracker } from '@modules/crawlers/progressTracker'
import ReorgDetector from '@modules/reorgDetector'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import {
  type IFormattedLog,
  type IIndexerConfig,
  IndexerType,
  EnumConnection,
  EnumServiceName,
  type IService,
  type NetworksEnum,
  type ReorgsLogService,
} from '@types'
import ReorgEventConfig from './configIndexer'
import { logOrphan } from './validators'

const llo = logger.logMeta.bind(null, { service: 'service:AragonReorgsService' })

// Build IIndexerConfig[] from ReorgEventConfig for the BlockchainLogCrawler
// The crawler's formatLog matches topics, parses ABIs, and returns { event, info, handler (=validator) }
const crawlerEvents: IIndexerConfig[] = ReorgEventConfig.map(reorgConfig => ({
  event: reorgConfig.event,
  topic: reorgConfig.topic,
  config: reorgConfig.config.map(c => ({
    abi: c.abi,
    handler: c.validator as any,
  })),
}))

function getLogServiceKey(network: NetworksEnum): ReorgsLogService {
  return `${IndexerType.reorgs}-${network}` as ReorgsLogService
}

// Collections to check for orphan records in reorged blocks
const orphanCollections = [
  { model: () => Models.Proposal, name: 'Proposal' },
  { model: () => Models.Vote, name: 'Vote' },
  { model: () => Models.DaoPermission, name: 'DaoPermission' },
  { model: () => Models.Setting, name: 'Setting' },
  { model: () => Models.LogPluginSetupProcessor, name: 'LogPluginSetupProcessor' },
  { model: () => Models.LogMetadata, name: 'LogMetadata' },
  { model: () => Models.SelectorPermission, name: 'SelectorPermission' },
  { model: () => Models.Campaign, name: 'Campaign' },
  { model: () => Models.Gauge, name: 'Gauge' },
  { model: () => Models.VoteGauge, name: 'VoteGauge' },
  { model: () => Models.PluginRepo, name: 'PluginRepo' },
]

async function detectOrphans(network: NetworksEnum, reorgedBlockNumbers: number[]): Promise<void> {
  for (const { model, name } of orphanCollections) {
    try {
      const records = await model().find({ network, blockNumber: { $in: reorgedBlockNumbers } })
      for (const record of records) {
        logOrphan(name, network, record.id, record.blockNumber)
      }
    } catch (error) {
      logger.error(`Error checking orphans for ${name}`, llo({ network, error }))
    }
  }
}

async function fetchFinalizedLogs(network: NetworksEnum, fromBlock: number, toBlock: number): Promise<IFormattedLog[]> {
  const crawler = new BlockchainLogCrawler({
    network,
    fromBlock,
    toBlock,
    events: crawlerEvents,
    stopOnError: false,
    skipLogProcessing: true,
    onError: (error: any) => logger.error('Error fetching finalized logs', llo({ network, error })),
  })

  const formattedLogs = await crawler.crawl()
  if (!formattedLogs || formattedLogs.length === 0) return []

  return formattedLogs
}

async function checkReorgsForNetwork(network: NetworksEnum, progressTracker: ProgressTracker): Promise<void> {
  try {
    const lastFinalizedBlock = await ReorgDetector.getLastFinalizedBlock(network)
    if (!lastFinalizedBlock) {
      logger.warn('Could not get finalized block', llo({ network }))
      return
    }

    const lastChecked = await progressTracker.getStartingBlock()
    const { fromBlock, toBlock } = ReorgDetector.getBlockRangeForCheck(lastFinalizedBlock, lastChecked)

    if (fromBlock > toBlock) {
      return
    }

    logger.verbose('Checking for reorgs', llo({ network, fromBlock, toBlock, lastFinalizedBlock }))

    // Step 1: Check BlockRecord hashes against finalized chain
    const reorgResult = await ReorgDetector.checkForReorgs(network, fromBlock, toBlock)

    if (reorgResult.reorgedBlocks.length === 0 && reorgResult.newBlocks.length === 0) {
      await progressTracker.saveProgress(toBlock)
      return
    }

    // Step 2: Fetch finalized logs for affected blocks using BlockchainLogCrawler
    const affectedBlocks = [...reorgResult.reorgedBlocks.map(b => b.blockNumber), ...reorgResult.newBlocks]
    const minAffected = Math.min(...affectedBlocks)
    const maxAffected = Math.max(...affectedBlocks)

    const finalizedLogs = await fetchFinalizedLogs(network, minAffected, maxAffected)

    logger.info(
      'Processing reorg validation',
      llo({
        network,
        reorgedBlocks: reorgResult.reorgedBlocks.length,
        newBlocks: reorgResult.newBlocks.length,
        finalizedLogs: finalizedLogs.length,
      }),
    )

    // Step 3: Call matching validator for each finalized log
    // The crawler's formatLog already matched topics, parsed ABIs, and set handler=validator
    for (const formattedLog of finalizedLogs) {
      if (!formattedLog.event || !formattedLog.handler) continue
      formattedLog.handler(formattedLog.event, formattedLog.info).catch((error: any) => {
        logger.error(`Validator error for ${formattedLog.info?.eventName}`, llo({ network, error }))
      })
    }

    // Step 4: Detect orphan records (PR1: log only)
    const reorgedBlockNumbers = reorgResult.reorgedBlocks.map(b => b.blockNumber)
    if (reorgedBlockNumbers.length > 0) {
      await detectOrphans(network, reorgedBlockNumbers)
    }

    // Step 5: Update BlockRecord hashes for reorged blocks
    const updatedHashes = reorgResult.reorgedBlocks.map(b => ({
      blockNumber: b.blockNumber,
      blockHash: b.finalizedHash,
    }))
    if (updatedHashes.length > 0) {
      await ReorgDetector.updateBlockRecordHashes(network, updatedHashes)
    }

    await progressTracker.saveProgress(toBlock)
  } catch (error) {
    logger.error('Error checking reorgs for network', llo({ network, error }))
  }
}

const AragonReorgsService: IService = {
  name: EnumServiceName.ARAGON_REORGS,
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],
  options: { mongoSync: config.MONGO_DB.SYNC_MODELS },

  start: async function () {
    logger.info('AragonReorgsService started', llo({}))

    const networks = NetworkHelper.supportedNetworks()

    await Promise.all(
      networks.map(async ({ networkName }) => {
        const taskName = `reorgs-${networkName}`

        const progressTracker = new ProgressTracker({
          network: networkName,
          service: getLogServiceKey(networkName),
        })

        const taskOptions = {
          fn: () => [[{ checkReorgs: { start: () => checkReorgsForNetwork(networkName, progressTracker) } }]],
          interval: config.SERVICES.ARAGON_REORGS.CHECK_INTERVAL,
          checkInterval: config.SERVICES.ARAGON_REORGS.CHECK_INTERVAL / 2,
          runNow: true,
          stopOnError: false,
          onError: (error: any) => logger.error('Error in reorg check', llo({ network: networkName, error })),
        }

        const scheduler = TaskSchedulerState.getInstance()
        await scheduler.startTask(taskName, taskOptions)
      }),
    )
  },

  async stop() {
    const networks = NetworkHelper.supportedNetworks()
    const scheduler = TaskSchedulerState.getInstance()

    for (const { networkName } of networks) {
      scheduler.stopTask(`reorgs-${networkName}`)
    }

    logger.info('AragonReorgsService stopped', llo({}))
  },
}

export default AragonReorgsService
