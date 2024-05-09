import logger from '@logger'
import { Interface, type Log } from 'ethers'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { PluginRepoRegistryHandler } from '@services/indexer/handlers/pluginRepoRegistryHandler'
import { UtilsIndexer } from '@models/utils/indexer'
import { PluginRepoRegistry } from '@artifacts/pluginRepoRegistry'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogPluginRepoRegistry' })

export const LogPluginRepoRegistry = {
  events: ['PluginRepoRegistered'],

  start: async () => {
    for (const networkName of Object.values(Network.NETWORKS)) {
      logger.verbose('Start LogPluginRepoRegistry', llo({ networkName }))

      const networkDb = await Models.Network.findByName(networkName as NetworksEnum)

      if (!networkDb) {
        logger.verbose('Unsupported Network', llo({ networkName }))
        return
      }

      const eventTopics = PluginRepoRegistry.abi
        .filter((item: any) => item.type && LogPluginRepoRegistry.events.includes(item.name))
        .map((event: any) => new Interface(PluginRepoRegistry.abi).getEvent(event.name)?.topicHash)

      const filter = {
        topics: eventTopics,
        fromBlock: networkDb.lastBlockPluginRepoRegistry,
        toBlock: 'latest',
      }

      const crawler = new BlockchainLogCrawler({
        network: networkName as NetworksEnum,
        filter,
        onLog: async (txLog: Log) => LogPluginRepoRegistry.processLog(txLog, networkName as NetworksEnum),
        onError: async (error: any) => LogPluginRepoRegistry.processError(error, networkName as NetworksEnum),
        stopOnError: true,
      })

      await crawler.crawl()
      await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockPluginRepoRegistry')
    }
    logger.verbose('Finish LogPluginRepoRegistry', llo())
  },

  processLog: async (txLog: any, network: NetworksEnum) => {
    const event = new Interface(PluginRepoRegistry.abi).parseLog(txLog)!

    switch (event.name) {
      case 'PluginRepoRegistered':
        logger.verbose('PluginRepoRegistered', llo({ event }))
        await PluginRepoRegistryHandler.pluginRepoRegistered(event, txLog, network)
        break
      default:
        logger.error('Unhandled event', llo({ event }))
        break
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error PluginRepoRegistered',
      llo({
        error,
        network,
      }),
    )
  },
}
