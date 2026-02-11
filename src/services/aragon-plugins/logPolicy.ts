import logger from '@logger'
import {
  IPolicySourceModelLogs,
  IPolicyPluginSettingsLogs,
  type IIndexerConfig,
  type NetworksEnum,
  type HexAddress,
} from '@types'
import { BlockchainLogCrawler } from '@modules/crawlers'
import configIndexer from '@indexer/configIndexer'
import ConfigIndexerHelper from '@helpers/configIndexer'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { Models } from '@src/models'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogPolicy' })

export const LogPolicy = {
  /**
   * Main entry point - syncs all policy-related events for a plugin.
   * Fetches settings from DB and syncs source, model, and plugin events in parallel.
   * @param pluginAddress - The plugin contract address
   * @param network - The network
   */
  start: async (pluginAddress: HexAddress, network: NetworksEnum) => {
    logger.verbose('Start LogPolicy for plugin', llo({ network, pluginAddress }))

    const setting = await Models.Setting.findActive({ pluginAddress, network })
    const sourceAddress = setting?.policy?.source?.address
    const modelAddress = setting?.policy?.model?.address

    logger.info('LogPolicy start', llo({ pluginAddress, network, sourceAddress, modelAddress }))

    const syncTasks: Promise<void>[] = []

    if (sourceAddress) {
      syncTasks.push(LogPolicy._syncSourceModelContract(sourceAddress, network))
    }

    if (modelAddress) {
      syncTasks.push(LogPolicy._syncSourceModelContract(modelAddress, network))
    }

    syncTasks.push(LogPolicy._syncPluginContract(pluginAddress, network))

    await Promise.all(syncTasks)

    logger.verbose('End LogPolicy for plugin', llo({ network, pluginAddress }))
  },

  /**
   * Internal: Sync events from source or model contract
   * Events: SourceSettingsUpdated, PluginDefined, ModelSettingsUpdated
   */
  _syncSourceModelContract: async (address: HexAddress, network: NetworksEnum) => {
    logger.verbose('Start LogPolicy _syncSourceModelContract', llo({ network, address }))

    const configSourceModelLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IPolicySourceModelLogs).includes(item.event as any),
    )

    const logPolicyRecord = await Models.LogPolicy.findByAddress(address, network)
    if (!logPolicyRecord?.blockNumber) {
      logger.warn('LogPolicy record not found, skipping sync', llo({ network, address }))
      return
    }

    const fromBlock = logPolicyRecord.blockNumber

    const crawler = new BlockchainLogCrawler({
      onlyHistorical: true,
      network,
      events: configSourceModelLogs,
      address,
      fromBlock,
      onError: async (error: any, log: any) => LogPolicy._processError(error, address, network, log),
      logService: ConfigIndexerHelper.builders.policyContract(network, address),
      stopOnError: true,
    })

    await crawler.crawl()
    await crawler.end()

    logger.verbose(
      'End LogPolicy _syncSourceModelContract',
      llo({ network, address, lastSync: crawler.crawlSetting.lastSync }),
    )
  },

  /**
   * Internal: Sync events from plugin contract
   * Events: RouterSettingsUpdated, ClaimerSettingsUpdated
   */
  _syncPluginContract: async (pluginAddress: HexAddress, network: NetworksEnum) => {
    logger.verbose('Start LogPolicy _syncPluginContract', llo({ network, pluginAddress }))

    const configPluginLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IPolicyPluginSettingsLogs).includes(item.event as any),
    )

    const contractCreationInfo = await ProxyWeb3Provider.fetchContractCreation({ address: pluginAddress, network })
    if (!contractCreationInfo.blockNumber) {
      logger.warn('Cannot find plugin creation block number', llo({ network, pluginAddress }))
      return
    }

    const crawler = new BlockchainLogCrawler({
      onlyHistorical: true,
      network,
      events: configPluginLogs,
      address: pluginAddress,
      fromBlock: contractCreationInfo.blockNumber,
      onError: async (error: any, log: any) => LogPolicy._processError(error, pluginAddress, network, log),
      logService: ConfigIndexerHelper.builders.policyPlugin(network, pluginAddress),
      stopOnError: true,
    })

    await crawler.crawl()
    await crawler.end()

    logger.verbose(
      'End LogPolicy _syncPluginContract',
      llo({ network, pluginAddress, lastSync: crawler.crawlSetting.lastSync }),
    )
  },

  _processError: async (error: any, address: HexAddress, network: NetworksEnum, log: any) => {
    logger.error(
      'Error LogPolicy',
      llo({
        log,
        error,
        address,
        network,
      }),
    )
  },
}
