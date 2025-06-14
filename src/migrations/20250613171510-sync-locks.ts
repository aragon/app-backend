import {
  IExitQueueLogs,
  type IIndexerConfig,
  type IMigration,
  IVotingEscrowAdapterLogs,
  IVotingEscrowIncreasingLogs,
} from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import configIndexer from '@indexer/configIndexer'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { NetworkHelper } from '@helpers/network'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import type Setting from '@models/schema/setting'
import config from '@config'
import utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'Migration: lock' })

export const lockMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250613171510-lock' }))

    try {
      const settings = await Models.Setting.find({ 'votingEscrow.minDeposit': { $exists: true } })
      await Promise.all(
        settings.map(async (setting: Setting) => {
          const plugin = await setting.getPlugin()

          const votingEscrow = await PluginSettingHandler.votingEscrowSettings(plugin, {
            network: plugin.network,
          } as any)

          setting.votingEscrow = null as any
          setting.votingEscrow = votingEscrow
          await setting.save()
        }),
      )

      // remove all old locks
      await Models.Lock.deleteMany({})

      const configExitQueueLogs = configIndexer.filter((item: IIndexerConfig) =>
        Object.values(IExitQueueLogs).includes(item.event as any),
      )
      const configEscrowILogs = configIndexer.filter((item: IIndexerConfig) =>
        Object.values(IVotingEscrowIncreasingLogs).includes(item.event as any),
      )
      const configEscrowAdapterILogs = configIndexer.filter((item: IIndexerConfig) =>
        Object.values(IVotingEscrowAdapterLogs).includes(item.event as any),
      )

      const networks = NetworkHelper.supportedNetworks()

      await Promise.all(
        networks.map(async ({ networkName }) => {
          const veGovernanceCrawler = new BlockchainLogCrawler({
            network: networkName,
            events: [...configEscrowAdapterILogs, ...configEscrowILogs, ...configExitQueueLogs],
            fromBlock: config.NODES[utils.networkToAragon(networkName)].FROM_BLOCK,
            onError: async (error: any, log: any) => {
              logger.error('Error processing escrow adapter log', llo({ error, log }))
            },
            logService: null,
            stopOnError: true,
          })

          // re-sync all locks
          await Promise.all([veGovernanceCrawler.crawl()])

          logger.info('Crawled logs for network', llo({ network: networkName }))
        }),
      )

      logger.info('Migration completed successfully', llo({ migration: '20250613171510-lock' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250613171510-lock', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default lockMigration
