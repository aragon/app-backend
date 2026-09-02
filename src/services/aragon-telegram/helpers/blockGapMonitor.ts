import { Models } from '@dbModels'
import ConfigIndexerHelper from '@helpers/configIndexer'
import { NetworkHelper } from '@helpers/network'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'telegram:blockGap' })

// Long enough for the gauges collected in one scrape to share a single
// measurement, short enough that the next scrape takes a fresh one.
const SHARED_READING_TTL_MS = 5 * 1000

export interface IBlockGapReading {
  network: NetworksEnum
  lastIndexed: number
  chainHead: number
  lagSeconds: number
}

let shared: { at: number; readings: Promise<IBlockGapReading[]> } | null = null

/**
 * Measures how far the indexer trails each chain head, so a stalled indexer is
 * caught before subscribers notice their notifications went quiet.
 *
 * Measured here rather than in the indexer because a crashed indexer cannot
 * report its own lag, and because the indexer shards networks across workers
 * that all share one metrics row. This service is a single instance, so one
 * reading covers every network.
 *
 * A network that cannot be measured is left out of the readings entirely.
 * Reporting its previous gap would keep the dashboards green while the RPC is
 * down, so the series goes absent instead and the alert treats it as a failure.
 */
export const BlockGapMonitor = {
  read: async (): Promise<IBlockGapReading[]> => {
    const networks = NetworkHelper.supportedNetworks()
    if (!networks.length) {
      logger.warn('blockGap: no supported networks configured', llo({}))
      return []
    }

    const lastSyncByNetwork = await BlockGapMonitor.readIndexerProgress(networks.map(n => n.networkName))

    const readings = await Promise.all(
      networks.map(async ({ networkName }) => BlockGapMonitor.readNetwork(networkName, lastSyncByNetwork)),
    )

    return readings.filter((reading): reading is IBlockGapReading => reading !== null)
  },

  /**
   * The three gauges collect independently but describe one measurement, so a
   * reading is shared briefly to keep a scrape to a single round of RPC calls.
   */
  readShared: (): Promise<IBlockGapReading[]> => {
    const now = Date.now()
    if (shared && now - shared.at < SHARED_READING_TTL_MS) return shared.readings

    const readings = BlockGapMonitor.read().catch(error => {
      logger.warn('blockGap: measurement failed', llo({ error }))
      return [] as IBlockGapReading[]
    })

    shared = { at: now, readings }
    return readings
  },

  resetShared: (): void => {
    shared = null
  },

  readNetwork: async (
    network: NetworksEnum,
    lastSyncByNetwork: Map<NetworksEnum, number>,
  ): Promise<IBlockGapReading | null> => {
    const lastSync = lastSyncByNetwork.get(network)
    if (lastSync === undefined) {
      logger.warn('blockGap: no indexer progress recorded', llo({ network }))
      return null
    }

    // getBlockNumber swallows RPC errors and answers -1
    const chainHead = await Web3Helper.getBlockNumber(undefined, network)
    if (chainHead <= 0) {
      logger.warn('blockGap: chain head unavailable', llo({ network }))
      return null
    }

    const blockTime = NetworkHelper.getAverageBlockTime(network)
    if (!blockTime || blockTime <= 0) {
      logger.warn('blockGap: average block time not configured', llo({ network }))
      return null
    }

    // saveProgress stores the next block to crawl, so the last indexed block is one behind
    const lastIndexed = Math.max(0, lastSync - 1)
    const gapBlocks = Math.max(0, chainHead - lastIndexed)

    return { network, lastIndexed, chainHead, lagSeconds: gapBlocks * blockTime }
  },

  /**
   * Reads the main indexer row for each network. The same collection holds a row
   * per plugin address, so the lookup is pinned to the indexer service ids to
   * keep one series per network instead of one per plugin.
   */
  readIndexerProgress: async (networks: NetworksEnum[]): Promise<Map<NetworksEnum, number>> => {
    const ids = networks.map(network =>
      Models.ConfigIndexer.getEntityId({ network, service: ConfigIndexerHelper.builders.indexer(network) }),
    )

    const rows = await Models.ConfigIndexer.find({ id: { $in: ids } }, { _id: 0, network: 1, lastSync: 1 })

    return new Map(rows.map(row => [row.network, row.lastSync]))
  },
}
