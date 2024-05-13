import logger from '@logger'
import { Interface, type Log } from 'ethers'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { MultisigHandler } from '@services/indexer/handlers/multisigHandler'
import { UtilsIndexer } from '@models/utils/indexer'
import { TokenVoting } from '@artifacts/TokenVoting'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogMultisig' })

export const LogMultisig = {
  events: ['MultisigSettingsUpdated'],

  start: async () => {
    for (const networkName of Object.values(Network.NETWORKS)) {
      logger.verbose('Start LogMultisig', llo({ networkName }))

      const networkDb = await Models.Network.findByName(networkName as NetworksEnum)

      if (!networkDb) {
        logger.verbose('Unsupported Network', llo({ networkName }))
        return
      }

      const eventTopics = TokenVoting.abi
        .filter((item: any) => item.type && LogMultisig.events.includes(item.name))
        .map((event: any) => new Interface(TokenVoting.abi).getEvent(event.name)?.topicHash)

      const filter = {
        topics: eventTopics,
        fromBlock: networkDb.lastBlockMultisig,
        toBlock: 'latest',
      }

      const crawler = new BlockchainLogCrawler({
        network: networkName as NetworksEnum,
        filter,
        onLog: async (txLog: Log) => LogMultisig.processLog(txLog, networkName as NetworksEnum),
        onError: async (error: any) => LogMultisig.processError(error, networkName as NetworksEnum),
        stopOnError: true,
      })

      await crawler.crawl()
      await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockMultisig')
    }
    logger.verbose('Finish LogMultisig', llo())
  },

  processLog: async (txLog: any, network: NetworksEnum) => {
    const event = new Interface(TokenVoting.abi).parseLog(txLog)!

    switch (event.name) {
      case 'MultisigSettingsUpdated':
        logger.verbose('MultisigSettingsUpdated', llo({ event }))
        await MultisigHandler.multisigSettingsUpdated(event, txLog, network)
        break
      default:
        logger.error('Unhandled event', llo({ event }))
        break
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error LogMultisig',
      llo({
        error,
        network,
      }),
    )
  },
}
