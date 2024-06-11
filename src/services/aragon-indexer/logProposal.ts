import logger from '@logger'
import { ethers, Interface, type Log } from 'ethers'
import { IEnumIndexerService, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { ProposalHandler } from '@services/aragon-indexer/handlers/proposalHandler'
import { TokenVoting } from '@artifacts/TokenVoting'
import { Multisig } from '@artifacts/Multisig'
import Web3Helper from '@helpers/web3'
import { NetworkHelper } from '@helpers/network'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogProposal' })

export const LogProposal = {
  events: ['Approved', 'ProposalCreated', 'ProposalExecuted', 'VoteCast'],

  start: async () => {
    await Promise.all(
      NetworkHelper.supportedNetworks().map(async ({ networkName }) => {
        logger.verbose('Start LogProposal', llo({ networkName }))

        const tokenVotingTopics = TokenVoting.abi
          .filter((item: any) => item.type && LogProposal.events.includes(item.name))
          .map((event: any) => new Interface(TokenVoting.abi).getEvent(event.name)?.topicHash)

        const multisigTopics = Multisig.abi
          .filter((item: any) => item.type && LogProposal.events.includes(item.name))
          .map((event: any) => new Interface(Multisig.abi).getEvent(event.name)?.topicHash)

        const filter = {
          topics: [...tokenVotingTopics, ...multisigTopics],
        }

        const crawler = new BlockchainLogCrawler({
          network: networkName,
          filter,
          onLog: async (txLog: Log) => LogProposal.processLog(txLog, networkName),
          onError: async (error: any) => LogProposal.processError(error, networkName),
          logService: IEnumIndexerService.proposalLog,
          stopOnError: true,
        })

        await crawler.crawl()
        logger.verbose('End LogProposal', llo({ networkName, latestBlockSync: crawler.crawlResult.lastSync }))
      }),
    )
  },

  getInterface(topic: string) {
    const eventsOfTokenVoting = [
      ethers.id('ProposalCreated(uint256,address,uint64,uint64,bytes,(address,uint256,bytes)[],uint256)'),
      ethers.id('ProposalExecuted(uint256)'),
      ethers.id('VoteCast(uint256,address,uint8,uint256)'),
    ]

    return eventsOfTokenVoting.includes(topic) ? new Interface(TokenVoting.abi) : new Interface(Multisig.abi)
  },

  processLog: async (txLog: Log, network: NetworksEnum) => {
    const iFace = LogProposal.getInterface(txLog.topics[0])
    const event = Web3Helper.parseLog(txLog, iFace)
    if (!event) {
      return
    }
    const info = Web3Helper.parseInfoLog(txLog, event.name, network)

    switch (event?.name) {
      case 'ProposalCreated':
        logger.verbose('ProposalCreated', llo(info))
        await ProposalHandler.proposalCreated(event, info)
        break
      case 'Approved':
        logger.verbose('Approved', llo(info))
        await ProposalHandler.approved(event, info)
        break
      case 'ProposalExecuted':
        logger.verbose('ProposalExecuted', llo(info))
        await ProposalHandler.proposalExecuted(event, info)
        break
      case 'VoteCast':
        logger.verbose('VoteCast', llo(info))
        await ProposalHandler.voteCast(event, info)
        break
      default:
        logger.error('Unhandled event', llo(info))
        break
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error LogProposal',
      llo({
        error,
        network,
      }),
    )
  },
}
