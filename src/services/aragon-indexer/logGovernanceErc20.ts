import logger from '@logger'
import { Interface, type Log } from 'ethers'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import Web3Helper from '@helpers/web3'
import { ProxyToken } from '@modules/proxyToken'
import { GovernanceErc20Handler } from '@indexer/handlers/governanceErc20Handler'
import type Plugin from '@models/schema/plugin'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogGovernanceErc20' })

export const LogGovernanceErc20 = {
  events: ['Transfer', 'DelegateVotesChanged'],

  start: async (plugin: Plugin) => {
    logger.verbose('Start LogGovernanceErc20', llo({ network: plugin.network }))

    const tokenDb = await ProxyToken.saveAndGetToken(plugin.tokenAddress, plugin.network)

    const governanceTopics = GovernanceERC20.abi
      .filter((item: any) => item.type && LogGovernanceErc20.events.includes(item.name))
      .map((event: any) => new Interface(GovernanceERC20.abi).getEvent(event.name)?.topicHash)

    const filter = {
      address: plugin.tokenAddress,
      fromBlock: tokenDb?.blockNumber || 0,
      topics: [...governanceTopics],
    }

    const crawler = new BlockchainLogCrawler({
      network: plugin.network,
      filter,
      onLog: async (txLog: Log) => LogGovernanceErc20.processLog(txLog, plugin.network),
      onError: async (error: any) => LogGovernanceErc20.processError(error, plugin.network),
      logService: `Token-${plugin.network}-${plugin.tokenAddress}`,
      stopOnError: true,
    })

    await crawler.crawl()
    logger.verbose(
      'End LogGovernanceErc20',
      llo({
        network: plugin.network,
        latestBlockSync: crawler.crawlResult.lastSync,
      }),
    )
  },

  processLog: async (txLog: Log, network: NetworksEnum) => {
    const iFace = new Interface(GovernanceERC20.abi)
    const event = Web3Helper.parseLog(txLog, iFace)
    if (!event) {
      return
    }

    const info = Web3Helper.parseInfoLog(txLog, event.name, network)

    switch (event.name) {
      case 'Transfer':
        logger.verbose('Transfer', llo(info))
        await GovernanceErc20Handler.transfer(event, info)
        break
      case 'DelegateVotesChanged':
        logger.verbose('DelegateVotesChanged', llo(info))
        await GovernanceErc20Handler.delegateVotesChanged(event, info)
        break
      default:
        logger.error('Unhandled event', llo(info))
        break
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error LogGovernanceErc20',
      llo({
        error,
        network,
      }),
    )
  },
}
