import logger from '@logger'
import { Interface, type Log } from 'ethers'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import Web3Helper from '@helpers/web3'
import { PluginSettingHandler } from '@indexer/handlers/pluginSettingHandler'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import type Plugin from '@models/schema/plugin'
import { TokenVoting } from '@artifacts/TokenVoting'
import { ProposalHandler } from '@indexer/handlers/proposalHandler'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogSpp' })

export const LogSpp = {
  eventsSPP: ['StagesUpdated', 'ProposalCreated', 'ProposalExecuted', 'ProposalAdvanced'],

  start: async (plugin: Plugin) => {
    logger.verbose('Start LogSpp', llo({ network: plugin.network, pluginAddress: plugin.address }))

    const sppTopics = TokenVoting.abi
      .filter((item: any) => item.type && LogSpp.eventsSPP.includes(item.name))
      .map((event: any) => new Interface(StagedProposalProcessor.abi).getEvent(event.name)?.topicHash)

    const filter = {
      address: plugin.address,
      fromBlock: plugin?.blockNumber || 0,
      topics: [...sppTopics],
    }

    const crawler = new BlockchainLogCrawler({
      network: plugin.network,
      filter,
      onLog: async (txLog: Log) => LogSpp.processLog(txLog, plugin.network),
      onError: async (error: any) => LogSpp.processError(error, plugin.network, plugin),
      logService: `LogSpp-${plugin.network}-${plugin.address}` as any,
      stopOnError: true,
    })

    await crawler.crawl()
    logger.verbose('End LogSpp', llo({ network: plugin.network, latestBlockSync: crawler.crawlResult.lastSync }))
  },

  processLog: async (txLog: Log, network: NetworksEnum) => {
    const iFace = new Interface(StagedProposalProcessor.abi)
    const event = Web3Helper.parseLog(txLog, iFace)

    if (!event) {
      return
    }

    const info = Web3Helper.parseInfoLog(txLog, event.name, network)

    switch (event.name) {
      case 'StagesUpdated':
        logger.verbose('StagesUpdated', llo(info))
        await PluginSettingHandler.sppSettingsUpdated(event, info)
        break
      case 'ProposalAdvanced':
        logger.verbose('ProposalAdvanced', llo(info))
        await ProposalHandler.proposalAdvanced(event, info)
        break
      case 'ProposalCreated':
        logger.verbose('ProposalCreated', llo(info))
        await ProposalHandler.proposalCreated(event, info)
        break
      case 'ProposalExecuted':
        logger.verbose('ProposalExecuted', llo(info))
        await ProposalHandler.proposalExecuted(event, info)
        break
      default:
        logger.error('Unhandled event', llo(info))
        break
    }
  },

  processError: async (error: any, network: NetworksEnum, plugin: Plugin) => {
    logger.error(
      'Error LogSpp',
      llo({
        error,
        network,
        plugin,
      }),
    )
  },
}
