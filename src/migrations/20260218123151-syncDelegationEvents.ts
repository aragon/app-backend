import { Models } from '@dbModels'
import ConfigIndexerHelper from '@helpers/configIndexer'
import GaugeHelper from '@helpers/gauge'
import GovernanceVeHelper from '@helpers/governanceVe'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import configIndexer from '@indexer/configIndexer'
import { type IIndexerConfig, type IMigration, IPluginInterfaceType, ITokenType, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: syncDelegationEvents' })

export const syncDelegationEventsMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260218123151-syncDelegationEvents' }))

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

        const escrowAddress = await GovernanceVeHelper.getEscrowAddress(pluginAddress, network)
        if (!escrowAddress) {
          logger.warn('No escrow address found, skipping', llo({ pluginAddress }))
          continue
        }

        const adapterAddress = await GaugeHelper.getIVotesAdapterAddress(escrowAddress, network)
        if (!adapterAddress) {
          logger.warn('No adapter address found, skipping', llo({ pluginAddress }))
          continue
        }

        logger.info('Resolved addresses', llo({ pluginAddress, escrowAddress, adapterAddress }))

        const delegationEvents = configIndexer.filter(
          (item: IIndexerConfig) =>
            item.event === 'DelegateChanged' || item.event === 'TokensDelegated' || item.event === 'TokensUndelegated',
        )

        const delegationCrawler = new BlockchainLogCrawler({
          network,
          events: delegationEvents,
          address: [adapterAddress],
          fromBlock,
          onError: async error => {
            logger.error('Delegation crawl error', llo({ pluginAddress, error }))
          },
          logService: ConfigIndexerHelper.builders.token(ITokenType.escrowAdapter, network, adapterAddress),
          stopOnError: true,
        })
        await delegationCrawler.crawl()

        const delegateCount = await Models.LogDelegateChanged.countDocuments({
          tokenAddress: adapterAddress,
          network,
        })
        const tokenDelegationCount = await Models.TokenDelegation.countDocuments({
          contractAddress: adapterAddress,
          network,
        })

        logger.info('Delegation events synced', llo({ pluginAddress, delegateCount, tokenDelegationCount }))
      }

      logger.info('Migration completed successfully', llo({ migration: '20260218123151-syncDelegationEvents' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20260218123151-syncDelegationEvents', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default syncDelegationEventsMigration
