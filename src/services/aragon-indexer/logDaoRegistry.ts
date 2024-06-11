import logger from '@logger'
import { Interface, type Log } from 'ethers'
import { DAORegistry } from '@artifacts/daoRegistry'
import { IEnumIndexerService, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { DaoRegistryHandler } from '@services/aragon-indexer/handlers/daoRegistryHandler'
import Web3Helper from '@helpers/web3'
import { NetworkHelper } from '@helpers/network'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogDaoRegistry' })

export const LogDaoRegistry = {
  events: ['DAORegistered'],

  start: async () => {
    await Promise.all(
      NetworkHelper.supportedNetworks().map(async ({ networkName }) => {
        logger.verbose('Start LogDaoRegistry', llo({ networkName }))

        const eventTopics = DAORegistry.abi
          .filter((item: any) => item.type === 'event' && LogDaoRegistry.events.includes(item.name))
          .map((event: any) => new Interface(DAORegistry.abi).getEvent(event.name)?.topicHash)

        const filter = {
          topics: eventTopics,
        }

        const crawler = new BlockchainLogCrawler({
          network: networkName,
          filter,
          onLog: async (txLog: Log) => LogDaoRegistry.processLog(txLog, networkName as NetworksEnum),
          onError: async (error: any) => LogDaoRegistry.processError(error, networkName as NetworksEnum),
          logService: IEnumIndexerService.daoRegistryLog,
          stopOnError: true,
        })

        await crawler.crawl()
        logger.verbose('End LogDaoRegistry', llo({ networkName, latestBlockSync: crawler.crawlResult.lastSync }))
      }),
    )
  },

  processLog: async (txLog: Log, network: NetworksEnum) => {
    const iFace = new Interface(DAORegistry.abi)
    const event = Web3Helper.parseLog(txLog, iFace)
    if (!event) {
      return
    }
    const info = Web3Helper.parseInfoLog(txLog, event.name, network)

    switch (event.name) {
      case 'DAORegistered':
        logger.verbose('DAORegistered', llo(info))
        await DaoRegistryHandler.daoRegistered(event, info)
        break
      default:
        logger.error('Unhandled event', llo(info))
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
