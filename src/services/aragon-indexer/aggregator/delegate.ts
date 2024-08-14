import logger from '@logger'
import ethers, { Interface, type Log } from 'ethers'
import {HexAddress, IEnumIndexerService, NetworksEnum} from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import Web3Helper from "@helpers/web3";
import Etherscan from "@helpers/etherscan";

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorMember' })

export const AggregatorDelegate = {

  async delegate({ network, tokenAddress }) {
    const governanceTopics = GovernanceERC20.abi
      .filter((item: any) => item.type && ['DelegateChanged', 'DelegateVotesChanged'].includes(item.name))
      .map((event: any) => new Interface(GovernanceERC20.abi).getEvent(event.name)?.topicHash)

    const filter = {
      address: tokenAddress,
      fromBlock: 0,
      topics: [governanceTopics],
    }

    const crawler = new BlockchainLogCrawler({
      network: network,
      filter,
      onLog: async (txLog: Log) => AggregatorDelegate.processLog(txLog, network),
      onError: async (error: any) => AggregatorDelegate.processError(error, network),
      logService: `delegateToken-${tokenAddress}`,
      stopOnError: true,
    })

    await crawler.crawl()
  },

  processLog: async (txLog: Log, network: NetworksEnum) => {

    const iFace = new Interface(GovernanceERC20.abi)
    const event = Web3Helper.parseLog(txLog, iFace)
    if (!event) {
      return
    }

  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error Delegate',
      llo({
        error,
        network,
      }),
    )
  },

}
