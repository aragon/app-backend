import logger from '@logger'
import { Interface, type Log } from 'ethers'
import { IEnumIndexerService, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { PluginRepoRegistryHandler } from '@services/aragon-indexer/handlers/pluginRepoRegistryHandler'
import { PluginRepoRegistry } from '@artifacts/pluginRepoRegistry'
import Web3Helper from '@helpers/web3'
import { NetworkHelper } from '@helpers/network'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogPluginRepoRegistry' })

export const LogPluginRepoRegistry = {
  events: ['PluginRepoRegistered'],

  start: async () => {
    await Promise.all(
      NetworkHelper.supportedNetworks().map(async ({ networkName }) => {
        logger.verbose('Start LogPluginRepoRegistry', llo({ networkName }))

        const eventTopics = PluginRepoRegistry.abi
          .filter((item: any) => item.type && LogPluginRepoRegistry.events.includes(item.name))
          .map((event: any) => new Interface(PluginRepoRegistry.abi).getEvent(event.name)?.topicHash)

        const filter = {
          topics: eventTopics,
        }

        const crawler = new BlockchainLogCrawler({
          network: networkName,
          filter,
          onLog: async (txLog: Log) => LogPluginRepoRegistry.processLog(txLog, networkName),
          onError: async (error: any) => LogPluginRepoRegistry.processError(error, networkName),
          logService: IEnumIndexerService.pluginRepoRegistryLog,
          stopOnError: true,
        })

        await crawler.crawl()
        logger.verbose('End LogPluginRepoRegistry', llo({ networkName, latestBlockSync: crawler.crawlResult.lastSync }))
      }),
    )
  },

  processLog: async (txLog: Log, network: NetworksEnum) => {
    const iFace = new Interface(PluginRepoRegistry.abi)
    const event = Web3Helper.parseLog(txLog, iFace)
    if (!event) {
      return
    }
    const info = Web3Helper.parseInfoLog(txLog, event.name, network)

    switch (event.name) {
      case 'PluginRepoRegistered':
        logger.verbose('PluginRepoRegistered', llo(info))
        await PluginRepoRegistryHandler.pluginRepoRegistered(event, info)
        break
      default:
        logger.error('Unhandled event', llo(info))
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
