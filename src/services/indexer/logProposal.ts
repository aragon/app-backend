import logger from '@logger'
import { ethers, Interface, type Log } from 'ethers'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { ProposalHandler } from '@services/indexer/handlers/proposalHandler'
import { UtilsIndexer } from '@models/utils/indexer'
import { TokenVoting } from '@artifacts/TokenVoting'
import { Multisig } from '@artifacts/Multisig'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogProposal' })

export const LogProposal = {
  events: ['Approved', 'ProposalCreated', 'ProposalExecuted', 'VoteCast'],

  start: async () => {
    const networks = Object.values(Network.NETWORKS)

    await Promise.all(
      networks.map(async networkName => {
        logger.verbose('Start LogProposal', llo({ networkName }))

        const networkDb = await Models.Network.findByName(networkName as NetworksEnum)

        if (!networkDb) {
          logger.warn('Unsupported Network', llo({ networkName }))
          return
        }

        const tokenVotingTopics = TokenVoting.abi
          .filter((item: any) => item.type && LogProposal.events.includes(item.name))
          .map((event: any) => new Interface(TokenVoting.abi).getEvent(event.name)?.topicHash)

        const multisigTopics = Multisig.abi
          .filter((item: any) => item.type && LogProposal.events.includes(item.name))
          .map((event: any) => new Interface(Multisig.abi).getEvent(event.name)?.topicHash)

        const filter = {
          topics: [...tokenVotingTopics, ...multisigTopics],
          fromBlock: networkDb.lastBlockProposal,
          toBlock: 'latest',
        }

        const crawler = new BlockchainLogCrawler({
          network: networkName as NetworksEnum,
          filter,
          onLog: async (txLog: Log) => LogProposal.processLog(txLog, networkName as NetworksEnum),
          onError: async (error: any) => LogProposal.processError(error, networkName as NetworksEnum),
          stopOnError: true,
        })

        await crawler.crawl()
        await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockProposal')
        logger.verbose('End LogProposal', llo({ networkName, latestBlockSync: crawler.crawlResult.latestBlockNumber }))
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

  processLog: async (txLog: any, network: NetworksEnum) => {
    const iFace = LogProposal.getInterface(txLog.topics[0])

    let event = null as any
    try {
      event = iFace.parseLog(txLog)!
    } catch (error: any) {
      if (error?.message.includes('out-of-bounds')) {
        return
      }
    }

    switch (event?.name) {
      case 'ProposalCreated':
        logger.verbose('ProposalCreated', llo({ eventName: event.name }))
        await ProposalHandler.proposalCreated(event, txLog, network)
        break
      case 'Approved':
        logger.verbose('Approved', llo({ eventName: event.name }))
        await ProposalHandler.approved(event, txLog, network)
        break
      case 'ProposalExecuted':
        logger.verbose('ProposalExecuted', llo({ eventName: event.name }))
        await ProposalHandler.proposalExecuted(event, txLog, network)
        break
      case 'VoteCast':
        logger.verbose('VoteCast', llo({ eventName: event.name }))
        await ProposalHandler.voteCast(event, txLog, network)
        break
      default:
        logger.error('Unhandled event', llo({ eventName: event.name }))
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
