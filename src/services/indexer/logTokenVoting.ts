import logger from '@logger'
import { Interface, type Log } from 'ethers'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { TokenVotingHandler } from '@services/indexer/handlers/tokenVotingHandler'
import { UtilsIndexer } from '@models/utils/indexer'
import { TokenVoting } from '@artifacts/TokenVoting'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogTokenVoting' })

export const LogTokenVoting = {
  events: ['VotingSettingsUpdated'],

  start: async () => {
    for (const networkName of Object.values(Network.NETWORKS)) {
      logger.verbose('Start LogTokenVoting', llo({ networkName }))

      const networkDb = await Models.Network.findByName(networkName as NetworksEnum)

      if (!networkDb) {
        logger.verbose('Unsupported Network', llo({ networkName }))
        return
      }

      const eventTopics = TokenVoting.abi
        .filter((item: any) => item.type && LogTokenVoting.events.includes(item.name))
        .map((event: any) => new Interface(TokenVoting.abi).getEvent(event.name)?.topicHash)

      const filter = {
        topics: eventTopics,
        fromBlock: networkDb.lastBlockTokenVoting,
        toBlock: 'latest',
      }

      const crawler = new BlockchainLogCrawler({
        network: networkName as NetworksEnum,
        filter,
        onLog: async (txLog: Log) => LogTokenVoting.processLog(txLog, networkName as NetworksEnum),
        onError: async (error: any) => LogTokenVoting.processError(error, networkName as NetworksEnum),
        stopOnError: true,
      })

      await crawler.crawl()
      await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockTokenVoting')
    }
    logger.verbose('Finish LogTokenVoting', llo())
  },

  processLog: async (txLog: any, network: NetworksEnum) => {
    const event = new Interface(TokenVoting.abi).parseLog(txLog)!

    switch (event.name) {
      case 'VotingSettingsUpdated':
        logger.verbose('VotingSettingsUpdated', llo({ event }))
        await TokenVotingHandler.votingSettingsUpdated(event, txLog, network)
        break
      default:
        logger.error('Unhandled event', llo({ event }))
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
