import logger from '@logger'
import { Interface, type Log } from 'ethers'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import Web3Helper from '@helpers/web3'
import { TokenVoting } from '@artifacts/TokenVoting'
import type Plugin from '@models/schema/plugin'
import { ProposalHandler } from '@indexer/handlers/proposalHandler'
import { PluginSettingHandler } from '@indexer/handlers/pluginSettingHandler'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogTokenVoting' })

export const LogTokenVoting = {
  events: ['VoteCast', 'ProposalCreated', 'ProposalExecuted', 'VotingSettingsUpdated'],

  start: async (plugin: Plugin) => {
    logger.verbose('Start LogTokenVoting', llo({ network: plugin.network }))

    const governanceTopics = TokenVoting.abi
      .filter((item: any) => item.type && LogTokenVoting.events.includes(item.name))
      .map((event: any) => new Interface(TokenVoting.abi).getEvent(event.name)?.topicHash)

    const filter = {
      address: plugin.address,
      fromBlock: plugin?.blockNumber || 0,
      topics: [...governanceTopics],
    }

    const crawler = new BlockchainLogCrawler({
      network: plugin.network,
      filter,
      onLog: async (txLog: Log) => LogTokenVoting.processLog(txLog, plugin.network),
      onError: async (error: any) => LogTokenVoting.processError(error, plugin.network),
      logService: `TokenVoting-${plugin.network}-${plugin.tokenAddress}`,
      stopOnError: true,
    })

    await crawler.crawl()
    logger.verbose(
      'End LogTokenVoting',
      llo({ network: plugin.network, latestBlockSync: crawler.crawlResult.lastSync }),
    )
  },

  processLog: async (txLog: Log, network: NetworksEnum) => {
    const iFace = new Interface(TokenVoting.abi)
    const event = Web3Helper.parseLog(txLog, iFace)
    if (!event) {
      return
    }

    const info = Web3Helper.parseInfoLog(txLog, event.name, network)

    switch (event.name) {
      case 'VoteCast':
        logger.verbose('VoteCast', llo(info))
        await ProposalHandler.voteCast(event, info)
        break
      case 'ProposalCreated':
        logger.verbose('ProposalCreated', llo(info))
        await ProposalHandler.proposalCreated(event, info)
        break
      case 'ProposalExecuted':
        logger.verbose('ProposalExecuted', llo(info))
        await ProposalHandler.proposalExecuted(event, info)
        break
      case 'VotingSettingsUpdated':
        logger.verbose('VotingSettingsUpdated', llo(info))
        await PluginSettingHandler.votingSettingsUpdated(event, info)
        break
      default:
        logger.error('Unhandled event', llo(info))
        break
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error LogTokenVoting',
      llo({
        error,
        network,
      }),
    )
  },
}
