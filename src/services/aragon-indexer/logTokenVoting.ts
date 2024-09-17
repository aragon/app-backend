import logger from '@logger'
import { ethers, Interface, type Log } from 'ethers'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import Web3Helper from '@helpers/web3'
import { TokenVoting } from '@artifacts/TokenVoting'
import type Plugin from '@models/schema/plugin'
import { ProposalHandler } from '@indexer/handlers/proposalHandler'
import { PluginSettingHandler } from '@indexer/handlers/pluginSettingHandler'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { GovernanceErc20Handler } from '@indexer/handlers/governanceErc20Handler'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogTokenVoting' })

export const LogTokenVoting = {
  eventsTokenVoting: ['VoteCast', 'ProposalCreated', 'ProposalExecuted', 'VotingSettingsUpdated'],
  eventsGovernanceErc20: ['Transfer', 'DelegateVotesChanged'],

  start: async (plugin: Plugin) => {
    logger.verbose('Start LogTokenVoting', llo({ network: plugin.network, pluginAddress: plugin.address }))

    const tokenVotingTopics = TokenVoting.abi
      .filter((item: any) => item.type && LogTokenVoting.eventsTokenVoting.includes(item.name))
      .map((event: any) => new Interface(TokenVoting.abi).getEvent(event.name)?.topicHash)

    const governanceErc20Topics = GovernanceERC20.abi
      .filter((item: any) => item.type && LogTokenVoting.eventsGovernanceErc20.includes(item.name))
      .map((event: any) => new Interface(GovernanceERC20.abi).getEvent(event.name)?.topicHash)

    /**
     * Looking events for both plugin and token with one filter
     */

    const filter = {
      address: [plugin.address, plugin.tokenAddress],
      fromBlock: plugin?.blockNumber || 0,
      topics: [...governanceErc20Topics, ...tokenVotingTopics],
    }

    const crawler = new BlockchainLogCrawler({
      network: plugin.network,
      filter,
      onLog: async (txLog: Log) => LogTokenVoting.processLog(txLog, plugin.network, plugin),
      onError: async (error: any) => LogTokenVoting.processError(error, plugin.network, plugin),
      logService: `TokenVoting-${plugin.network}-${plugin.tokenAddress}`,
      stopOnError: true,
    })

    await crawler.crawl()
    logger.verbose(
      'End LogTokenVoting',
      llo({ network: plugin.network, latestBlockSync: crawler.crawlResult.lastSync }),
    )
  },

  getInterface(topic: string) {
    const eventsOfGovernanceErc20 = [
      ethers.id('Transfer(address,address,uint256)'),
      ethers.id('DelegateVotesChanged(address,uint256,uint256)'),
    ]

    return eventsOfGovernanceErc20.includes(topic) ? new Interface(GovernanceERC20.abi) : new Interface(TokenVoting.abi)
  },

  processLog: async (txLog: Log, network: NetworksEnum, plugin?: Plugin) => {
    const iFace = LogTokenVoting.getInterface(txLog.topics[0])
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
      case 'Transfer':
        logger.verbose('Transfer', llo(info))
        await GovernanceErc20Handler.transfer(event, info, plugin)
        break
      case 'DelegateVotesChanged':
        logger.verbose('DelegateVotesChanged', llo(info))
        await GovernanceErc20Handler.delegateVotesChanged(event, info, plugin)
        break
      default:
        logger.error('Unhandled event', llo(info))
        break
    }
  },

  processError: async (error: any, network: NetworksEnum, plugin: Plugin) => {
    logger.error(
      'Error LogTokenVoting',
      llo({
        error,
        network,
        plugin,
      }),
    )
  },
}
