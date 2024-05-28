import logger from '@logger'
import { Interface, type Log } from 'ethers'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { PluginSetupProcessorHandler } from '@services/indexer/handlers/pluginSetupProcessorHandler'
import { UtilsIndexer } from '@models/utils/indexer'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { ConfigState } from '@state/configState'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogPluginSetupProcessor' })

export const LogPluginSetupProcessor = {
  events: [
    'InstallationApplied',
    'InstallationPrepared',
    'UninstallationApplied',
    'UninstallationPrepared',
    'UpdateApplied',
    'UpdatePrepared',
  ],

  start: async () => {
    const networks = Object.values(Network.NETWORKS)

    await Promise.all(
      networks.map(async networkName => {
        logger.verbose('Start LogPluginSetupProcessor', llo({ networkName }))

        const networkDb = await Models.Network.findByName(networkName as NetworksEnum)
        const provider = ConfigState.getInstance().getConfigItem(networkName as NetworksEnum)

        if (!networkDb || !provider) {
          logger.warn('Unsupported Network', llo({ networkName }))
          return
        }

        const eventTopics = PluginSetupProcessor.abi
          .filter((item: any) => item.type && LogPluginSetupProcessor.events.includes(item.name))
          .map((event: any) => new Interface(PluginSetupProcessor.abi).getEvent(event.name)?.topicHash)

        const filter = {
          topics: eventTopics,
          fromBlock: networkDb.lastBlockPluginSetupProcessor,
          toBlock: 'latest',
        }

        const crawler = new BlockchainLogCrawler({
          network: networkName as NetworksEnum,
          filter,
          onLog: async (txLog: Log) => LogPluginSetupProcessor.processLog(txLog, networkName as NetworksEnum),
          onError: async (error: any) => LogPluginSetupProcessor.processError(error, networkName as NetworksEnum),
          stopOnError: true,
        })

        await crawler.crawl()
        await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockPluginSetupProcessor')
        logger.verbose(
          'End LogPluginSetupProcessor',
          llo({ networkName, latestBlockSync: crawler.crawlResult.latestBlockNumber }),
        )
      }),
    )
  },

  processLog: async (txLog: any, network: NetworksEnum) => {
    const iFace = new Interface(PluginSetupProcessor.abi)
    let event = null as any
    try {
      event = iFace.parseLog(txLog)!
    } catch (error: any) {
      if (error?.message.includes('out-of-bounds')) {
        return
      }
    }

    switch (event.name) {
      case 'InstallationApplied':
        logger.verbose('InstallationApplied', llo({ eventName: event.name, network }))
        await PluginSetupProcessorHandler.installationApplied(event, txLog, network)
        break
      case 'InstallationPrepared':
        logger.verbose('InstallationPrepared', llo({ eventName: event.name, network }))
        await PluginSetupProcessorHandler.installationPrepared(event, txLog, network)
        break
      case 'UninstallationApplied':
        logger.verbose('UninstallationApplied', llo({ eventName: event.name, network }))
        await PluginSetupProcessorHandler.uninstallationApplied(event, txLog, network)
        break
      case 'UninstallationPrepared':
        logger.verbose('UninstallationPrepared', llo({ eventName: event.name, network }))
        await PluginSetupProcessorHandler.uninstallationPrepared(event, txLog, network)
        break
      case 'UpdateApplied':
        logger.verbose('UpdateApplied', llo({ eventName: event.name, network }))
        await PluginSetupProcessorHandler.updateApplied(event, txLog, network)
        break
      case 'UpdatePrepared':
        logger.verbose('UpdatePrepared', llo({ eventName: event.name, network }))
        await PluginSetupProcessorHandler.updatePrepared(event, txLog, network)
        break
      default:
        logger.error('Unhandled event', llo({ event, network }))
        break
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error LogPluginSetupProcessor',
      llo({
        error,
        network,
      }),
    )
  },
}
