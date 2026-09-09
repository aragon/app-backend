/**
 * Dao service side of the indexer block gap reader.
 *
 * Measuring the gap needs the chain head of every network, so it runs in a
 * service that already holds RPC providers. The telegram service boots with
 * Mongo and RabbitMQ only, so it sends one `indexer.blockGap` message per
 * scrape and waits for this reply.
 *
 * Measured outside the indexer because a crashed indexer cannot report its
 * own lag, and because the indexer shards networks across workers that all
 * share one metrics row.
 *
 * A network that cannot be measured is left out of the readings entirely.
 * Reporting its previous gap would keep the dashboards green while the RPC is
 * down, so the series goes absent instead and the alert treats it as a failure.
 */

import { Models } from '@dbModels'
import ConfigIndexerHelper from '@helpers/configIndexer'
import { NetworkHelper } from '@helpers/network'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import {
  type IIndexerBlockGapQueueResponse,
  type IIndexerBlockGapReading,
  type IQueueIndexerBlockGap,
  type NetworksEnum,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'dao:indexer-block-gap' })

export const IndexerBlockGapDao = {
  async read(params: IQueueIndexerBlockGap): Promise<IIndexerBlockGapQueueResponse> {
    if (Date.now() - params.sentAt > params.replyTimeoutMs) {
      logger.warn('blockGap: discarded stale queue request', llo({ sentAt: params.sentAt }))
      return { readings: [] }
    }

    const networks = NetworkHelper.supportedNetworks()
    if (!networks.length) {
      logger.warn('blockGap: no supported networks configured', llo({}))
      return { readings: [] }
    }

    const lastSyncByNetwork = await IndexerBlockGapDao.readIndexerProgress(networks.map(n => n.networkName))

    const readings = await Promise.all(
      networks.map(async ({ networkName }) => IndexerBlockGapDao.readNetwork(networkName, lastSyncByNetwork)),
    )

    return { readings: readings.filter((reading): reading is IIndexerBlockGapReading => reading !== null) }
  },

  readNetwork: async (
    network: NetworksEnum,
    lastSyncByNetwork: Map<NetworksEnum, number>,
  ): Promise<IIndexerBlockGapReading | null> => {
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
