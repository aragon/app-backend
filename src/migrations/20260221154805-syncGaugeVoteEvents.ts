import { Models } from '@dbModels'
import ConfigIndexerHelper from '@helpers/configIndexer'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import configIndexer from '@indexer/configIndexer'
import { type IIndexerConfig, type ILogInfo, type IMigration, IPluginInterfaceType, NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'
import { resolveBlockTimestamps } from './20260218123151-syncDelegationEvents'

const llo = logger.logMeta.bind(null, { service: 'Migration: syncGaugeVoteEvents' })

export function createGaugeVotedBatch(persistentVote: boolean) {
  return async function gaugeVotedBatch(events: Array<{ parsedEvent: LogDescription; info: ILogInfo }>) {
    if (events.length === 0) return
    const timestampMap = await resolveBlockTimestamps(events, events[0].info.network)

    const ops = events.map(({ parsedEvent, info }) => {
      const doc = {
        id: Models.VoteGauge.getEntityId({
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          pluginAddress: info.address,
        }),
        network: info.network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
        blockNumber: info.blockNumber,
        blockTimestamp: timestampMap.get(info.blockNumber) ?? 0,
        gaugeAddress: parsedEvent.args.gauge,
        pluginAddress: info.address,
        memberAddress: parsedEvent.args.voter,
        epochId: parsedEvent.args.epoch.toString(),
        votingPower: parsedEvent.args.votingPowerCastForGauge.toString(),
        type: 'vote' as const,
        persistentVote,
      }
      return { updateOne: { filter: { id: doc.id }, update: { $setOnInsert: doc }, upsert: true } }
    })

    await Models.VoteGauge.bulkWrite(ops, { ordered: false })
  }
}

export function createGaugeResetBatch(persistentVote: boolean) {
  return async function gaugeResetBatch(events: Array<{ parsedEvent: LogDescription; info: ILogInfo }>) {
    if (events.length === 0) return
    const timestampMap = await resolveBlockTimestamps(events, events[0].info.network)

    const ops = events.map(({ parsedEvent, info }) => {
      const doc = {
        id: Models.VoteGauge.getEntityId({
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          pluginAddress: info.address,
        }),
        network: info.network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
        blockNumber: info.blockNumber,
        blockTimestamp: timestampMap.get(info.blockNumber) ?? 0,
        gaugeAddress: parsedEvent.args.gauge,
        pluginAddress: info.address,
        memberAddress: parsedEvent.args.voter,
        epochId: parsedEvent.args.epoch.toString(),
        votingPower: '0',
        type: 'reset' as const,
        persistentVote,
      }
      return { updateOne: { filter: { id: doc.id }, update: { $setOnInsert: doc }, upsert: true } }
    })

    await Models.VoteGauge.bulkWrite(ops, { ordered: false })
  }
}

export const syncGaugeVoteEventsMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260221154805-syncGaugeVoteEvents' }))

    try {
      const plugins = await Models.Plugin.find({
        interfaceType: IPluginInterfaceType.gauge,
        address: '0x19513f8bFE5dC3AEAF12280C9C8DA25204c334b9',
        network: NetworksEnum.katanaMainnet,
      })

      if (plugins.length === 0) {
        logger.info('No gauge plugins found', llo({}))
        return
      }

      for (const plugin of plugins) {
        const pluginAddress = plugin.address
        const network = plugin.network as NetworksEnum
        const fromBlock = plugin.blockNumber

        logger.info('Processing gauge plugin', llo({ pluginAddress, network, fromBlock }))

        const settings = await plugin.getActiveSettings()
        const persistentVote = settings?.enabledUpdatedVotingPowerHook ?? false

        const deletedVoteGauges = await Models.VoteGauge.deleteMany({
          pluginAddress,
          network,
        })

        const logService = ConfigIndexerHelper.builders.plugin(plugin.interfaceType, plugin.network, plugin.address)
        const deletedConfigIndexer = await Models.ConfigIndexer.deleteMany({
          id: Models.ConfigIndexer.getEntityId({ network, service: logService }),
        })

        logger.info(
          'Cleaned existing data',
          llo({
            pluginAddress,
            deletedVoteGauges: deletedVoteGauges.deletedCount,
            deletedConfigIndexer: deletedConfigIndexer.deletedCount,
          }),
        )

        const crawlStartTime = Date.now()

        const gaugeVoteEvents = configIndexer
          .filter((item: IIndexerConfig) => item.event === 'Voted' || item.event === 'Reset')
          .map((item: IIndexerConfig) => ({
            ...item,
            config: item.config.map(cfg => ({
              ...cfg,
              handler:
                item.event === 'Voted' ? createGaugeVotedBatch(persistentVote) : createGaugeResetBatch(persistentVote),
            })),
          }))

        const crawler = new BlockchainLogCrawler({
          parallel: {
            enable: true,
            useBatch: true,
            batchSize: 1000,
          },
          network,
          events: gaugeVoteEvents,
          address: [pluginAddress],
          fromBlock,
          logService,
          onError: async error => {
            logger.error('Gauge vote crawl error', llo({ pluginAddress, error }))
          },
          stopOnError: false,
        })

        await crawler.crawl()

        const crawlDurationMs = Date.now() - crawlStartTime

        const voteGaugeCount = await Models.VoteGauge.countDocuments({
          pluginAddress,
          network,
        })

        logger.info('Gauge vote events synced', llo({ pluginAddress, voteGaugeCount, crawlDurationMs }))
      }

      logger.info('Migration completed successfully', llo({ migration: '20260221154805-syncGaugeVoteEvents' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20260221154805-syncGaugeVoteEvents', error }))
      throw error
    }
  },

  stop: async () => {},
}

export default syncGaugeVoteEventsMigration
