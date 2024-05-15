import logger from '@logger'
import { Interface, type Log } from 'ethers'
import Network from '@models/schema/network'
import { DAORegistry } from '@artifacts/daoRegistry'
import { Models } from '@dbModels'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { DaoRegistryHandler } from '@services/indexer/handlers/daoRegistryHandler'
import { UtilsIndexer } from '@models/utils/indexer'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogDaoRegistry' })

export const LogDaoRegistry = {
  events: ['DAORegistered'],

  start: async () => {
    for (const networkName of Object.values(Network.NETWORKS)) {
      logger.verbose('Start LogDaoRegistry', llo({ networkName }))

      const networkDb = await Models.Network.findByName(networkName as NetworksEnum)

      if (!networkDb) {
        logger.verbose('Unsupported Network', llo({ networkName }))
        return
      }

      const eventTopics = DAORegistry.abi
        .filter((item: any) => item.type === 'event' && LogDaoRegistry.events.includes(item.name))
        .map((event: any) => new Interface(DAORegistry.abi).getEvent(event.name)?.topicHash)

      const filter = {
        topics: eventTopics,
        fromBlock: networkDb.lastBlockDaoRegistry,
        toBlock: 'latest',
      }

      const crawler = new BlockchainLogCrawler({
        network: networkName as NetworksEnum,
        filter,
        onLog: async (txLog: Log) => LogDaoRegistry.processLog(txLog, networkName as NetworksEnum),
        onError: async (error: any) => LogDaoRegistry.processError(error, networkName as NetworksEnum),
        stopOnError: true,
      })

      await crawler.crawl()
      await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockDaoRegistry')
    }
    logger.verbose('Finish DaoLogs', llo())
  },

  processLog: async (txLog: any, network: NetworksEnum) => {
    const iFace = new Interface(DAORegistry.abi)
    let event = null as any
    try {
      event = iFace.parseLog(txLog)!
    } catch (error: any) {
      if (error?.message.includes('out-of-bounds')) {
        return
      }
    }

    switch (event.name) {
      case 'DAORegistered':
        logger.verbose('DAORegistered', llo({ event }))
        await DaoRegistryHandler.daoRegistered(event, txLog, network)
        break
      default:
        logger.error('Unhandled event', llo({ event }))
        break
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error LogDaoRegistry',
      llo({
        error,
        network,
      }),
    )
  },
}
