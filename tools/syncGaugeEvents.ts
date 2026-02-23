import { Models } from '@dbModels'
import ConfigIndexerHelper from '@helpers/configIndexer'
import GaugeHelper from '@helpers/gauge'
import GovernanceVeHelper from '@helpers/governanceVe'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import configIndexer from '@indexer/configIndexer'
import {
  delegateTokensBatch,
  unDelegateTokensBatch,
  delegateChangedBatch,
} from '@src/migrations/20260218123151-syncDelegationEvents'
import { createGaugeVotedBatch, createGaugeResetBatch } from '@src/migrations/20260221154805-syncGaugeVoteEvents'
import {
  EnumConnection,
  type IIndexerConfig,
  type IService,
  type PluginLogService,
  type TokenLogService,
  IPluginInterfaceType,
  ITokenType,
  NetworksEnum,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'tool:syncGaugeEvents' })

interface PluginContext {
  pluginAddress: string
  network: NetworksEnum
  fromBlock: number
  persistentVote: boolean
  pluginLogService: PluginLogService
}

interface DelegationContext {
  adapterAddress: string
  tokenLogService: TokenLogService
}

async function syncVoteResetEvents(ctx: PluginContext) {
  const { pluginAddress, network, fromBlock, persistentVote, pluginLogService } = ctx

  await Promise.all([
    Models.VoteGauge.deleteMany({ pluginAddress, network }),
    Models.ConfigIndexer.deleteMany({
      id: Models.ConfigIndexer.getEntityId({ network, service: pluginLogService }),
    }),
  ])

  const events = configIndexer
    .filter((item: IIndexerConfig) => item.event === 'Voted' || item.event === 'Reset')
    .map((item: IIndexerConfig) => ({
      ...item,
      config: item.config.map(cfg => ({
        ...cfg,
        handler: item.event === 'Voted' ? createGaugeVotedBatch(persistentVote) : createGaugeResetBatch(persistentVote),
      })),
    }))

  const crawler = new BlockchainLogCrawler({
    parallel: { enable: true, useBatch: true, batchSize: 1000 },
    network,
    events,
    address: [pluginAddress],
    fromBlock,
    logService: pluginLogService,
    onError: async error => {
      logger.error('Gauge vote crawl error', llo({ pluginAddress, error }))
    },
    stopOnError: false,
  })

  await crawler.crawl()

  const count = await Models.VoteGauge.countDocuments({ pluginAddress, network })
  logger.info('Vote/Reset events synced', llo({ pluginAddress, voteGaugeCount: count }))
}

async function syncDelegationEvents(ctx: PluginContext, delegation: DelegationContext) {
  const { pluginAddress, network, fromBlock } = ctx
  const { adapterAddress, tokenLogService } = delegation

  await Promise.all([
    Models.TokenDelegation.deleteMany({ contractAddress: adapterAddress, network }),
    Models.LogDelegateChanged.deleteMany({ tokenAddress: adapterAddress, network }),
    Models.ConfigIndexer.deleteMany({
      id: Models.ConfigIndexer.getEntityId({ network, service: tokenLogService }),
    }),
  ])

  const events = configIndexer
    .filter(
      (item: IIndexerConfig) =>
        item.event === 'TokensDelegated' || item.event === 'TokensUndelegated' || item.event === 'DelegateChanged',
    )
    .map((item: IIndexerConfig) => ({
      ...item,
      config: item.config.map(cfg => ({
        ...cfg,
        handler:
          item.event === 'TokensDelegated'
            ? delegateTokensBatch
            : item.event === 'TokensUndelegated'
              ? unDelegateTokensBatch
              : delegateChangedBatch,
      })),
    }))

  const crawler = new BlockchainLogCrawler({
    parallel: { enable: true, useBatch: true, batchSize: 1000 },
    network,
    events,
    address: [adapterAddress],
    fromBlock,
    logService: tokenLogService,
    onError: async error => {
      logger.error('Delegation crawl error', llo({ pluginAddress, error }))
    },
    stopOnError: false,
  })

  await crawler.crawl()

  const tokenDelegationCount = await Models.TokenDelegation.countDocuments({
    contractAddress: adapterAddress,
    network,
  })
  const delegateChangedCount = await Models.LogDelegateChanged.countDocuments({
    tokenAddress: adapterAddress,
    network,
  })
  logger.info('Delegation events synced', llo({ pluginAddress, tokenDelegationCount, delegateChangedCount }))
}

export const SyncGaugeEvents: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    logger.info('Starting SyncGaugeEvents tool', llo({}))

    const targetPlugins = [
      { network: NetworksEnum.katanaMainnet, address: '0xF4107fD15D97c7dd99D489438cF74Abd23295b50' },
    ]

    const plugins = await Models.Plugin.find({
      interfaceType: IPluginInterfaceType.gauge,
      $or: targetPlugins.map(t => ({ address: t.address, network: t.network })),
    })

    if (plugins.length === 0) {
      logger.info('No gauge plugins found', llo({}))
      return
    }

    logger.info(`Found ${plugins.length} gauge plugin(s)`, llo({}))

    for (const plugin of plugins) {
      const pluginAddress = plugin.address
      const network = plugin.network as NetworksEnum
      const fromBlock = plugin.blockNumber

      logger.info('Processing gauge plugin', llo({ pluginAddress, network, fromBlock }))

      const settings = await plugin.getActiveSettings()
      const pluginLogService = ConfigIndexerHelper.builders.plugin(plugin.interfaceType, plugin.network, plugin.address)

      const ctx: PluginContext = {
        pluginAddress,
        network,
        fromBlock,
        persistentVote: settings?.enabledUpdatedVotingPowerHook ?? false,
        pluginLogService,
      }

      const crawlPromises: Promise<void>[] = [syncVoteResetEvents(ctx)]

      const escrowAddress = await GovernanceVeHelper.getEscrowAddress(pluginAddress, network)
      const adapterAddress = escrowAddress ? await GaugeHelper.getIVotesAdapterAddress(escrowAddress, network) : null

      if (adapterAddress) {
        const tokenLogService = ConfigIndexerHelper.builders.token(ITokenType.escrowAdapter, network, adapterAddress)
        crawlPromises.push(syncDelegationEvents(ctx, { adapterAddress, tokenLogService }))
      } else {
        logger.warn('No escrow/adapter address found, skipping delegation sync', llo({ pluginAddress }))
      }

      const startTime = Date.now()
      await Promise.all(crawlPromises)
      logger.info('Plugin sync completed', llo({ pluginAddress, durationMs: Date.now() - startTime }))
    }

    logger.info('SyncGaugeEvents tool completed', llo({ pluginsProcessed: plugins.length }))
  },

  stop: async () => {},
}

export default SyncGaugeEvents
