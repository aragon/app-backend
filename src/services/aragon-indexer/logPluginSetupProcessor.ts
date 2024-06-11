import logger from '@logger'
import { Interface, type Log } from 'ethers'
import { IEnumIndexerService, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { PluginSetupProcessorHandler } from '@services/aragon-indexer/handlers/pluginSetupProcessorHandler'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import Web3Helper from '@helpers/web3'
import { NetworkHelper } from '@helpers/network'

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
    await Promise.all(
      NetworkHelper.supportedNetworks().map(async ({ networkName }) => {
        logger.verbose('Start LogPluginSetupProcessor', llo({ networkName }))

        const eventTopics = PluginSetupProcessor.abi
          .filter((item: any) => item.type && LogPluginSetupProcessor.events.includes(item.name))
          .map((event: any) => new Interface(PluginSetupProcessor.abi).getEvent(event.name)?.topicHash)

        const filter = {
          topics: eventTopics,
        }

        const crawler = new BlockchainLogCrawler({
          network: networkName,
          filter,
          onLog: async (txLog: Log) => LogPluginSetupProcessor.processLog(txLog, networkName),
          onError: async (error: any) => LogPluginSetupProcessor.processError(error, networkName),
          logService: IEnumIndexerService.pluginSetupProcessorLog,
          stopOnError: true,
        })

        await crawler.crawl()
        logger.verbose(
          'End LogPluginSetupProcessor',
          llo({ networkName, latestBlockSync: crawler.crawlResult.lastSync }),
        )
      }),
    )
  },

  processLog: async (txLog: Log, network: NetworksEnum) => {
    const iFace = new Interface(PluginSetupProcessor.abi)
    const event = Web3Helper.parseLog(txLog, iFace)
    if (!event) {
      return
    }
    const info = Web3Helper.parseInfoLog(txLog, event.name, network)

    switch (event.name) {
      case 'InstallationApplied':
        logger.verbose('InstallationApplied', llo(info))
        await PluginSetupProcessorHandler.installationApplied(event, info)
        break
      case 'InstallationPrepared':
        logger.verbose('InstallationPrepared', llo(info))
        await PluginSetupProcessorHandler.installationPrepared(event, info)
        break
      case 'UninstallationApplied':
        logger.verbose('UninstallationApplied', llo(info))
        await PluginSetupProcessorHandler.uninstallationApplied(event, info)
        break
      case 'UninstallationPrepared':
        logger.verbose('UninstallationPrepared', llo(info))
        await PluginSetupProcessorHandler.uninstallationPrepared(event, info)
        break
      case 'UpdateApplied':
        logger.verbose('UpdateApplied', llo(info))
        await PluginSetupProcessorHandler.updateApplied(event, info)
        break
      case 'UpdatePrepared':
        logger.verbose('UpdatePrepared', llo(info))
        await PluginSetupProcessorHandler.updatePrepared(event, info)
        break
      default:
        logger.error('Unhandled event', llo(info))
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
